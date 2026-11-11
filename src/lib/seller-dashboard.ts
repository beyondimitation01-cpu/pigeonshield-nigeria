import type { Listing } from "@/lib/pigeon-data";

export type ListingStatus = "Active" | "Expired" | "Sold / retired";

export function sellerListingStatus(listing: Pick<Listing, "is_active" | "batch_quantity" | "expiry_date">, now = Date.now()): ListingStatus {
  if (!listing.is_active || listing.batch_quantity <= 0) return "Sold / retired";
  return listing.expiry_date > now ? "Active" : "Expired";
}

export function canRenewSellerListing(listing: Pick<Listing, "is_active" | "batch_quantity" | "expiry_date">, now = Date.now()) {
  return sellerListingStatus(listing, now) === "Expired";
}