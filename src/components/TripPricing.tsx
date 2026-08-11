import type { TripWithCounts } from "@/lib/types";
import { tripPricing } from "@/lib/trip-pricing";

// Shared by TripCard (board) and the trip detail page — see trip-pricing.ts
// for the underlying calculation. includeViewer should reflect whether the
// viewing user could join this trip right now (same eligibility as showing
// a JoinTripButton), so the headline price reads as their real price.
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

  return (
    <div className={className}>
      <span className="text-price font-display font-semibold text-live">
        ~${Math.round(pricing.perPersonNow)}
        <span className="text-body font-body font-normal text-foreground/60">
          /person{pricing.includesViewer ? " if you join" : ""}
        </span>
      </span>
      <p className="mt-0.5 text-label font-body text-foreground/50">
        {pricing.moreNeeded === 0
          ? "Max savings reached"
          : `$${Math.round(pricing.perPersonNow)}/person now → $${Math.round(pricing.perPersonAtCapacity)}/person if ${pricing.moreNeeded} more join`}
      </p>
    </div>
  );
}
