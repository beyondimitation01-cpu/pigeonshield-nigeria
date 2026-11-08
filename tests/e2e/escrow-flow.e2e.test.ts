/**
 * End-to-end tests for the escrow purchase flow, run against the real Supabase backend.
 *
 * Required env vars (tests are skipped when any is missing):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 *   E2E_BUYER_EMAIL,  E2E_BUYER_PASSWORD
 *   E2E_SELLER_EMAIL, E2E_SELLER_PASSWORD
 *   E2E_ADMIN_EMAIL,  E2E_ADMIN_PASSWORD   (account with the admin role)
 *
 * Run: bunx vitest run tests/e2e
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const env = process.env;
const URL = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
const creds = {
  buyer: [env.E2E_BUYER_EMAIL, env.E2E_BUYER_PASSWORD],
  seller: [env.E2E_SELLER_EMAIL, env.E2E_SELLER_PASSWORD],
  admin: [env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD],
} as const;
const ready = Boolean(URL && KEY && Object.values(creds).every(([e, p]) => e && p));

type Client = SupabaseClient;
async function signIn([email, password]: readonly (string | undefined)[]): Promise<{ c: Client; id: string }> {
  const c = createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: email!, password: password! });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { c, id: data.user.id };
}

describe.skipIf(!ready)("escrow purchase flow (e2e)", () => {
  let buyer: { c: Client; id: string };
  let seller: { c: Client; id: string };
  let admin: { c: Client; id: string };
  let listingId: string;

  beforeAll(async () => {
    [buyer, seller, admin] = await Promise.all([signIn(creds.buyer), signIn(creds.seller), signIn(creds.admin)]);
    const now = Date.now();
    const { data, error } = await seller.c.from("listings").insert({
      category_type: "Pigeons", breeder_id: seller.id, breeder_handle: "e2e-seller",
      custom_bird_name: `E2E Bird ${now}`, breed_type: "Racing Homer", gender: "Cock",
      price_ngn: 25000, images: [], vaccinated: true, state: "Lagos", description: "E2E test listing",
      batch_quantity: 1, is_active: true, creation_timestamp: new Date(now).toISOString(),
      expiry_date: new Date(now + 7 * 86400_000).toISOString(),
    } as never).select("id").single();
    if (error || !data) throw new Error(`Could not create test listing: ${error?.message}`);
    listingId = (data as { id: string }).id;
  }, 30_000);

  async function purchase(): Promise<string> {
    const now = Date.now();
    const { data, error } = await buyer.c.from("transactions").insert({
      listing_id: listingId, listing_name: "E2E Bird", buyer_id: buyer.id, breeder_id: seller.id,
      amount_naira: 25000, calculated_commission: 3000, delivery_marked_at: new Date(now).toISOString(),
      auto_release_at: new Date(now + 72 * 3600_000).toISOString(), status: "Pending Verification",
      payment_reference: `E2E-${now}`, receipt_url: "https://example.com/receipt.jpg",
      receipt_uploaded_at: new Date(now).toISOString(),
    } as never).select("id").single();
    if (error || !data) throw new Error(`Purchase failed: ${error?.message}`);
    return (data as { id: string }).id;
  }
  const status = async (txId: string) => {
    const { data } = await admin.c.from("transactions").select("status, dispute_status").eq("id", txId).single();
    return data as { status: string; dispute_status: string };
  };

  it("a new purchase waits for payment verification", async () => {
    const tx = await purchase();
    expect((await status(tx)).status).toBe("Pending Verification");
  });

  it("only an admin can verify payment and fund escrow", async () => {
    const tx = await purchase();
    const { error: buyerErr } = await buyer.c.rpc("verify_payment", { _transaction_id: tx });
    expect(buyerErr).not.toBeNull();
    const { error } = await admin.c.rpc("verify_payment", { _transaction_id: tx });
    expect(error).toBeNull();
    expect((await status(tx)).status).toBe("Escrow Funded");
  });

  it("seller cannot dispatch before payment is verified", async () => {
    const tx = await purchase();
    const { error } = await seller.c.rpc("dispatch_transaction", { _transaction_id: tx });
    expect(error?.message).toMatch(/not available for dispatch/i);
  });

  it("pickup verification: dispatch issues a 4-digit PIN that the buyer reveals on receipt", async () => {
    const tx = await purchase();
    await admin.c.rpc("verify_payment", { _transaction_id: tx });

    const { error: buyerDispatch } = await buyer.c.rpc("dispatch_transaction", { _transaction_id: tx });
    expect(buyerDispatch).not.toBeNull(); // only the seller can dispatch

    const { data: pin, error } = await seller.c.rpc("dispatch_transaction", { _transaction_id: tx });
    expect(error).toBeNull();
    expect(pin).toMatch(/^\d{4}$/);
    expect((await status(tx)).status).toBe("In Transit");

    const { error: sellerConfirm } = await seller.c.rpc("confirm_receipt_and_reveal_pin", { _transaction_id: tx });
    expect(sellerConfirm).not.toBeNull(); // only the buyer can confirm receipt

    const { data: revealed, error: confirmErr } = await buyer.c.rpc("confirm_receipt_and_reveal_pin", { _transaction_id: tx });
    expect(confirmErr).toBeNull();
    expect(revealed).toBe(pin);
    expect((await status(tx)).status).toBe("Ready for Admin Payout");

    const { error: again } = await buyer.c.rpc("confirm_receipt_and_reveal_pin", { _transaction_id: tx });
    expect(again).not.toBeNull(); // cannot confirm twice

    const { error: payErr } = await admin.c.rpc("mark_seller_paid", { _transaction_id: tx, _payout_reference: "E2E-PAYOUT" });
    expect(payErr).toBeNull();
    expect((await status(tx)).status).toBe("Seller Paid");
  });

  it("buyer cannot confirm receipt before the seller dispatches", async () => {
    const tx = await purchase();
    await admin.c.rpc("verify_payment", { _transaction_id: tx });
    const { error } = await buyer.c.rpc("confirm_receipt_and_reveal_pin", { _transaction_id: tx });
    expect(error).not.toBeNull();
  });

  it("dead on arrival: buyer report freezes escrow, seller can submit proof, admin refunds buyer", async () => {
    const tx = await purchase();
    await admin.c.rpc("verify_payment", { _transaction_id: tx });

    const { error: sellerDoa } = await seller.c.rpc("report_transaction_doa", { _transaction_id: tx, _proof_file_name: "x.jpg" });
    expect(sellerDoa).not.toBeNull(); // only the buyer can report DOA

    const { error } = await buyer.c.rpc("report_transaction_doa", { _transaction_id: tx, _proof_file_name: "dead-bird.jpg" });
    expect(error).toBeNull();
    expect(await status(tx)).toEqual({ status: "Disputed", dispute_status: "Disputed: Dead on Arrival" });

    const { error: payErr } = await admin.c.rpc("mark_seller_paid", { _transaction_id: tx });
    expect(payErr).not.toBeNull(); // disputed funds cannot be paid out

    const { error: proofErr } = await seller.c.rpc("submit_breeder_delivery_proof", {
      _transaction_id: tx, _driver_phone: "08030000000", _waybill: "https://example.com/waybill.jpg",
    });
    expect(proofErr).toBeNull();
    expect((await status(tx)).dispute_status).toBe("Under Review: Proof Submitted");

    const { error: refundErr } = await admin.c.from("transactions")
      .update({ status: "Refunded to Buyer", dispute_status: "None" } as never).eq("id", tx);
    expect(refundErr).toBeNull();
    expect(await status(tx)).toEqual({ status: "Refunded to Buyer", dispute_status: "None" });
  });

  it("DOA cannot be reported after the buyer confirmed receipt", async () => {
    const tx = await purchase();
    await admin.c.rpc("verify_payment", { _transaction_id: tx });
    await seller.c.rpc("dispatch_transaction", { _transaction_id: tx });
    await buyer.c.rpc("confirm_receipt_and_reveal_pin", { _transaction_id: tx });
    const { error } = await buyer.c.rpc("report_transaction_doa", { _transaction_id: tx, _proof_file_name: "late.jpg" });
    expect(error).not.toBeNull();
  });
});
