/**
 * Nigerian phone sanitation.
 * 08031234567 / +234 803 123 4567 / 8031234567 / 234-803-123-4567
 * all normalise to the WhatsApp-safe international form: 2348031234567.
 */
export function formatNigerianPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";

  let local = digits;
  if (local.startsWith("00234")) local = local.slice(5);
  else if (local.startsWith("234")) local = local.slice(3);
  else if (local.startsWith("0")) local = local.slice(1);

  // A valid Nigerian subscriber number is 10 digits after the country code.
  if (local.length > 10) local = local.slice(-10);
  if (local.length < 10) return "";
  return `234${local}`;
}

export function isValidNigerianPhone(phone: string | null | undefined): boolean {
  return formatNigerianPhone(phone).length === 13;
}

/** Human-friendly local display, e.g. 0803 123 4567. */
export function displayNigerianPhone(phone: string | null | undefined): string {
  const intl = formatNigerianPhone(phone);
  if (!intl) return String(phone ?? "");
  const local = `0${intl.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** wa.me deep link, or null when the number cannot be sanitised. */
export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const intl = formatNigerianPhone(phone);
  if (!intl) return null;
  const suffix = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${intl}${suffix}`;
}
