"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Direction, TripWithCounts } from "@/lib/types";
import { RouteDisplay } from "@/components/RouteDisplay";
import { CapacityRow } from "@/components/CapacityRow";
import { JoinTripButton } from "@/components/JoinTripButton";
import { TripPricing } from "@/components/TripPricing";
import { VehicleTypeInfoButton } from "@/components/VehicleTypeInfoButton";
import { Tooltip } from "@/components/Tooltip";
import { formatTripDate, formatTripTime } from "@/components/FormattedTripTime";

// How long a join failure stays visible after it's reported. Long enough to
// read, short enough not to stick around forever once it's stale.
const JOIN_ERROR_LINGER_MS = 8000;

const DIRECTION_LABEL: Record<Direction, string> = {
  to_airport: "Leaves campus",
  from_airport: "Leaves airport/station",
};

export function TripCard({
  trip,
  direction,
  isMine,
  canJoin,
  blockedReason = null,
  flash = false,
  entering = false,
  removing = false,
}: {
  trip: TripWithCounts;
  direction: Direction;
  isMine: boolean;
  canJoin: boolean;
  blockedReason?: string | null;
  flash?: boolean;
  entering?: boolean;
  removing?: boolean;
}) {
  // Owned here, one level up from JoinTripButton, so a join failure that
  // arrives the same tick as a realtime "trip is now full" refresh (which
  // flips canJoin false and unmounts JoinTripButton before its own local
  // error state ever renders) still gets shown. TripCard itself doesn't
  // unmount when canJoin flips, only the button inside it does.
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (joinErrorTimer.current) clearTimeout(joinErrorTimer.current);
    };
  }, []);

  function handleJoinError(error: string) {
    setJoinError(error);
    if (joinErrorTimer.current) clearTimeout(joinErrorTimer.current);
    joinErrorTimer.current = setTimeout(() => setJoinError(null), JOIN_ERROR_LINGER_MS);
  }

  return (
    <div
      className={`relative rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/40 ${
        removing
          ? "pointer-events-none animate-[trip-card-exit_0.4s_ease-in_1s_forwards] opacity-50"
          : flash
            ? "animate-[trip-card-flash_2.5s_ease-out]"
            : entering
              ? "animate-[trip-card-enter_0.35s_ease-out]"
              : ""
      } ${blockedReason && !isMine && !removing ? "opacity-50" : ""}`}
    >
      {/* Stretched link: covers the card so the whole thing opens the trip
          detail page, without wrapping the join form in an anchor (nesting
          a form inside a link would hijack clicks on the bag input). The
          action area below sits above it via z-10. */}
      <Link
        href={`/dashboard/trips/${trip.id}`}
        className="absolute inset-0 rounded-xl"
        aria-label={`View trip from ${trip.pickup_location} to ${trip.dropoff_location}`}
      />

      <p className="text-label font-body text-foreground/50">
        {DIRECTION_LABEL[direction]}
      </p>

      <div className="relative z-10 mt-1 flex items-end justify-between gap-3">
        <span className="text-price sm:text-display-lg font-display font-bold text-foreground">
          {formatTripDate(trip.departure_time, trip.timezone)} @{" "}
          {formatTripTime(trip.departure_time, trip.timezone)}
        </span>
        <TripPricing trip={trip} includeViewer={!isMine} className="shrink-0 text-right" />
      </div>

      <div className="mt-4">
        <RouteDisplay pickup={trip.pickup_location} dropoff={trip.dropoff_location} />
      </div>

      {trip.vehicle_type_name && (
        <p className="relative z-10 mt-4 flex items-center gap-1.5 text-label font-display font-semibold text-accent">
          {trip.vehicle_type_name}
          <VehicleTypeInfoButton />
        </p>
      )}

      {trip.max_bags_per_person != null && (
        <p className="mt-1.5 text-label font-body text-foreground/50">
          Max {trip.max_bags_per_person} suitcase{trip.max_bags_per_person === 1 ? "" : "s"} per person
        </p>
      )}

      <div className="relative z-10 mt-1.5 flex items-center justify-between gap-3">
        <CapacityRow
          seatsFilled={trip.seats_filled}
          seatCapacity={trip.seat_capacity}
          bagsFilled={trip.bags_filled}
          bagCapacity={trip.bag_capacity}
        />

        {removing ? (
          <span className="shrink-0 text-label font-display font-semibold text-foreground/40">
            No longer available
          </span>
        ) : isMine ? (
          <span className="shrink-0 text-label font-display font-semibold text-primary">
            Your trip
          </span>
        ) : blockedReason ? (
          <Tooltip content={<p className="text-background/90">{blockedReason}</p>}>
            <button
              type="button"
              className="shrink-0 cursor-help text-label font-display font-semibold text-foreground/40"
            >
              Won&apos;t fit
            </button>
          </Tooltip>
        ) : canJoin ? (
          <JoinTripButton trip={trip} onError={handleJoinError} />
        ) : trip.status === "full" ? (
          <span className="shrink-0 text-label font-display font-semibold text-foreground/40">
            Full
          </span>
        ) : null}
      </div>

      {joinError && !isMine && !removing && (
        <p className="relative z-10 mt-1.5 text-label font-body text-red-700">{joinError}</p>
      )}
    </div>
  );
}
