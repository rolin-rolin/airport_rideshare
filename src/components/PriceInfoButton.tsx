"use client";

import { InfoIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

// Static explainer for how per-person pricing works — the numbers specific
// to a given trip live in TripPricing's own hover tooltip on the price.
function PriceInfo() {
  return (
    <div>
      <p className="text-background/90">
        Estimated price splits the trip&apos;s total cost evenly among everyone riding.
      </p>
      <p className="mt-1.5 text-background/70">
        It drops as more people join, down to its lowest point once the trip is full.
      </p>
    </div>
  );
}

export function PriceInfoButton() {
  return (
    <Tooltip content={<PriceInfo />}>
      <button
        type="button"
        aria-label="About trip pricing"
        className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-accent/60 hover:text-accent"
      >
        <InfoIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
