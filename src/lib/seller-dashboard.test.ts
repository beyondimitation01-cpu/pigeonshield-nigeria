import { describe, expect, it } from "vitest";
import { canRenewSellerListing, sellerListingStatus } from "./seller-dashboard";

describe("seller listing statuses", () => {
  const now = 1000;
  it("keeps listings active strictly before expiry", () => {
    expect(sellerListingStatus({ is_active: true, batch_quantity: 1, expiry_date: 1001 }, now)).toBe("Active");
    expect(sellerListingStatus({ is_active: true, batch_quantity: 1, expiry_date: 1000 }, now)).toBe("Expired");
  });
  it("allows renewal only for expired stocked active listings", () => {
    expect(canRenewSellerListing({ is_active: true, batch_quantity: 1, expiry_date: 999 }, now)).toBe(true);
    expect(canRenewSellerListing({ is_active: true, batch_quantity: 1, expiry_date: 1001 }, now)).toBe(false);
  });
  it("never offers renewal for retired or sold-out listings", () => {
    expect(canRenewSellerListing({ is_active: false, batch_quantity: 1, expiry_date: 999 }, now)).toBe(false);
    expect(canRenewSellerListing({ is_active: true, batch_quantity: 0, expiry_date: 999 }, now)).toBe(false);
    expect(sellerListingStatus({ is_active: true, batch_quantity: 0, expiry_date: 1001 }, now)).toBe("Sold / retired");
  });
});