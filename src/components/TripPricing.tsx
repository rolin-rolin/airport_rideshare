"use client";

import type { TripWithCounts } from "@/lib/types";
import { tripPricing } from "@/lib/trip-pricing";
import { Tooltip } from "@/components/Tooltip";
import { PriceInfoButton } from "@/components/PriceInfoButton";

// $36 stays "$36"; $36.5 (from the form's step="0.01") becomes "$36.50".
function formatMoney(amount: number): string {
  return amount % 1 === 0 ? `${amount}` : amount.toFixed(2);
}

// Shared by TripCard (board) and the trip detail page — see trip-pricing.ts
// for the underlying calculation. includeViewer should be false only for a
// trip the viewer is already in (their real, current price); true for every
// other trip, so the headline reads as the hypothetical "if you join" price.
export function TripPricing({
  trip,
  includeViewer,
  className = "",
}: {
  trip: TripWithCounts;
  includeViewer: boolean;
  className?: string;
}) {
  const pricing = tripPricing(trip, includeViewer);
  if (!pricing) return null;

  const detail =
    pricing.moreNeeded === 0 ? (
      "Max savings reached — this is the lowest this trip's price will get"
    ) : (
      <>
        ${Math.round(pricing.perPersonNow)}/person{pricing.includesViewer ? " if you join" : ""}{" "}
        → ${Math.round(pricing.perPersonAtCapacity)}/person if trip fills up
      </>
    );

  return (
    <div className={className}>
      {trip.estimated_total_cost != null && (
        <p className="text-label font-body text-foreground/50">
          Trip total ${formatMoney(trip.estimated_total_cost)}
        </p>
      )}
      <div className="inline-flex items-center gap-1">
        <Tooltip content={detail}>
          <span className="cursor-help text-price font-display font-semibold text-live decoration-dotted decoration-1 underline-offset-4 hover:underline">
            ~${Math.round(pricing.perPersonNow)}
            <span className="text-body font-body font-normal text-foreground/60">
              /person{pricing.includesViewer ? " if you join" : ""}
            </span>
          </span>
        </Tooltip>
        <PriceInfoButton />
      </div>
    </div>
  );
}
