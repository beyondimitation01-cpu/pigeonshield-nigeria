import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ngn } from "@/lib/pigeon-data";

type Tx = { id: string; listing_name: string; amount_naira: number; calculated_commission: number; status: string; created_at: string; payout_paid_at: string | null };
const PAGE_SIZE = 20;
const TERMINAL_STATUSES = ["Seller Paid", "Completed", "Refunded to Buyer"] as const;
const ACTIVE_STATUSES = ["All", "Pending Verification", "Funded", "Dispatched", "Delivered", "Ready for Admin Payout", "Disputed"];

export function AdminTransactionsPanel() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const clean = escapeSearch(query.trim());
    let request = supabase.from("transactions").select("id, listing_name, amount_naira, calculated_commission, status, created_at, payout_paid_at", { count: "exact" }).not("status", "in", `(${TERMINAL_STATUSES.map((value) => `"${value}"`).join(",")})`);
    if (clean) request = request.or(`id.ilike.%${clean}%,listing_name.ilike.%${clean}%`);
    if (status !== "All") request = request.eq("status", status);
    request = request.order("created_at", { ascending: false });
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await request.range(from, from + PAGE_SIZE - 1);
    if (!error) { setRows((data ?? []) as Tx[]); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, query, status]);

  useEffect(() => { void load(); }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">Transactions</h2><p className="mt-1 text-sm text-muted-foreground">Active transactions requiring payment, escrow, delivery, dispute or settlement attention.</p></div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search active transaction ID or product…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
        <select aria-label="Filter transactions by active status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{ACTIVE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading active transactions…</p> : null}
          {!loading && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No matching active transactions.</p> : null}
          {!loading && rows.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{t.listing_name}</p><p className="break-all font-mono text-[11px] text-muted-foreground">{t.id}</p></div>
              <span className="font-semibold">{ngn(t.amount_naira)}</span>
              <Badge variant={t.status === "Ready for Admin Payout" ? "default" : "outline"}>{t.status === "Pending Verification" ? "Payment Pending" : t.status === "Delivered" ? "Buyer Confirmed" : t.status}</Badge>
              {t.status === "Ready for Admin Payout" && !t.payout_paid_at ? <Badge variant="secondary">Requires attention</Badge> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-sm"><span className="text-muted-foreground">Page {page} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div>
      </Card>
    </section>
  );
}

function escapeSearch(value: string) {
  return value.replace(/[\\%_(),]/g, (char) => `\\${char}`);
}
