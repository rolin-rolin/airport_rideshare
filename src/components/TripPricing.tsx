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

  const detail =
    pricing.moreNeeded === 0
      ? "Max savings reached — this is the lowest this trip's price will get"
      : `$${Math.round(pricing.perPersonNow)}/person${
          pricing.includesViewer ? " if you join" : ""
        } → $${Math.round(pricing.perPersonAtCapacity)}/person if trip fills up`;

  return (
    <div className={className}>
      <span
        title={detail}
        className="cursor-help text-price font-display font-semibold text-live decoration-dotted decoration-1 underline-offset-4 hover:underline"
      >
        ~${Math.round(pricing.perPersonNow)}
        <span className="text-body font-body font-normal text-foreground/60">
          /person{pricing.includesViewer ? " if you join" : ""}
        </span>
      </span>
    </div>
  );
}
