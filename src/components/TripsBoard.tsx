"use client";

import { useMemo, useState } from "react";
import { TripCard } from "@/components/TripCard";
import type { Direction, TripWithCounts, TripWithMembers } from "@/lib/types";

const LUGGAGE_OPTIONS = [0, 1, 2, 3, 4, 5];

const fieldClass =
  "rounded-md border border-border bg-background px-3 py-2 text-body font-body text-foreground outline-none focus:border-primary";
const labelClass = "flex flex-col gap-1 text-label font-display font-semibold text-foreground/70";

// A trip is unclickable if the rider's declared luggage would blow either
// the per-person cap or the trip's remaining bag capacity, or the trip is
// already full. The "full" case is left to the existing status handling in
// TripCard so its label stays "Full" rather than "Won't fit".
function blockedReason(trip: TripWithCounts, luggage: number): string | null {
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

export function TripsBoard({
  trips,
  direction,
  myActiveTrip,
}: {
  trips: TripWithCounts[];
  direction: Direction;
  myActiveTrip: TripWithMembers | null;
}) {
  const [date, setDate] = useState("");
  const [destination, setDestination] = useState("");
  const [luggage, setLuggage] = useState(0);

  const filtered = useMemo(() => {
    return trips.filter((trip) => {
      if (date) {
        const tripDate = new Date(trip.departure_time).toLocaleDateString("en-CA");
        if (tripDate !== date) return false;
      }
      if (destination.trim()) {
        const q = destination.trim().toLowerCase();
        if (
          !trip.pickup_location.toLowerCase().includes(q) &&
          !trip.dropoff_location.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [trips, date, destination]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Destination
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="O'Hare"
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Your luggage
          <select
            value={luggage}
            onChange={(e) => setLuggage(Number(e.target.value))}
            className={fieldClass}
          >
            {LUGGAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} bag{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-body font-body text-foreground/50">
          No trips match your filters.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((trip) => {
            const isMine = trip.id === myActiveTrip?.id;
            const reason = isMine ? null : blockedReason(trip, luggage);
            return (
              <TripCard
                key={trip.id}
                trip={trip}
                direction={direction}
                isMine={isMine}
                canJoin={!myActiveTrip && trip.status === "open" && reason === null}
                blockedReason={reason}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
