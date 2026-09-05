import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useStore } from "@/lib/store";
import { ngn, type EscrowTransaction, type DisputeStatus, type TxStatus } from "@/lib/pigeon-data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/transaction-history")({
  head: () => ({
    meta: [
      { title: "Transaction History — PigeonShield Nigeria" },
      { name: "description", content: "View your completed and refunded PigeonShield transactions." },
    ],
  }),
  component: GuardedTransactionHistory,
});

const PAGE_SIZE = 20;
const FETCH_SIZE = PAGE_SIZE + 1;
const TERMINAL_STATUSES: TxStatus[] = ["Seller Paid", "Completed", "Refunded to Buyer"];

type HistorySide = "purchase" | "sale";

type HistoryRow = Pick<EscrowTransaction, "id" | "listing_name" | "buyer_id" | "breeder_id" | "amount_naira" | "calculated_commission" | "status" | "created_at" | "payout_paid_at" | "payout_reference">;

function mapHistoryRow(row: Record<string, unknown>): HistoryRow {
  return {
    id: String(row["id"]),
    listing_name: String(row["listing_name"] ?? ""),
    buyer_id: String(row["buyer_id"]),
    breeder_id: row["breeder_id"] ? String(row["breeder_id"]) : "",
    amount_naira: Number(row["amount_naira"] ?? 0),
    calculated_commission: Number(row["calculated_commission"] ?? 0),
    status: String(row["status"]) as TxStatus,
    created_at: new Date(String(row["created_at"])).getTime(),
    payout_paid_at: row["payout_paid_at"] ? new Date(String(row["payout_paid_at"])).getTime() : null,
    payout_reference: (row["payout_reference"] as string | null) ?? null,
  };
}

function TransactionHistory() {
  const authed = useRequireAuth("Transaction History");
  const { user, authReady } = useStore();
  const [side, setSide] = useState<HistorySide>("purchase");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setRows([]);
      setHasNext(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_transaction_history_page", {
        _direction: side,
        _limit: FETCH_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      const mapped = ((data ?? []) as Record<string, unknown>[]).map(mapHistoryRow);
      setHasNext(mapped.length > PAGE_SIZE);
      setRows(mapped.slice(0, PAGE_SIZE));
    } catch (error) {
      setRows([]);
      setHasNext(false);
      toast.error(error instanceof Error ? error.message : "Could not load transaction history.");
    } finally {
      setLoading(false);
    }
  }, [page, side, user]);

  useEffect(() => {
    if (!authReady || !authed) return;
    void loadHistory();
  }, [authReady, authed, loadHistory]);

  const changeSide = (next: HistorySide) => {
    if (next === side) return;
    setSide(next);
    setPage(1);
  };

  if (!authReady) return <AuthPending />;
  if (!authed || !user) return <AuthRequired title="Transaction History" description="Log in to view your transaction history." />;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/my-orders"><ArrowLeft className="size-4" /> Back to My Orders</Link></Button>
      </div>
      <header className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">Transaction History</h1>
        <p className="mt-1 text-muted-foreground">Permanent records of your completed and refunded transactions. History is loaded in small pages so this view stays fast as it grows.</p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" variant={side === "purchase" ? "default" : "outline"} onClick={() => changeSide("purchase")}>Purchases</Button>
        <Button type="button" variant={side === "sale" ? "default" : "outline"} onClick={() => changeSide("sale")}>Sales</Button>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="divide-y divide-border">
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading {side === "purchase" ? "purchases" : "sales"}…</p> : null}
          {!loading && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No completed or refunded {side === "purchase" ? "purchases" : "sales"}.</p> : null}
          {!loading && rows.map((tx) => (
            <div key={tx.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{tx.listing_name}</p>
                <p className="break-all font-mono text-[11px] text-muted-foreground">{tx.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">Transaction date: {new Date(tx.created_at).toLocaleString("en-NG")}</p>
                {tx.payout_paid_at ? <p className="mt-1 text-xs text-muted-foreground">Payout date: {new Date(tx.payout_paid_at).toLocaleString("en-NG")}{tx.payout_reference ? ` · Ref: ${tx.payout_reference}` : ""}</p> : null}
              </div>
              <div className="shrink-0 text-right"><p className="font-semibold">{ngn(tx.amount_naira)}</p><Badge variant="outline" className="mt-1">{tx.status}</Badge></div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-sm">
          <span className="text-muted-foreground">Page {page}{hasNext ? " · More available" : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /> Previous</Button>
            <Button size="sm" variant="outline" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight className="size-4" /></Button>
          </div>
        </div>
      </Card>
    </main>
  );
}

function GuardedTransactionHistory() {
  return <ProtectedRoute title="Transaction History" description="Log in to view your transaction history."><TransactionHistory /></ProtectedRoute>;
}
