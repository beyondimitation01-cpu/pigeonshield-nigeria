import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { ngn, type EscrowTransaction } from "@/lib/pigeon-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/site/ConfirmActionDialog";

const PAYOUT_SELECT = "id, listing_name, buyer_id, breeder_id, amount_naira, calculated_commission, status, payment_reference, created_at, payout_paid_at, payout_paid_by, payout_reference, payout_notes";
const PAGE_SIZE = 20;
type View = "queue" | "history";
type PayoutHistoryRow = EscrowTransaction & { buyer_id: string; breeder_id: string };

export function AdminPayoutQueue() {
  const { db, markSellerPaid } = useStore();
  const [view, setView] = useState<View>("queue");
  const [reference, setReference] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ready, setReady] = useState<EscrowTransaction[]>([]);
  const [paid, setPaid] = useState<PayoutHistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const searchableUserIds = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return [];
    return db.users
      .filter((user) => [user.id, user.real_name, user.public_handle].some((value) => value?.toLocaleLowerCase().includes(clean)))
      .map((user) => user.id);
  }, [db.users, query]);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: readyRows, error: readyError } = await supabase
        .from("transactions")
        .select(PAYOUT_SELECT)
        .in("status", ["Ready for Admin Payout", "Delivered"])
        .is("payout_paid_at", null)
        .order("created_at", { ascending: true });
      if (readyError) throw readyError;
      setReady((readyRows ?? []) as unknown as EscrowTransaction[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load payout queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (view !== "history") return;
    setLoading(true);
    try {
      const clean = query.trim().replace(/[\\%_(),]/g, (char) => `\\${char}`);
      let request = supabase
        .from("transactions")
        .select(PAYOUT_SELECT, { count: "exact" })
        .not("payout_paid_at", "is", null);

      if (clean) {
        const clauses = [`id.ilike.%${clean}%`, `listing_name.ilike.%${clean}%`, `payout_reference.ilike.%${clean}%`];
        if (searchableUserIds.length) {
          const ids = searchableUserIds.map((id) => id.replace(/[\\(),]/g, (char) => `\\${char}`)).join(",");
          clauses.push(`buyer_id.in.(${ids})`, `breeder_id.in.(${ids})`);
        }
        request = request.or(clauses.join(","));
      }
      if (fromDate) request = request.gte("payout_paid_at", `${fromDate}T00:00:00.000Z`);
      if (toDate) request = request.lt("payout_paid_at", `${addOneDay(toDate)}T00:00:00.000Z`);
      request = request.order("payout_paid_at", { ascending: false });

      const from = (historyPage - 1) * PAGE_SIZE;
      const { data, count, error } = await request.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setPaid((data ?? []) as unknown as PayoutHistoryRow[]);
      setHistoryTotal(count ?? 0);
    } catch (error) {
      setPaid([]);
      setHistoryTotal(0);
      toast.error(error instanceof Error ? error.message : "Could not load payout history.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, historyPage, query, searchableUserIds, toDate, view]);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function markPaid(txId: string, amount: number) {
    setBusyId(txId);
    try {
      await markSellerPaid(txId, reference[txId], notes[txId]);
      toast.success("Seller marked paid. The transaction has left the payout queue.");
      setReference((prev) => ({ ...prev, [txId]: "" }));
      setNotes((prev) => ({ ...prev, [txId]: "" }));
      await loadPayouts();
      setView("history");
      setHistoryPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark seller paid.");
      throw error;
    } finally {
      setBusyId(null);
    }
  }

  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));

  return (
    <section className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Banknote className="size-6 text-primary" /> Payouts</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keep the live payout queue focused on action while preserving every completed payout as permanent financial history.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={view === "queue" ? "default" : "outline"} onClick={() => setView("queue")}>Ready for payout</Button>
        <Button type="button" variant={view === "history" ? "default" : "outline"} onClick={() => { setView("history"); setHistoryPage(1); }}>Payout history</Button>
      </div>

      {view === "queue" ? (
        <Card id="ready-for-payout" className="scroll-mt-6 overflow-hidden border-primary/30">
          <div className="border-b border-border bg-primary/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-xl font-semibold">READY FOR PAYOUT</h2><p className="mt-1 text-sm text-muted-foreground">Manually send the seller's payout through OPay first. This website never transfers the money.</p></div>
              <Badge variant={ready.length ? "default" : "outline"}>{ready.length} waiting</Badge>
            </div>
          </div>
          <div className="divide-y divide-border">
            {loading && ready.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading payout queue…</p> : null}
            {!loading && ready.length === 0 ? <div className="p-6 text-center"><CheckCircle2 className="mx-auto size-8 text-primary" /><p className="mt-2 font-medium">No payouts waiting</p><p className="mt-1 text-sm text-muted-foreground">Transactions become eligible here only after receipt confirmation.</p></div> : null}
            {!loading && ready.map((t) => {
              const seller = db.users.find((u) => u.id === t.breeder_id);
              const buyer = db.users.find((u) => u.id === t.buyer_id);
              const payoutAmount = Math.max(0, t.amount_naira - t.calculated_commission);
              return <div id={`transaction-${t.id}`} key={t.id} className="space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{t.listing_name}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">Order {t.id}</p></div><Badge>{t.status === "Delivered" ? "READY FOR ADMIN PAYOUT" : t.status}</Badge></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Buyer" value={buyer?.real_name || buyer?.public_handle || t.buyer_id} /><Info label="Seller" value={seller?.real_name || seller?.public_handle || t.breeder_id} /><Info label="Buyer paid" value={ngn(t.amount_naira)} /><Info label="Platform fee" value={ngn(t.calculated_commission)} /><Info label="Amount to pay seller" value={ngn(payoutAmount)} emphasis /><Info label="Payment date" value={new Date(t.created_at).toLocaleString("en-NG")} /><Info label="Buyer confirmation" value={t.status === "Ready for Admin Payout" ? "Confirmed" : "Previously delivered"} /><Info label="Payment reference" value={t.payment_reference || "—"} /></div>
                <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><p className="font-semibold">Seller payout details</p></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><Info label="Account name" value={seller?.real_name || "—"} /><Info label="Bank / provider" value={seller?.bank_name || "—"} /><Info label="Account number" value={seller?.account_number || "—"} /></div><p className="mt-3 text-xs text-muted-foreground">These details are loaded from the protected profile record and are shown only inside the admin console.</p></div>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><div className="space-y-1.5"><Label htmlFor={`payout-ref-${t.id}`}>OPay/payment reference (optional)</Label><Input id={`payout-ref-${t.id}`} value={reference[t.id] ?? ""} maxLength={255} placeholder="Enter the manual transfer reference" onChange={(e) => setReference((prev) => ({ ...prev, [t.id]: e.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor={`payout-note-${t.id}`}>Admin notes (optional)</Label><Textarea id={`payout-note-${t.id}`} value={notes[t.id] ?? ""} maxLength={2000} rows={1} placeholder="Optional payout note" onChange={(e) => setNotes((prev) => ({ ...prev, [t.id]: e.target.value }))} /></div><ConfirmActionDialog title="Confirm Seller Payment" description={`Are you sure you want to mark this seller payout of ${ngn(payoutAmount)} as paid? First complete the manual OPay transfer. This action records the payout as completed.`} confirmLabel="Confirm Payment" onConfirm={async () => { try { await markPaid(t.id, payoutAmount); return true; } catch { return false; } }}><Button disabled={busyId === t.id} className="min-h-10"><Banknote className="size-4" /> {busyId === t.id ? "Saving…" : "MARK SELLER PAID"}</Button></ConfirmActionDialog></div>
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>Manually complete the OPay transfer before clicking this button. Clicking it only records the payout; it does not move money.</span></div>
              </div>;
            })}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Seller payout history</h3><p className="mt-1 text-sm text-muted-foreground">Permanent records of completed manual seller payouts.</p></div><Badge variant="outline">{historyTotal.toLocaleString()} total</Badge></div>
            <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto_auto]">
              <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search order ID, product, buyer, seller or payout reference…" value={query} onChange={(e) => { setQuery(e.target.value); setHistoryPage(1); }} /></div>
              <Input aria-label="Filter payout history from date" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setHistoryPage(1); }} />
              <Input aria-label="Filter payout history to date" type="date" min={fromDate || undefined} value={toDate} onChange={(e) => { setToDate(e.target.value); setHistoryPage(1); }} />
            </div>
          </div>
          <div className="divide-y divide-border">
            {loading ? <p className="p-6 text-sm text-muted-foreground">Loading payout history…</p> : null}
            {!loading && paid.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No matching completed payouts.</p> : null}
            {!loading && paid.map((t) => {
              const seller = db.users.find((u) => u.id === t.breeder_id);
              const buyer = db.users.find((u) => u.id === t.buyer_id);
              return <div key={t.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0"><p className="truncate font-medium">{t.listing_name}</p><p className="break-all font-mono text-[11px] text-muted-foreground">Order {t.id}</p><p className="mt-1 text-xs text-muted-foreground">Buyer: {buyer?.real_name || buyer?.public_handle || t.buyer_id} · Seller: {seller?.real_name || seller?.public_handle || t.breeder_id}</p><p className="mt-1 text-xs text-muted-foreground">Paid: {t.payout_paid_at ? new Date(t.payout_paid_at).toLocaleString("en-NG") : "—"} · Ref: {t.payout_reference || "—"}</p></div>
                <div className="lg:text-right"><p className="text-lg font-bold text-primary">{ngn(Math.max(0, t.amount_naira - t.calculated_commission))}</p><p className="text-xs text-muted-foreground">Fee {ngn(t.calculated_commission)}</p></div>
              </div>;
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border p-4 text-sm"><span className="text-muted-foreground">{historyTotal.toLocaleString()} record{historyTotal === 1 ? "" : "s"} · Page {historyPage} of {historyPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={historyPage <= 1 || loading} onClick={() => setHistoryPage(historyPage - 1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" disabled={historyPage >= historyPages || loading} onClick={() => setHistoryPage(historyPage + 1)}><ChevronRight className="size-4" /></Button></div></div>
        </Card>
      )}
    </section>
  );
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="rounded-lg border border-border/70 bg-background/70 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 break-words ${emphasis ? "text-lg font-bold text-primary" : "text-sm font-medium"}`}>{value}</p></div>;
}
