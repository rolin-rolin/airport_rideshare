import type { TripWithCounts } from "@/lib/types";

// Client-side mirrors of the join checks in check_signup_capacity
// (migration 0011). Kept in their own module rather than in trips.ts
// because both the board and the join panel are client components, and
// trips.ts pulls in the server-only Supabase client.
//
// Advisory only. The trigger re-runs all three checks inside the insert
// with the trip row locked, so a stale page or two riders racing for the
// last seat still get rejected server-side.

// Why a rider carrying this much luggage can't take this trip, or null if
// they can. Covers two of the three checks — the per-person cap and the
// trip's remaining bag capacity. The third (seats remaining) is carried by
// trip.status flipping to 'full' via sync_trip_status, and is handled by
// the caller so the label reads "Full" rather than "Won't fit".
export function blockedReason(trip: TripWithCounts, luggage: number): string | null {
  if (trip.max_bags_per_person != null && luggage > trip.max_bags_per_person) {
    return `Limits riders to ${trip.max_bags_per_person} bag${
      trip.max_bags_per_person === 1 ? "" : "s"
    } each`;
  }
  if (trip.bags_filled + luggage > trip.bag_capacity) {
    return "Not enough bag space left for your luggage";
  }
  return null;
}

// The largest bag count that could still be accepted: the per-person cap
// and the trip's remaining capacity, whichever bites first. Can be
// negative-free clamped by the caller for use as an input max.
export function maxBagsForRider(trip: TripWithCounts): number {
  const remaining = trip.bag_capacity - trip.bags_filled;
  return trip.max_bags_per_person != null
    ? Math.min(trip.max_bags_per_person, remaining)
    : remaining;
}
