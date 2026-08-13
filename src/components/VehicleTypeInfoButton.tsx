"use client";

import { InfoIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

// Kept in one place — DESIGN.md §4.2's tier table is the source of truth,
// condensed here for an at-a-glance tooltip rather than the full rationale.
const VEHICLE_TIERS = [
  { name: "Standard (UberX / Lyft)", detail: "4 seats, ~2 suitcases" },
  { name: "XL (UberXL / Lyft XL)", detail: "6 seats, ~4-5 suitcases" },
  { name: "XXL (UberXXL / Lyft XXL)", detail: "6 seats, 6+ suitcases, guaranteed trunk space" },
];

function VehicleTypeInfo() {
  return (
    <div>
      <p className="text-background/90">Vehicle tiers are based on Uber/Lyft vehicle sizes:</p>
      <ul className="mt-1.5 space-y-1">
        {VEHICLE_TIERS.map((tier) => (
          <li key={tier.name}>
            <span className="font-semibold">{tier.name}:</span>{" "}
            <span className="text-background/80">{tier.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-background/70">
        Backpacks and personal items don&apos;t count toward either cap.
      </p>
    </div>
  );
}

export function VehicleTypeInfoButton() {
  return (
    <Tooltip content={<VehicleTypeInfo />}>
      <button
        type="button"
        aria-label="About vehicle tiers"
        className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-accent/60 hover:text-accent"
      >
        <InfoIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
