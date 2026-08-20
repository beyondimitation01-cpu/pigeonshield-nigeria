export const SUPER_ADMIN_EMAIL = "superadmin@pigeonshield.app";

/** Constant-time comparison of two secrets via equal-length SHA-256 digests. */
export async function timingSafeMatch(input: string, expected: string) {
  const enc = new TextEncoder();
  const ha = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
  const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(expected)));
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) diff |= (ha[i] ?? 0) ^ (hb[i] ?? 0);
  return diff === 0;
}
