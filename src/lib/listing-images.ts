import pigeonRacer from "@/assets/pigeon-racer.jpg";
import pigeonFantail from "@/assets/pigeon-fantail.jpg";
import chickenNoiler from "@/assets/chicken-noiler.jpg";
import dogBoerboel from "@/assets/dog-boerboel.jpg";
import horsePony from "@/assets/horse-pony.jpg";
import pigeonPlaceholder from "@/assets/pigeon-placeholder.jpg";
import type { Category, Listing } from "@/lib/pigeon-data";

/** Always-available default artwork (bundled, never a broken remote URL). */
export const DEFAULT_PIGEON_IMAGE = pigeonPlaceholder;

const CATEGORY_FALLBACK: Record<Category, string[]> = {
  Pigeon: [pigeonRacer, pigeonFantail],
  Chicken: [chickenNoiler],
  Dog: [dogBoerboel],
  Horse: [horsePony],
};

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** Only bundled assets or absolute https/data URLs are considered usable. */
export function isUsableImageUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  const u = url.trim();
  if (!u || u === "null" || u === "undefined") return false;
  return u.startsWith("https://") || u.startsWith("data:image/") || u.startsWith("/");
}

export function categoryFallback(category: Category, seed = "") {
  const pool = CATEGORY_FALLBACK[category] ?? [DEFAULT_PIGEON_IMAGE];
  return pool[hash(seed) % pool.length] ?? DEFAULT_PIGEON_IMAGE;
}

/** Cover image for a listing: first valid photo, else a category-appropriate default. */
export function listingCover(listing: Listing, index = 0) {
  const valid = (listing.images ?? []).filter(isUsableImageUrl);
  return valid[index] ?? valid[0] ?? categoryFallback(listing.category_type, listing.id);
}

export function listingGallery(listing: Listing) {
  const valid = (listing.images ?? []).filter(isUsableImageUrl);
  return valid.length ? valid : [categoryFallback(listing.category_type, listing.id)];
}

/** onError handler: swap a failed image for the clean default pigeon artwork. */
export function onImageError(fallback: string = DEFAULT_PIGEON_IMAGE) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.dataset["fallbackApplied"] === "true") return;
    el.dataset["fallbackApplied"] = "true";
    el.src = fallback;
  };
}
