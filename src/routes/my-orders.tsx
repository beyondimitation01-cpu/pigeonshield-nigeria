import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Timer, FileImage, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ConfirmActionDialog } from "@/components/site/ConfirmActionDialog";
import { AUTO_RELEASE_HOURS, ngn, type EscrowTransaction, type TxStatus, type DisputeStatus } from "@/lib/pigeon-data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/my-orders")({
  head: () => ({
    meta: [
      { title: "My Escrow Orders — Delivery & DOA Claims" },
      { name: "description", content: "Track escrow orders, dispatch with a seller PIN, confirm receipt, or file a Dead on Arrival dispute." },
      { property: "og:title", content: "My Escrow Orders — PigeonShield Nigeria" },
      { property: "og:description", content: "Confirm delivery, reveal the pickup PIN and raise DOA disputes." },
    ],
  }),
  component: GuardedMyOrders,
});

const TERMINAL_STATUSES: TxStatus[] = ["Seller Paid", "Completed", "Refunded to Buyer"];
const HISTORY_PREVIEW_SIZE = 5;
const HISTORY_FETCH_SIZE = HISTORY_PREVIEW_SIZE + 1;
const TRANSACTION_SELECT = "id, listing_id, listing_name, buyer_id, breeder_id, amount_naira, calculated_commission, delivery_marked_at, auto_release_at, driver_phone, waybill_image_url, proof_file_name, dispute_status, status, payment_reference, receipt_url, receipt_uploaded_at, payout_paid_at, payout_paid_by, payout_reference, payout_notes, created_at";

function mapTransaction(row: Record<string, unknown>, pin: string | null = null): EscrowTransaction {
  const toMs = (value: unknown) => (value ? new Date(String(value)).getTime() : 0);
  return {
    id: String(row["id"]), listing_id: row["listing_id"] ? String(row["listing_id"]) : "", listing_name: String(row["listing_name"] ?? ""), buyer_id: String(row["buyer_id"]), breeder_id: row["breeder_id"] ? String(row["breeder_id"]) : "", amount_naira: Number(row["amount_naira"] ?? 0), calculated_commission: Number(row["calculated_commission"] ?? 0), verification_pin: pin, delivery_marked_at: toMs(row["delivery_marked_at"]), auto_release_at: toMs(row["auto_release_at"]), driver_phone: (row["driver_phone"] as string | null) ?? null, waybill_image_url: (row["waybill_image_url"] as string | null) ?? null, proof_file_name: (row["proof_file_name"] as string | null) ?? null, dispute_status: String(row["dispute_status"] ?? "None") as DisputeStatus, status: String(row["status"]) as TxStatus, payment_reference: (row["payment_reference"] as string | null) ?? null, receipt_url: (row["receipt_url"] as string | null) ?? null, receipt_uploaded_at: row["receipt_uploaded_at"] ? toMs(row["receipt_uploaded_at"]) : null, payout_paid_at: row["payout_paid_at"] ? toMs(row["payout_paid_at"]) : null, payout_paid_by: (row["payout_paid_by"] as string | null) ?? null, payout_reference: (row["payout_reference"] as string | null) ?? null, payout_notes: (row["payout_notes"] as string | null) ?? null, created_at: toMs(row["created_at"]),
  };
}

function OrderCard({ tx, side, onChanged }: { tx: EscrowTransaction; side: "buyer" | "breeder"; onChanged: () => Promise<void> }) {
  const { dispatchOrder, confirmReceiptAndRevealPin, reportDOA, submitBreederProof } = useStore();
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [driver, setDriver] = useState("");
  const [waybill, setWaybill] = useState("");
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{tx.listing_name}</p><p className="text-xs text-muted-foreground">{tx.id}</p></div><Badge variant={tx.status === "Disputed" ? "destructive" : "default"}>{tx.status}</Badge></div>
      <p className="text-lg font-bold text-primary">{ngn(tx.amount_naira)}</p>
      {tx.dispute_status !== "None" ? <p className="text-sm font-medium text-destructive">{tx.dispute_status}</p> : null}
      {side === "breeder" && tx.status === "Escrow Funded" ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-primary"><Truck className="size-4" /> Ready for dispatch</p><p className="mt-1 text-xs text-muted-foreground">Dispatch the order to generate the seller handover PIN.</p><ConfirmActionDialog title="Confirm Dispatch" description="Are you sure you want to dispatch this order? This will move the transaction into transit and generate the seller handover PIN." confirmLabel="Confirm Dispatch" destructive={false} onConfirm={async () => { setDispatching(true); try { await dispatchOrder(tx.id); toast.success("Order dispatched. Give the PIN to the driver."); await onChanged(); return true; } catch (error) { toast.error(error instanceof Error ? error.message : "Could not dispatch order."); return false; } finally { setDispatching(false); } }}><Button size="sm" className="mt-3" disabled={dispatching}>{dispatching ? "Dispatching…" : "Dispatch order"}</Button></ConfirmActionDialog></div> : null}
      {side === "breeder" && tx.verification_pin && (tx.status === "In Transit" || tx.status === "Ready for Admin Payout") ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3"><p className="text-sm font-semibold text-primary">Driver handover PIN</p><p className="mt-1 font-mono text-3xl font-bold tracking-[0.35em]">{tx.verification_pin}</p><p className="mt-1 text-xs text-muted-foreground">Give this 4-digit PIN to your transport driver via SMS or a paper note.</p></div> : null}
      {side === "buyer" && (tx.status === "In Transit" || tx.status === "Ready for Admin Payout" || tx.status === "Delivered") ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3"><p className="text-sm font-semibold text-primary">Ready for collection</p>{revealedPin || tx.verification_pin ? <><p className="mt-2 font-mono text-4xl font-bold tracking-[0.35em]">{revealedPin ?? tx.verification_pin}</p><p className="mt-2 text-sm text-muted-foreground">Show or read this 4-digit PIN to the driver to collect your pigeon.</p></> : <ConfirmActionDialog title="Confirm Receipt" description="Are you sure you have received the pigeon and want to confirm receipt? This will mark delivery confirmed and reveal the pickup PIN." confirmLabel="Confirm Receipt & Reveal PIN" destructive={false} onConfirm={async () => { try { const pin = await confirmReceiptAndRevealPin(tx.id); setRevealedPin(pin); toast.success("Receipt confirmed. Pickup PIN revealed."); await onChanged(); return true; } catch (error) { toast.error(error instanceof Error ? error.message : "Could not confirm receipt."); return false; } }}><Button size="sm" className="mt-3">Confirm Receipt &amp; Reveal Pickup PIN</Button></ConfirmActionDialog>}</div> : null}
      {tx.status === "Escrow Funded" ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Timer className="size-3" /> Payment remains held while this order moves through the {AUTO_RELEASE_HOURS}h protection window. Seller payout is always manual.</p> : null}
      {side === "buyer" && tx.status === "Escrow Funded" ? <div className="flex flex-wrap gap-2"><ConfirmActionDialog title="Confirm Dead on Arrival Report" description="Are you sure this animal is dead on arrival and you want to open a DOA report? This will halt the auto-release clock for admin review." confirmLabel="Confirm DOA Report" onConfirm={async () => { try { await reportDOA(tx.id, "doa_proof_video.mp4"); toast.error("DOA reported. Auto-release clock halted for admin review."); await onChanged(); return true; } catch (error) { toast.error(error instanceof Error ? error.message : "Could not report DOA."); return false; } }}><Button size="sm" variant="destructive"><AlertTriangle className="size-4" /> Report Dead on Arrival</Button></ConfirmActionDialog></div> : null}
      {side === "breeder" && tx.status === "Disputed" ? <div className="space-y-2 rounded-md border border-border p-3"><p className="flex items-center gap-2 text-sm font-semibold"><FileImage className="size-4" /> Submit delivery proof</p><Input placeholder="Driver phone number" value={driver} onChange={(e) => setDriver(e.target.value)} /><Input placeholder="Waybill image reference" value={waybill} onChange={(e) => setWaybill(e.target.value)} /><Button size="sm" disabled={!driver || !waybill} onClick={async () => { try { await submitBreederProof(tx.id, driver, waybill); toast.success("Proof submitted for admin review."); await onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit delivery proof."); } }}>Escalate to admin</Button></div> : null}
    </Card>
  );
}

function MyOrders() {
  const authed = useRequireAuth("My Orders area");
  const { user, authReady } = useStore();
  const [purchases, setPurchases] = useState<EscrowTransaction[]>([]);
  const [sales, setSales] = useState<EscrowTransaction[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<EscrowTransaction[]>([]);
  const [salesHistory, setSalesHistory] = useState<EscrowTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!user) { setPurchases([]); setSales([]); setPurchaseHistory([]); setSalesHistory([]); return; }
    setLoading(true);
    try {
      const activeQuery = supabase.from("transactions").select(TRANSACTION_SELECT).not("status", "in", `(${TERMINAL_STATUSES.map((status) => `"${status}"`).join(",")})`).or(`buyer_id.eq.${user.id},breeder_id.eq.${user.id}`).order("created_at", { ascending: false });
      const [activeResult, purchaseHistoryResult, salesHistoryResult] = await Promise.all([
        activeQuery,
        supabase.rpc("get_transaction_history_page", { _direction: "purchase", _limit: HISTORY_FETCH_SIZE, _offset: 0 }),
        supabase.rpc("get_transaction_history_page", { _direction: "sale", _limit: HISTORY_FETCH_SIZE, _offset: 0 }),
      ]);
      if (activeResult.error) throw activeResult.error;
      if (purchaseHistoryResult.error) throw purchaseHistoryResult.error;
      if (salesHistoryResult.error) throw salesHistoryResult.error;
      const { data: visiblePins } = await supabase.rpc("get_visible_handover_pins");
      const pinMap = new Map<string, string>();
      for (const row of (visiblePins ?? []) as Record<string, unknown>[]) if (row["transaction_id"] && typeof row["verification_pin"] === "string") pinMap.set(String(row["transaction_id"]), String(row["verification_pin"]));
      const active = ((activeResult.data ?? []) as Record<string, unknown>[]).map((row) => mapTransaction(row, pinMap.get(String(row["id"])) ?? null));
      const purchaseHistoryRows = ((purchaseHistoryResult.data ?? []) as Record<string, unknown>[]).map((row) => mapTransaction(row));
      const salesHistoryRows = ((salesHistoryResult.data ?? []) as Record<string, unknown>[]).map((row) => mapTransaction(row));
      setPurchases(active.filter((tx) => tx.buyer_id === user.id));
      setSales(active.filter((tx) => tx.breeder_id === user.id));
      setPurchaseHistory(purchaseHistoryRows.slice(0, HISTORY_PREVIEW_SIZE));
      setSalesHistory(salesHistoryRows.slice(0, HISTORY_PREVIEW_SIZE));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load your transactions."); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!authReady || !authed) return;
    void loadTransactions();
    const channel = supabase.channel(`my-orders-${user?.id ?? "guest"}`).on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => { void loadTransactions(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [authReady, authed, loadTransactions, user?.id]);

  if (!authReady) return <AuthPending />;
  if (!authed || !user) return <AuthRequired title="My Orders" description="Log in to view your escrow orders." />;
  return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-3xl font-bold tracking-tight">My Orders</h1><p className="mt-1 text-muted-foreground">Escrow-protected purchases and sales.</p><section className="mt-8"><h2 className="text-lg font-semibold">Purchases ({purchases.length})</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{loading && purchases.length === 0 ? <p className="text-sm text-muted-foreground">Loading active purchases…</p> : purchases.length === 0 ? <p className="text-sm text-muted-foreground">No active purchases.</p> : purchases.map((t) => <OrderCard key={t.id} tx={t} side="buyer" onChanged={loadTransactions} />)}</div></section><section className="mt-10"><h2 className="text-lg font-semibold">Sales ({sales.length})</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{loading && sales.length === 0 ? <p className="text-sm text-muted-foreground">Loading active sales…</p> : sales.length === 0 ? <p className="text-sm text-muted-foreground">No active sales.</p> : sales.map((t) => <OrderCard key={t.id} tx={t} side="breeder" onChanged={loadTransactions} />)}</div></section><section className="mt-10 border-t border-border pt-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Transaction History</h2><p className="mt-1 text-sm text-muted-foreground">Your recent completed and refunded transactions are shown here. Older records remain available in the full history.</p></div><Button asChild variant="outline" size="sm"><Link to="/transaction-history">View full history <ArrowRight className="size-4" /></Link></Button></div><div className="mt-4 grid gap-6 md:grid-cols-2"><HistoryList title="Purchases" rows={purchaseHistory} /><HistoryList title="Sales" rows={salesHistory} /></div></section></main>;
}

function HistoryList({ title, rows }: { title: string; rows: EscrowTransaction[] }) {
  return <div className="rounded-lg border border-border/70 bg-card p-4"><h3 className="font-medium">{title}</h3><div className="mt-3 space-y-2">{rows.length === 0 ? <p className="text-sm text-muted-foreground">No completed transactions.</p> : rows.map((tx) => <div key={tx.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{tx.listing_name}</p><p className="text-xs text-muted-foreground">{tx.id}</p></div><div className="shrink-0 text-right"><p className="font-semibold">{ngn(tx.amount_naira)}</p><Badge variant="outline" className="mt-1">{tx.status}</Badge></div></div>)}</div></div>;
}

function GuardedMyOrders() { return <ProtectedRoute title="My Orders" description="Log in to view your escrow orders."><MyOrders /></ProtectedRoute>; }
