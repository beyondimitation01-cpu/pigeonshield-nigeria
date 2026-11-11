import { expect, it } from "vitest";
import { listingDescriptionWithAge } from "./listing-details";

it("saves supplied age together with listing details", () => {
  expect(listingDescriptionWithAge("Healthy racing pigeon", "6", "months")).toBe("Age: 6 months\n\nHealthy racing pigeon");
  expect(listingDescriptionWithAge("Local breed", "1", "years")).toBe("Age: 1 year\n\nLocal breed");
});
it("preserves details when optional age is absent", () => {
  expect(listingDescriptionWithAge(" Healthy bird ", "", "weeks")).toBe("Healthy bird");
});
it("rejects invalid supplied ages", () => {
  for (const age of ["0", "-1", "abc", "Infinity"]) expect(() => listingDescriptionWithAge("Bird", age, "months")).toThrow();
});