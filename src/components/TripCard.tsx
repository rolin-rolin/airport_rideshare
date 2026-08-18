"use client";

import Link from "next/link";
import type { Direction, TripWithCounts } from "@/lib/types";
import { RouteDisplay } from "@/components/RouteDisplay";
import { CapacityRow } from "@/components/CapacityRow";
import { TripPricing } from "@/components/TripPricing";
import { VehicleTypeInfoButton } from "@/components/VehicleTypeInfoButton";
import { Tooltip } from "@/components/Tooltip";
import { formatTripDate, formatTripTime } from "@/components/FormattedTripTime";

const DIRECTION_LABEL: Record<Direction, string> = {
  to_airport: "Leaves campus",
  from_airport: "Leaves airport/station",
};

export function TripCard({
  trip,
  direction,
  isMine,
  canJoin,
  luggage = 0,
  blockedReason = null,
  flash = false,
  entering = false,
  removing = false,
}: {
  trip: TripWithCounts;
  direction: Direction;
  isMine: boolean;
  canJoin: boolean;
  // The count picked in the board's "Your suitcases" filter, carried over
  // as a query param so the trip detail page's join form opens pre-filled
  // instead of asking the rider to re-enter it.
  luggage?: number;
  blockedReason?: string | null;
  flash?: boolean;
  entering?: boolean;
  removing?: boolean;
}) {
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

      {/* @container: date and price scale down together (via cqw below) as
          this row's own width shrinks, instead of the price staying fixed
          size while only the date responds to the sm: breakpoint -- same
          technique as RouteDisplay's route text. */}
      <div className="@container relative z-10 mt-1 flex items-end justify-between gap-3">
        <span className="min-w-0 shrink text-[clamp(1.1rem,7cqw,1.375rem)] sm:text-display-lg font-display font-bold text-foreground">
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
          <Link
            href={`/dashboard/trips/${trip.id}?bags=${luggage}`}
            className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
          >
            Join
          </Link>
        ) : trip.status === "full" ? (
          <span className="shrink-0 text-label font-display font-semibold text-foreground/40">
            Full
          </span>
        ) : null}
      </div>
    </div>
  );
}
