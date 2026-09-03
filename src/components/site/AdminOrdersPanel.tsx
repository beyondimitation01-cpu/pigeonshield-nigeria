import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Truck, CheckCircle2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { ngn } from "@/lib/pigeon-data";
import { toast } from "sonner";

type OrderRow = {
  id: string; listing_name: string; buyer_id: string; breeder_id: string; amount_naira: number;
  status: string; payment_reference: string | null; receipt_url: string | null; receipt_uploaded_at: string | null;
  created_at: string; delivery_marked_at: string | null; proof_file_name: string | null;
};
const PAGE_SIZE = 20;

export function AdminOrdersPanel() {
  const { verifyPayment, forceMarkDelivered } = useStore();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let request = supabase.from("transactions").select("id, listing_name, buyer_id, breeder_id, amount_naira, status, payment_reference, receipt_url, receipt_uploaded_at, created_at, delivery_marked_at, proof_file_name", { count: "exact" });
    if (query.trim()) request = request.or(`id.ilike.%${query.trim()}%,listing_name.ilike.%${query.trim()}%`);
    if (status !== "All") request = request.eq("status", status);
    request = request.order("created_at", { ascending: false });
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await request.range(from, from + PAGE_SIZE - 1);
    if (!error) { setRows((data ?? []) as OrderRow[]); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, query, status]);

  useEffect(() => { void load(); }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statuses = ["All", "Pending Verification", "Funded", "Dispatched", "Delivered", "Ready for Admin Payout", "Seller Paid", "Completed", "Disputed", "Refunded to Buyer"];

  async function verify(id: string) {
    try { await verifyPayment(id); toast.success("Payment verified."); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not verify payment."); }
  }

  return (
    <section className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">Orders</h2><p className="mt-1 text-sm text-muted-foreground">Search and review orders without loading the complete transaction history into the page.</p></div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search order ID or product…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
        <select aria-label="Filter orders by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{statuses.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading orders…</p> : null}
          {!loading && !rows.length ? <p className="p-6 text-sm text-muted-foreground">No matching orders.</p> : null}
          {!loading && rows.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.listing_name}</span><span className="font-mono text-[11px] text-muted-foreground">{t.id}</span></span>
              <span className="font-semibold">{ngn(t.amount_naira)}</span><Badge variant={t.status === "Pending Verification" ? "destructive" : "outline"}>{t.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => setSelected(t)}>Details</Button>
              {t.status === "Pending Verification" ? <Button size="sm" onClick={() => void verify(t.id)}><CheckCircle2 className="size-4" /> Verify payment</Button> : null}
              {!["Delivered", "Completed", "Refunded to Buyer", "Disputed"].includes(t.status) ? <Button size="sm" variant="outline" onClick={async () => { try { await forceMarkDelivered(t.id); toast.success("Order marked delivered."); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update order."); } }}><Truck className="size-4" /> Delivery override</Button> : null}
            </div>
          ))}
        </div>
        <Pager page={page} total={pages} onPage={setPage} />
      </Card>
      {selected ? <OrderDetails order={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function OrderDetails({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  return (
    <Card className="border-primary/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Order details</p><h3 className="mt-1 text-xl font-semibold">{order.listing_name}</h3><p className="break-all font-mono text-xs text-muted-foreground">{order.id}</p></div><Button variant="outline" onClick={onClose}>Close</Button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Amount" value={ngn(order.amount_naira)} /><Detail label="Status" value={order.status} /><Detail label="Payment reference" value={order.payment_reference || "—"} />
        <Detail label="Buyer ID" value={order.buyer_id} /><Detail label="Seller ID" value={order.breeder_id} /><Detail label="Created" value={new Date(order.created_at).toLocaleString("en-NG")} />
        <Detail label="Buyer confirmation / delivery" value={order.delivery_marked_at ? new Date(order.delivery_marked_at).toLocaleString("en-NG") : "Not marked"} /><Detail label="Receipt" value={order.receipt_url ? "Submitted" : "None"} /><Detail label="Delivery proof" value={order.proof_file_name || "None"} />
      </div>
      {order.receipt_url ? <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href={order.receipt_url} target="_blank" rel="noreferrer"><Receipt className="size-4" /> Open payment receipt</a> : null}
    </Card>
  );
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border/70 bg-muted/20 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>; }
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) { return <div className="flex items-center justify-between border-t border-border p-4 text-sm"><span className="text-muted-foreground">Page {page} of {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" disabled={page >= total} onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div>; }
