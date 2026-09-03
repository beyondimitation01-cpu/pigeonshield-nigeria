import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { ngn } from "@/lib/pigeon-data";
import { toast } from "sonner";

export function AdminPayoutQueue() {
  const { db, markSellerPaid } = useStore();
  const [reference, setReference] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const paid = useMemo(
    () => db.transactions.filter((t) => t.status === "Seller Paid" && t.payout_paid_at).slice(0, 20),
    [db.transactions],
  );

  const ready = useMemo(
    () =>
      db.transactions.filter(
        (t) => (t.status === "Ready for Admin Payout" || t.status === "Delivered") && !t.payout_paid_at,
      ),
    [db.transactions],
  );

  async function markPaid(txId: string, amount: number) {
    const ok = window.confirm(`Confirm that you manually paid this seller ${ngn(amount)}?`);
    if (!ok) return;
    setBusyId(txId);
    try {
      await markSellerPaid(txId, reference[txId], notes[txId]);
      toast.success("Seller marked paid. The transaction has left the payout queue.");
      setReference((prev) => ({ ...prev, [txId]: "" }));
      setNotes((prev) => ({ ...prev, [txId]: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark seller paid.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card id="ready-for-payout" className="scroll-mt-6 overflow-hidden border-primary/30">
      <div className="border-b border-border bg-primary/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Banknote className="size-5 text-primary" /> READY FOR PAYOUT
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manually send the seller's payout through OPay first. This website never transfers the money.
            </p>
          </div>
          <Badge variant={ready.length ? "default" : "outline"}>{ready.length} waiting</Badge>
        </div>
      </div>

      <div className="divide-y divide-border">
        {ready.length === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle2 className="mx-auto size-8 text-primary" />
            <p className="mt-2 font-medium">No payouts waiting</p>
            <p className="mt-1 text-sm text-muted-foreground">Transactions become eligible here only after receipt confirmation.</p>
          </div>
        ) : (
          ready.map((t) => {
            const seller = db.users.find((u) => u.id === t.breeder_id);
            const buyer = db.users.find((u) => u.id === t.buyer_id);
            const payoutAmount = Math.max(0, t.amount_naira - t.calculated_commission);
            return (
              <div id={`transaction-${t.id}`} key={t.id} className="space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{t.listing_name}</p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Order {t.id}</p>
                  </div>
                  <Badge>{t.status === "Delivered" ? "READY FOR ADMIN PAYOUT" : t.status}</Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="Buyer" value={buyer?.real_name || buyer?.public_handle || t.buyer_id} />
                  <Info label="Seller" value={seller?.real_name || seller?.public_handle || t.breeder_id} />
                  <Info label="Buyer paid" value={ngn(t.amount_naira)} />
                  <Info label="Platform fee" value={ngn(t.calculated_commission)} />
                  <Info label="Amount to pay seller" value={ngn(payoutAmount)} emphasis />
                  <Info label="Payment date" value={new Date(t.created_at).toLocaleString("en-NG")} />
                  <Info label="Buyer confirmation" value={t.status === "Ready for Admin Payout" ? "Confirmed" : "Previously delivered"} />
                  <Info label="Payment reference" value={t.payment_reference || "—"} />
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <p className="font-semibold">Seller payout details</p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Info label="Account name" value={seller?.real_name || "—"} />
                    <Info label="Bank / provider" value={seller?.bank_name || "—"} />
                    <Info label="Account number" value={seller?.account_number || "—"} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    These details are loaded from the protected profile record and are shown only inside the admin console.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={`payout-ref-${t.id}`}>OPay/payment reference (optional)</Label>
                    <Input
                      id={`payout-ref-${t.id}`}
                      value={reference[t.id] ?? ""}
                      maxLength={255}
                      placeholder="Enter the manual transfer reference"
                      onChange={(e) => setReference((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`payout-note-${t.id}`}>Admin notes (optional)</Label>
                    <Textarea
                      id={`payout-note-${t.id}`}
                      value={notes[t.id] ?? ""}
                      maxLength={2000}
                      rows={1}
                      placeholder="Optional payout note"
                      onChange={(e) => setNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    disabled={busyId === t.id}
                    onClick={() => void markPaid(t.id, payoutAmount)}
                    className="min-h-10"
                  >
                    <Banknote className="size-4" /> {busyId === t.id ? "Saving…" : "MARK SELLER PAID"}
                  </Button>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>Manually complete the OPay transfer before clicking this button. Clicking it only records the payout; it does not move money.</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border">
        <div className="flex items-center justify-between gap-3 p-5">
          <div>
            <h3 className="font-semibold">Seller payout history</h3>
            <p className="mt-1 text-xs text-muted-foreground">Recent manual payouts recorded after the OPay transfer was completed.</p>
          </div>
          <Badge variant="outline">{paid.length} recent</Badge>
        </div>
        {paid.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No seller payouts recorded yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {paid.map((t) => {
              const seller = db.users.find((u) => u.id === t.breeder_id);
              const admin = db.users.find((u) => u.id === t.payout_paid_by);
              return (
                <div key={t.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-medium">{t.listing_name}</p>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">Order {t.id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Seller: {seller?.real_name || seller?.public_handle || t.breeder_id} · Paid by: {admin?.real_name || admin?.public_handle || t.payout_paid_by}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.payout_paid_at ? new Date(t.payout_paid_at).toLocaleString("en-NG") : "—"} · Ref: {t.payout_reference || "—"}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-primary">{ngn(Math.max(0, t.amount_naira - t.calculated_commission))}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words ${emphasis ? "text-lg font-bold text-primary" : "text-sm font-medium"}`}>{value}</p>
    </div>
  );
}
