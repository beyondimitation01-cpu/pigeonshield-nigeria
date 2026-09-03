import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, formatBytes, MAX_EDGE_PX } from "@/lib/image-compress";
import { onImageError } from "@/lib/listing-images";

const BUCKET = "listing-photos";
// Listings live 7 days; a 60-day signed link comfortably outlasts them.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 60;

export type UploadedPhoto = { url: string; path: string };

export function PhotoUploader({
  userId,
  photos,
  onChange,
  max = 4,
}: {
  userId: string;
  photos: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = max - photos.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${max} photos.`);
      return;
    }

    setBusy(true);
    const added: UploadedPhoto[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
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

          added.push({ url: data.signedUrl, path });
          toast.success(
            `${file.name}: ${formatBytes(image.originalBytes)} → ${formatBytes(image.blob.size)} (${image.width}×${image.height})`,
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed.");
        }
      }
      if (added.length) onChange([...photos, ...added]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(photo: UploadedPhoto) {
    onChange(photos.filter((p) => p.path !== photo.path));
    await supabase.storage.from(BUCKET).remove([photo.path]);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.path} className="relative size-20 overflow-hidden rounded-md border border-border">
            <img src={p.url} alt="Listing photo" loading="lazy" decoding="async" onError={onImageError()} className="size-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => void remove(p)}
              className="absolute right-0 top-0 rounded-bl-md bg-background/90 p-1 text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={busy || photos.length >= max}
          className="size-20 flex-col gap-1 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {busy ? "Compressing" : "Add photo"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Photos are auto-resized to {MAX_EDGE_PX}px and compressed to WebP/JPEG at 80% quality (under 500KB) before upload.
      </p>
    </div>
  );
}
