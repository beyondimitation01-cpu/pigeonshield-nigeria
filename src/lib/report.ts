import { ADMIN_WHATSAPP } from "@/lib/pigeon-data";
import { formatNigerianPhone } from "@/lib/phone";

/**
 * Opens a prefilled WhatsApp report to the PigeonShield admin line.
 * Lives outside store.tsx so that file only exports React components/hooks
 * (a non-component export there breaks Fast Refresh and duplicates the
 * store context module, which surfaced as "useStore must be used inside
 * StoreProvider" after an edit).
 */
export function reportToAdmin(reference: string, adminPhone: string = ADMIN_WHATSAPP) {
  const to = formatNigerianPhone(adminPhone) || formatNigerianPhone(ADMIN_WHATSAPP);
  const text = encodeURIComponent(
    `PigeonShield Nigeria — Scam / Issue Report\nReference: ${reference}\nPlease investigate this transaction or listing.`,
  );
  window.open(`https://wa.me/${to}?text=${text}`, "_blank");
}
