import { InfoIcon } from "@/components/icons";

// Kept in one place — DESIGN.md §4.2's tier table is the source of truth,
// condensed here for an at-a-glance tooltip rather than the full rationale.
const VEHICLE_TYPE_INFO = [
  "Vehicle tiers are based on Uber/Lyft vehicle sizes:",
  "Standard (UberX / Lyft): 4 seats, ~2 suitcases",
  "XL (UberXL / Lyft XL): 6 seats, ~4-5 suitcases",
  "XXL (UberXXL / Lyft XXL): 6 seats, 6+ suitcases, guaranteed trunk space",
  "Backpacks and personal items don't count toward either cap.",
].join("\n");

export function VehicleTypeInfoButton() {
  return (
    <button
      type="button"
      title={VEHICLE_TYPE_INFO}
      aria-label="About vehicle tiers"
      className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-accent/60 hover:text-accent"
    >
      <InfoIcon className="h-4 w-4" />
    </button>
  );
}
