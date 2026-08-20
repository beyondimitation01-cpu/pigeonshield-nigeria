/**
 * Input sanitation middleware (client half).
 *
 * The database runs the authoritative sanitising triggers — this layer exists so
 * malicious text is never even rendered or sent. Both layers strip the same
 * vectors: HTML/script tags, javascript: and data: URIs, inline event handlers,
 * SQL comment/terminator noise and control characters.
 */

const TAGS = /<[^>]*>/g;
const VECTORS = /(javascript:|vbscript:|data:text\/html|on[a-z]+\s*=)/gi;
const SQL_NOISE = /(--|\/\*|\*\/|;\s*(drop|delete|update|insert|alter|truncate)\b)/gi;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(value: string, maxLength = 500): string {
  return value
    .replace(TAGS, "")
    .replace(VECTORS, "")
    .replace(SQL_NOISE, "")
    .replace(CONTROL, "")
    .replace(/\s{3,}/g, "  ")
    .trim()
    .slice(0, maxLength);
}

/** Digits (and a leading +) only — for phone numbers. */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, "").slice(0, 20);
}

/** Digits only — for bank account numbers. */
export function sanitizeDigits(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 20);
}

/** Non-negative integer naira amount, never NaN or Infinity. */
export function sanitizeAmount(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000_000) : 0;
}
