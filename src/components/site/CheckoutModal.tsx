import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { useStore } from "@/lib/store";
import { makeOrderReference, ngn, OPAY_ACCOUNT, type Listing } from "@/lib/pigeon-data";

const RECEIPT_BUCKET = "payment-receipts";
const RECEIPT_TTL_SECONDS = 60 * 60 * 24 * 365;
type PricingUnit = "listing" | "each" | "pair";

/** Manual OPay transfer checkout — quantity and total are confirmed server-side. */
export function CheckoutModal({
  listing,
  open,
  onOpenChange,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>("listing");
  const [availableQty, setAvailableQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(listing.price_ngn);
  const [quantity, setQuantity] = useState(1);
  const [loadingPricing, setLoadingPricing] = useState(false);

  const reference = useMemo(() => makeOrderReference(), [listing.id, open]);
  const isUnitPriced = pricingUnit !== "listing";
  const totalAmount = isUnitPriced ? unitPrice * quantity : unitPrice;
  const unitLabel = pricingUnit === "pair" ? "pair" : "each";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPricing(true);
    setPricingUnit("listing");
    setAvailableQty(1);
    setUnitPrice(listing.price_ngn);
    setQuantity(1);
    void supabase.from("listings").select("price_ngn, pricing_unit, batch_quantity, is_active").eq("id", listing.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        toast.error(error?.message ?? "Could not load the current listing price. Please try again.");
        setLoadingPricing(false);
        return;
      }
      const nextUnit = String((data as Record<string, unknown>)["pricing_unit"] ?? "listing") as PricingUnit;
      const nextPrice = Number((data as Record<string, unknown>)["price_ngn"] ?? listing.price_ngn);
      const nextQty = Math.max(1, Number((data as Record<string, unknown>)["batch_quantity"] ?? 1));
      setPricingUnit(nextUnit === "each" || nextUnit === "pair" ? nextUnit : "listing");
      setUnitPrice(nextPrice);
      setAvailableQty(nextUnit === "listing" ? 1 : nextQty);
      setQuantity(1);
      if ((data as Record<string, unknown>)["is_active"] !== true) toast.error("This listing is no longer available.");
      setLoadingPricing(false);
    });
    return () => { cancelled = true; };
  }, [listing.id, listing.price_ngn, open]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Copy failed — select it manually.");
    }
  }

  async function upload(file: File | undefined) {
    if (!file || !user) return;
    setUploading(true);
    try {
      const image = await compressImage(file);
      const path = `${user.id}/${reference}.${image.extension}`;
      const { error } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .upload(path, image.blob, { contentType: image.contentType, upsert: true });
      if (error) throw new Error(error.message);
      const { data, error: signError } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrl(path, RECEIPT_TTL_SECONDS);
      if (signError || !data?.signedUrl) throw new Error(signError?.message ?? "Could not link the receipt.");
      setReceipt({ url: data.signedUrl, name: file.name });
      toast.success("Receipt attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (!receipt) {
      toast.error("Attach your payment receipt screenshot first.");
      return;
    }
    const safeQuantity = isUnitPriced ? Math.min(Math.max(Math.trunc(quantity), 1), availableQty) : 1;
    if (isUnitPriced && safeQuantity !== quantity) {
      toast.error("Choose a valid quantity before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from("transactions").insert({
        listing_id: listing.id,
        buyer_id: user?.id,
        quantity_purchased: safeQuantity,
        pricing_unit: pricingUnit,
        payment_reference: reference,
        receipt_url: receipt.url,
        receipt_uploaded_at: new Date().toISOString(),
      } as never).select("id").single();
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error("Could not create the order.");
      onOpenChange(false);
      toast.success("Payment submitted for verification. Admin will confirm your transfer shortly.");
      void navigate({ to: "/my-orders" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit the order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Manual OPay Transfer
          </DialogTitle>
          <DialogDescription>
            {loadingPricing ? "Loading the current listing price…" : isUnitPriced ? `Transfer ${ngn(totalAmount)} for ${quantity} ${unitLabel}${quantity === 1 ? "" : "s"}.` : `Transfer ${ngn(totalAmount)} for this complete listing.`} Funds are only released to the breeder after you confirm safe delivery.
          </DialogDescription>
        </DialogHeader>

        <Card className="space-y-3 bg-muted/40 p-4 text-sm">
          <Row label="Bank Name" value={OPAY_ACCOUNT.bank} />
          <Row label="Account Number" value={OPAY_ACCOUNT.number} onCopy={() => copy(OPAY_ACCOUNT.number, "Account number")} />
          <Row label="Account Name" value={OPAY_ACCOUNT.name} />
          {isUnitPriced ? <Row label={`Price per ${unitLabel}`} value={ngn(unitPrice)} /> : null}
          {isUnitPriced ? <Row label="Quantity" value={`${quantity} ${unitLabel}${quantity === 1 ? "" : "s"}`} /> : null}
          <Row label="Amount" value={ngn(totalAmount)} />
          {isUnitPriced ? <p className="text-xs text-muted-foreground">{availableQty} {pricingUnit === "pair" ? "pairs" : "units"} available.</p> : null}
          <Row label="Narration / Reference" value={reference} onCopy={() => copy(reference, "Reference code")} />
        </Card>

        {isUnitPriced ? (
          <div className="space-y-2">
            <Label htmlFor="purchase-quantity">Quantity to purchase</Label>
            <Input id="purchase-quantity" type="number" min={1} max={availableQty} step={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(availableQty, Math.trunc(Number(e.target.value) || 1))))} disabled={loadingPricing || availableQty < 1} />
          </div>
        ) : null}

        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <Button variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {receipt ? `Attached: ${receipt.name}` : "Attach payment receipt screenshot"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Screenshots are compressed on your device before upload. Only you and the admin can view them.
          </p>
        </div>

        <Button size="lg" disabled={!receipt || submitting || loadingPricing || (isUnitPriced && availableQty < 1)} onClick={() => void submit()}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Submit Payment for Verification
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-semibold text-foreground">
        {value}
        {onCopy ? (
          <button type="button" aria-label={`Copy ${label}`} onClick={onCopy} className="text-primary">
            <Copy className="size-3.5" />
          </button>
        ) : null}
      </span>
    </div>
  );
}