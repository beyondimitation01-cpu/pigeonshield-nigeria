import { useMemo, useRef, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { useStore } from "@/lib/store";
import { makeOrderReference, ngn, OPAY_ACCOUNT, type Listing } from "@/lib/pigeon-data";

const RECEIPT_BUCKET = "payment-receipts";
const RECEIPT_TTL_SECONDS = 60 * 60 * 24 * 365;

/** Manual OPay transfer checkout — no card gateway, zero gateway fees. */
export function CheckoutModal({
  listing,
  open,
  onOpenChange,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, buyListing } = useStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reference = useMemo(() => makeOrderReference(), [listing.id, open]);

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
    setSubmitting(true);
    try {
      const tx = await buyListing(listing, { reference, receiptUrl: receipt.url });
      if (!tx) {
        toast.error("Could not submit the order. Please try again.");
        return;
      }
      onOpenChange(false);
      toast.success("Payment submitted for verification. Admin will confirm your transfer shortly.");
      void navigate({ to: "/my-orders" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit the order. Please try again.");
    } finally {
      setSubmitting(false);
    }
    return;
    if (!tx) {

  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Manual OPay Transfer
          </DialogTitle>
          <DialogDescription>
            Transfer {ngn(listing.price_ngn)} to the PigeonShield escrow account, then attach your receipt.
            Funds are only released to the breeder after you confirm safe delivery.
          </DialogDescription>
        </DialogHeader>

        <Card className="space-y-3 bg-muted/40 p-4 text-sm">
          <Row label="Bank Name" value={OPAY_ACCOUNT.bank} />
          <Row label="Account Number" value={OPAY_ACCOUNT.number} onCopy={() => copy(OPAY_ACCOUNT.number, "Account number")} />
          <Row label="Account Name" value={OPAY_ACCOUNT.name} />
          <Row label="Amount" value={ngn(listing.price_ngn)} />
          <Row label="Narration / Reference" value={reference} onCopy={() => copy(reference, "Reference code")} />
        </Card>

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

        <Button size="lg" disabled={!receipt || submitting} onClick={() => void submit()}>
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
