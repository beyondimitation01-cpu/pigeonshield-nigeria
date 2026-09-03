// Client-side image compression: downscale to a max edge and encode to WebP
// (JPEG fallback) at ~80% quality, stepping quality down until the file is
// under the size budget. Browser-only — call from event handlers.

export const MAX_EDGE_PX = 1200;
export const MAX_BYTES = 500 * 1024;
const START_QUALITY = 0.8;
const MIN_QUALITY = 0.4;

export type CompressedImage = {
  blob: Blob;
  extension: "webp" | "jpg";
  contentType: string;
  width: number;
  height: number;
  originalBytes: number;
};

function supportsWebp(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadBitmap(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Some browsers expose createImageBitmap but cannot decode every image
      // format. Fall back to the regular HTMLImageElement decoder before
      // reporting the file as unreadable.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");

  const { source, width, height } = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not supported on this device.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, targetW, targetH);
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();

  const webp = supportsWebp(canvas);
  const contentType = webp ? "image/webp" : "image/jpeg";
  const extension = webp ? "webp" : "jpg";

  let quality = START_QUALITY;
  let blob = await toBlob(canvas, contentType, quality);
  // Step quality down only if the 80% encode still exceeds the budget.
  while (blob && blob.size > MAX_BYTES && quality > MIN_QUALITY) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    blob = await toBlob(canvas, contentType, quality);
  }
  if (!blob) throw new Error("Could not compress that image.");

  return {
    blob,
    extension,
    contentType,
    width: targetW,
    height: targetH,
    originalBytes: file.size,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
