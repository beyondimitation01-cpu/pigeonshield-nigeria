import type { AuthError } from "@supabase/supabase-js";

export type PasswordResetErrorKind =
  | "rate_limited"
  | "recipient_not_authorized"
  | "temporary_unavailable"
  | "invalid_request"
  | "unknown";

/**
 * Convert Supabase Auth reset failures into stable, non-sensitive categories.
 * Never return raw provider messages, tokens, URLs, or email addresses.
 */
export function classifyPasswordResetError(error: AuthError | Error | unknown): PasswordResetErrorKind {
  if (!error || typeof error !== "object") return "unknown";

  const record = error as { status?: number; code?: string };
  const status = typeof record.status === "number" ? record.status : undefined;
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";

  if (status === 429 || code.includes("rate_limit") || code.includes("rate-limit")) {
    return "rate_limited";
  }

  if (
    code.includes("email_address_not_authorized") ||
    code.includes("email-not-authorized") ||
    code.includes("email_not_authorized")
  ) {
    return "recipient_not_authorized";
  }

  if (status === 400 || status === 422) return "invalid_request";
  if (status !== undefined && status >= 500) return "temporary_unavailable";

  return "unknown";
}

/** Safe user-facing copy that preserves anti-enumeration behavior. */
export function passwordResetErrorMessage(kind: PasswordResetErrorKind): string {
  switch (kind) {
    case "rate_limited":
      return "Reset requests are temporarily limited. Please wait a little while and try again.";
    case "recipient_not_authorized":
      return "Password-reset email delivery is currently unavailable for this address. Please try again later or contact support.";
    case "invalid_request":
      return "We could not process that reset request. Please check the email address and try again.";
    case "temporary_unavailable":
      return "Password-reset email delivery is temporarily unavailable. Please try again shortly.";
    default:
      return "We could not send the reset email right now. Please try again shortly.";
  }
}
