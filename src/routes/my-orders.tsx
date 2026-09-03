import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Timer, FileImage, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AUTO_RELEASE_HOURS, ngn, type EscrowTransaction } from "@/lib/pigeon-data";

export const Route = createFileRoute("/my-orders")({
  head: () => ({
    meta: [
      { title: "My Escrow Orders — Delivery & DOA Claims" },
      {
        name: "description",
        content:
          "Track escrow orders, dispatch with a seller PIN, confirm receipt, or file a Dead on Arrival dispute.",
      },
      { property: "og:title", content: "My Escrow Orders — PigeonShield Nigeria" },
      { property: "og:description", content: "Confirm delivery, reveal the pickup PIN and raise DOA disputes." },
    ],
  }),
  component: GuardedMyOrders,
});

function hoursLeft(tx: EscrowTransaction) {
  return Math.max(0, Math.ceil((tx.auto_release_at - Date.now()) / 3600_000));
}

function OrderCard({ tx, side }: { tx: EscrowTransaction; side: "buyer" | "breeder" }) {
  const { dispatchOrder, confirmReceiptAndRevealPin, reportDOA, submitBreederProof } = useStore();
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [driver, setDriver] = useState("");
  const [waybill, setWaybill] = useState("");

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{tx.listing_name}</p>
          <p className="text-xs text-muted-foreground">{tx.id}</p>
        </div>
        <Badge variant={tx.status === "Disputed" ? "destructive" : "default"}>{tx.status}</Badge>
      </div>

      <p className="text-lg font-bold text-primary">{ngn(tx.amount_naira)}</p>
      {tx.dispute_status !== "None" ? (
        <p className="text-sm font-medium text-destructive">{tx.dispute_status}</p>
      ) : null}

      {side === "breeder" && tx.status === "Escrow Funded" ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Truck className="size-4" /> Ready for dispatch
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Dispatch the order to generate the seller handover PIN.
          </p>
          <Button
            size="sm"
            className="mt-3"
            disabled={dispatching}
            onClick={async () => {
              setDispatching(true);
              try {
                const pin = await dispatchOrder(tx.id);
                toast.success("Order dispatched. Give the PIN to the driver.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not dispatch order.");
              } finally {
                setDispatching(false);
              }
            }}
          >
            {dispatching ? "Dispatching…" : "Dispatch order"}
          </Button>
        </div>
      ) : null}

      {side === "breeder" && tx.verification_pin && tx.status === "In Transit" ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold text-primary">Driver handover PIN</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.35em]">{tx.verification_pin}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Give this 4-digit PIN to your transport driver via SMS or a paper note.
          </p>
        </div>
      ) : null}

      {side === "buyer" && (tx.status === "In Transit" || tx.status === "Delivered" || tx.status === "Completed") ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold text-primary">Ready for collection</p>
          {revealedPin || tx.verification_pin ? (
            <>
              <p className="mt-2 font-mono text-4xl font-bold tracking-[0.35em]">{revealedPin ?? tx.verification_pin}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Show or read this 4-digit PIN to the driver to collect your pigeon.
              </p>
            </>
          ) : (
            <Button
              size="sm"
              className="mt-3"
              onClick={async () => {
                try {
                  const pin = await confirmReceiptAndRevealPin(tx.id);
                  setRevealedPin(pin);
                  toast.success("Receipt confirmed. Pickup PIN revealed.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not confirm receipt.");
                }
              }}
            >
              Confirm Receipt &amp; Reveal Pickup PIN
            </Button>
          )}
        </div>
      ) : null}

      {tx.status === "Escrow Funded" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Timer className="size-3" /> Auto-release in {hoursLeft(tx)}h of the {AUTO_RELEASE_HOURS}h window
        </p>
      ) : null}

      {side === "buyer" && tx.status === "Escrow Funded" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              reportDOA(tx.id, "doa_proof_video.mp4");
              toast.error("DOA reported. Auto-release clock halted for admin review.");
            }}
          >
            <AlertTriangle className="size-4" /> Report Dead on Arrival
          </Button>
        </div>
      ) : null}

      {side === "breeder" && tx.status === "Disputed" ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileImage className="size-4" /> Submit delivery proof
          </p>
          <Input placeholder="Driver phone number" value={driver} onChange={(e) => setDriver(e.target.value)} />
          <Input placeholder="Waybill image reference" value={waybill} onChange={(e) => setWaybill(e.target.value)} />
          <Button
            size="sm"
            disabled={!driver || !waybill}
            onClick={() => {
              submitBreederProof(tx.id, driver, waybill);
              toast.success("Proof submitted for admin review.");
            }}
          >
            Escalate to admin
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function MyOrders() {
  const authed = useRequireAuth("My Orders area");
  const { db, user, authReady } = useStore();

  if (!authReady) return <AuthPending />;
  if (!authed || !user) {
    return (
      <AuthRequired title="My Orders" description="Log in to view your escrow orders." />
    );
  }

  const purchases = db.transactions.filter((t) => t.buyer_id === user.id);
  const sales = db.transactions.filter((t) => t.breeder_id === user.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">My Orders</h1>
      <p className="mt-1 text-muted-foreground">Escrow-protected purchases and sales.</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Purchases ({purchases.length})</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases yet.</p>
          ) : (
            purchases.map((t) => <OrderCard key={t.id} tx={t} side="buyer" />)
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Sales ({sales.length})</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            sales.map((t) => <OrderCard key={t.id} tx={t} side="breeder" />)
          )}
        </div>
      </section>
    </main>
  );
}

function GuardedMyOrders() {
  return (
    <ProtectedRoute title="My Orders" description="Log in to view your escrow orders.">
      <MyOrders />
    </ProtectedRoute>
  );
}
