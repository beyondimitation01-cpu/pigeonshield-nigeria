/** Canonical public address of the app. */
export const SITE_NAME = "PigeonShield Nigeria";
export const SITE_SLUG = "pigeonshield-nigeria";
export const SITE_URL = "https://pigeonshield-nigeria.vercel.app";

/** Absolute canonical URL for a route path ("/", "/listing/123", …). */
export function canonicalUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

/** Referral share link shown to users. */
export function referralLink(code: string) {
  return canonicalUrl(`/ref/${code}`);
}

/** Stable URL segment for a listing. Mirrors the database slug generator. */
export function listingSlug(name: string, id: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "listing";
  return `${base}-${id.replace(/-/g, "").slice(0, 8)}`.slice(0, 80);
}

/** Canonical marketplace URLs. */
export function listingUrl(idOrSlug: string) {
  return canonicalUrl(`/listing/${encodeURIComponent(idOrSlug)}`);
}

export function storeUrl(username: string) {
  return canonicalUrl(`/u/${encodeURIComponent(username)}`);
}
