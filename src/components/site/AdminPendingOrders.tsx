import { Receipt, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { ngn } from "@/lib/pigeon-data";
import { onImageError } from "@/lib/listing-images";

/** Pending Orders & Receipts — manual OPay transfer verification. */
export function AdminPendingOrders() {
  const { db, verifyPayment } = useStore();
  const pending = db.transactions.filter(
    (t) => t.status === "Pending Verification" || t.receipt_url !== null,
  );

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Receipt className="size-4 text-primary" /> Pending Orders &amp; Receipts ({pending.filter((t) => t.status === "Pending Verification").length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment receipts submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((t) => (
            <div id={'transaction-' + t.id} key={t.id} className="scroll-mt-6 flex flex-wrap items-start gap-4 rounded-md border border-border p-3 text-sm">
              {t.receipt_url ? (
                <a href={t.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={t.receipt_url}
                    alt="Payment receipt"
                    loading="lazy"
                    decoding="async"
                    onError={onImageError()}
                    className="size-20 rounded-md border border-border object-cover"
                  />
                </a>
              ) : (
                <div className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  No receipt
                </div>
              )}
              <div className="min-w-40 flex-1 space-y-1">
                <p className="font-medium">{t.listing_name}</p>
                <p className="text-xs text-muted-foreground">
                  {ngn(t.amount_naira)} · Ref {t.payment_reference ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Buyer {db.users.find((u) => u.id === t.buyer_id)?.public_handle ?? t.buyer_id.slice(0, 8)} ·{" "}
                  {t.receipt_uploaded_at ? new Date(t.receipt_uploaded_at).toLocaleString("en-NG") : "—"}
                </p>
                <Badge variant={t.status === "Pending Verification" ? "destructive" : "outline"}>{t.status}</Badge>
              </div>
              <Button
                size="sm"
                disabled={t.status !== "Pending Verification"}
                onClick={async () => {
                  try {
                    await verifyPayment(t.id);
                    toast.success("Payment verified — order is now funded and ready for dispatch.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not verify payment.");
                  }
                }}
              >
                <CheckCircle2 className="size-4" /> Mark Payment Verified
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
