import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, formatBytes } from "@/lib/image-compress";
import { UserAvatar } from "@/components/site/UserAvatar";

const BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

/**
 * Uploads a profile picture. Requires a signed-in session, so during
 * registration it is offered right after the account is created.
 */
export function AvatarUploader({
  userId,
  value,
  onChange,
  label = "Profile picture",
}: {
  userId: string;
  value: string;
  onChange: (url: string) => void | Promise<void>;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const image = await compressImage(file);
      const path = `${userId}/${crypto.randomUUID()}.${image.extension}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, image.blob, { contentType: image.contentType, upsert: false });
      if (error) throw new Error(error.message);

      const { data, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signError || !data?.signedUrl) throw new Error(signError?.message ?? "Could not link photo.");

      await onChange(data.signedUrl);
      toast.success(
        `Profile picture updated — ${formatBytes(image.originalBytes)} → ${formatBytes(image.blob.size)}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <UserAvatar url={value} size={64} />
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {busy ? "Compressing…" : label}
        </Button>
        <p className="text-xs text-muted-foreground">Auto-resized to 1200px, WebP/JPEG, under 500KB.</p>
      </div>
    </div>
  );
}
