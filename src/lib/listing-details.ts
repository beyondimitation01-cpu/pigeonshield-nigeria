export type AgeUnit = "weeks" | "months" | "years";

export function listingDescriptionWithAge(description: string, age: string, unit: AgeUnit) {
  const details = description.trim();
  if (!age.trim()) return details;
  const value = Number(age);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an age greater than zero.");
  const label = value === 1 ? unit.slice(0, -1) : unit;
  return `Age: ${value} ${label}\n\n${details}`;
}