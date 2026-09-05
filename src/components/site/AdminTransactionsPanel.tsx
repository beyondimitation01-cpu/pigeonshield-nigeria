import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { ngn } from "@/lib/pigeon-data";

type Tx = {
  id: string;
  listing_name: string;
  buyer_id: string;
  breeder_id: string;
  amount_naira: number;
  calculated_commission: number;
  status: string;
  created_at: string;
  payout_paid_at: string | null;
  payout_reference: string | null;
};

type View = "active" | "history";
const PAGE_SIZE = 20;
const TERMINAL_STATUSES = ["Seller Paid", "Completed", "Refunded to Buyer"] as const;
const ACTIVE_STATUSES = ["All", "Pending Verification", "Payment Verified / Processing", "Escrow Funded", "In Transit", "Delivered", "Ready for Admin Payout", "Disputed"];
const HISTORY_STATUSES = ["All", ...TERMINAL_STATUSES];

export function AdminTransactionsPanel() {
  const { db } = useStore();
  const [view, setView] = useState<View>("active");
  const [rows, setRows] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const searchableUserIds = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return [];
    return db.users
      .filter((user) => [user.id, user.real_name, user.public_handle].some((value) => value?.toLocaleLowerCase().includes(clean)))
      .map((user) => user.id);
  }, [db.users, query]);

  const searchableTransactionIds = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return [];
    return db.transactions
      .filter((transaction) => transaction.id.toLocaleLowerCase().includes(clean))
      .map((transaction) => transaction.id);
  }, [db.transactions, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const clean = escapeSearch(query.trim());
      const select = "id, listing_name, buyer_id, breeder_id, amount_naira, calculated_commission, status, created_at, payout_paid_at, payout_reference";
      let request = supabase.from("transactions").select(select, { count: "exact" });

      if (view === "history") {
        request = request.in("status", TERMINAL_STATUSES);
      } else {
        request = request.not("status", "in", `(${TERMINAL_STATUSES.map((value) => `"${value}"`).join(",")})`);
      }

      if (clean) {
        const clauses: string[] = [`listing_name.ilike.%${clean}%`];
        if (searchableTransactionIds.length) {
          const ids = searchableTransactionIds.map((id) => escapeFilterValue(id)).join(",");
          clauses.push(`id.in.(${ids})`);
        }
        if (searchableUserIds.length) {
          const ids = searchableUserIds.map((id) => escapeFilterValue(id)).join(",");
          clauses.push(`buyer_id.in.(${ids})`, `breeder_id.in.(${ids})`);
        }
        request = request.or(clauses.join(","));
      }
      if (status !== "All") request = request.eq("status", status);
      if (fromDate) request = request.gte("created_at", `${fromDate}T00:00:00.000Z`);
      if (toDate) request = request.lt("created_at", `${addOneDay(toDate)}T00:00:00.000Z`);
      request = request.order("created_at", { ascending: false });

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await request.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setRows((data ?? []) as Tx[]);
      setTotal(count ?? 0);
    } catch (error) {
      console.error("Failed to load admin transactions", error);
      setLoadError(error instanceof Error ? error.message : "Unable to load transactions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, page, query, searchableTransactionIds, searchableUserIds, status, toDate, view]);

  useEffect(() => { void load(); }, [load]);

  function changeView(next: View) {
    setView(next);
    setQuery("");
    setStatus("All");
    setFromDate("");
    setToDate("");
    setPage(1);
    setLoadError(null);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Active transactions stay focused on operational work; completed and refunded records remain permanently available in history.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={view === "active" ? "default" : "outline"} onClick={() => changeView("active")}>Active transactions</Button>
        <Button type="button" variant={view === "history" ? "default" : "outline"} onClick={() => changeView("history")}>Transaction history</Button>
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={view === "history" ? "Search transaction ID, product, buyer or seller…" : "Search active transaction ID, product, buyer or seller…"} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        </div>
        <select aria-label="Filter transactions by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          {(view === "history" ? HISTORY_STATUSES : ACTIVE_STATUSES).map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="min-w-0">
          <label htmlFor="transactions-from-date" className="mb-1 block text-xs font-medium text-muted-foreground">From date</label>
          <Input id="transactions-from-date" aria-label="Filter transactions from date" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div className="min-w-0">
          <label htmlFor="transactions-to-date" className="mb-1 block text-xs font-medium text-muted-foreground">To date</label>
          <Input id="transactions-to-date" aria-label="Filter transactions to date" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading {view === "history" ? "transaction history" : "active transactions"}…</p> : null}
          {!loading && loadError ? <div className="p-6 text-sm text-destructive"><p>Unable to load transactions.</p><p className="mt-1 text-xs">{loadError}</p></div> : null}
          {!loading && !loadError && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No matching {view === "history" ? "historical transactions" : "active transactions"}.</p> : null}
          {!loading && !loadError && rows.map((t) => {
            const buyer = db.users.find((user) => user.id === t.buyer_id);
            const seller = db.users.find((user) => user.id === t.breeder_id);
            return (
              <div key={t.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.listing_name}</p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">{t.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Buyer: {buyer?.real_name || buyer?.public_handle || t.buyer_id} · Seller: {seller?.real_name || seller?.public_handle || t.breeder_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Created: {new Date(t.created_at).toLocaleString("en-NG")}{t.payout_paid_at ? ` · Paid: ${new Date(t.payout_paid_at).toLocaleString("en-NG")}` : ""}</p>
                  {t.payout_reference ? <p className="mt-1 text-xs text-muted-foreground">Payout ref: {t.payout_reference}</p> : null}
                </div>
                <div className="lg:text-right"><p className="font-semibold">{ngn(t.amount_naira)}</p>{view === "history" ? <p className="text-xs text-muted-foreground">Fee {ngn(t.calculated_commission)}</p> : null}</div>
                <Badge variant={view === "history" ? "secondary" : t.status === "Ready for Admin Payout" ? "default" : "outline"}>{t.status === "Pending Verification" ? "Payment Pending" : t.status === "Delivered" ? "Buyer Confirmed" : t.status}</Badge>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-sm">
          <span className="text-muted-foreground">{total.toLocaleString()} record{total === 1 ? "" : "s"} · Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
            <Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      </Card>
    </section>
  );
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function escapeSearch(value: string) {
  return value.replace(/[\\%_(),]/g, (char) => `\\${char}`);
}

function escapeFilterValue(value: string) {
  return value.replace(/[\\(),]/g, (char) => `\\${char}`);
}
