import { SITE_SLUG, SITE_URL } from "./site";

const CANONICAL_HOST = new URL(SITE_URL).hostname;

/** Hosts allowed to render the app without redirecting. */
const ALLOWED_HOSTS = new Set([
  CANONICAL_HOST,
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

/** Lovable editor/preview + sandbox hosts must never be redirected away. */
function isDevelopmentOrPreviewHost(hostname: string) {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev") ||
    hostname.endsWith(".lovable.dev") ||
    hostname.endsWith(".localhost")
  );
}

export function isCanonicalHost(hostname: string) {
  return ALLOWED_HOSTS.has(hostname);
}

/** True when the current host should be forced onto the canonical address. */
export function shouldRedirectToCanonical(): boolean {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.PROD) return false;
  // Never break the Lovable editor preview iframe.
  if (window.self !== window.top) return false;
  const host = window.location.hostname;
  if (isDevelopmentOrPreviewHost(host)) return false;
  return !isCanonicalHost(host);
}

/** Remove stale PWA registrations/caches on a non-canonical app origin. */
export async function purgeStaleClientState() {
  if (typeof window === "undefined") return;
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}

/** Absolute canonical URL preserving the current route, query and hash. */
export function canonicalTargetUrl() {
  const { pathname, search, hash } = window.location;
  return `${SITE_URL}${pathname}${search}${hash}`;
}

/** Clears stale PWA state then hard-redirects to the canonical host. */
export async function enforceCanonicalHost() {
  const target = canonicalTargetUrl();
  await purgeStaleClientState();
  window.location.replace(target);
}
