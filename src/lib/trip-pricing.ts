import type { TripWithCounts } from "@/lib/types";

// Client-safe pricing derivation, kept alongside trip-capacity.ts for the
// same reason: both TripCard (client) and the trip detail page (server)
// need it, and trips.ts pulls in the server-only Supabase client.

export interface TripPricing {
  // Per-person price at the denominator this call is scoped to — the
  // viewer's hypothetical share if includesViewer, otherwise the plain
  // current rate among existing riders.
  perPersonNow: number;
  includesViewer: boolean;
  // Per-person price if the trip fills to seat_capacity.
  perPersonAtCapacity: number;
  // Riders still needed (from perPersonNow's denominator) to reach
  // seat_capacity. 0 means that price is already the cheapest it gets.
  moreNeeded: number;
}

// Null when there's no estimated cost to divide, or nothing to divide it
// among (mirrors the seats_filled > 0 guard the old cost_per_person had).
export function tripPricing(trip: TripWithCounts, includeViewer: boolean): TripPricing | null {
  if (trip.estimated_total_cost == null) return null;
  const denom = trip.seats_filled + (includeViewer ? 1 : 0);
  if (denom <= 0) return null;
  return {
    perPersonNow: trip.estimated_total_cost / denom,
    includesViewer: includeViewer,
    perPersonAtCapacity: trip.estimated_total_cost / trip.seat_capacity,
    moreNeeded: Math.max(trip.seat_capacity - denom, 0),
  };
}
