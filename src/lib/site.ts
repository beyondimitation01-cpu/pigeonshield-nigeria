/** Canonical public address of the app. */
export const SITE_NAME = "PigeonShield Nigeria";
export const SITE_SLUG = "pigeonshield-nigeria";
export const SITE_URL = `https://${SITE_SLUG}.lovable.app`;

/** Absolute canonical URL for a route path ("/", "/listing/123", …). */
export function canonicalUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

/** Referral share link shown to users. */
export function referralLink(code: string) {
  return canonicalUrl(`/ref/${code}`);
}
