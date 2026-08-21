import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, AlertTriangle, Timer, FileImage } from "lucide-react";
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
      { title: "My Escrow Orders — Passcodes, Delivery & DOA Claims" },
      {
        name: "description",
        content:
          "Track funded escrow orders, reveal your 2FA pickup passcode, confirm safe delivery or file a Dead on Arrival dispute.",
      },
      { property: "og:title", content: "My Escrow Orders — PigeonShield Nigeria" },
      { property: "og:description", content: "Confirm delivery, reveal passcodes and raise DOA disputes." },
    ],
  }),
  component: GuardedMyOrders,
});

function hoursLeft(tx: EscrowTransaction) {
  return Math.max(0, Math.ceil((tx.auto_release_at - Date.now()) / 3600_000));
}

function OrderCard({ tx, side }: { tx: EscrowTransaction; side: "buyer" | "breeder" }) {
  const { confirmDelivery, reportDOA, submitBreederProof } = useStore();
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

      {side === "buyer" ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <KeyRound className="size-4" /> 2FA Pickup Passcode
          </p>
          <p className="mt-1 font-mono text-xl tracking-widest">{tx.pickup_passcode}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Read this to the driver only when the animal arrives alive and healthy.
          </p>
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
            onClick={() => {
              confirmDelivery(tx.id);
              toast.success("Delivery confirmed — funds released to the breeder.");
            }}
          >
            <ShieldCheck className="size-4" /> Confirm Safe Delivery
          </Button>
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
