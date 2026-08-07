import Link from "next/link";
import type { Direction, TripWithCounts } from "@/lib/types";
import { RouteDisplay } from "@/components/RouteDisplay";
import { CapacityRow } from "@/components/CapacityRow";
import { JoinTripButton } from "@/components/JoinTripButton";

const DIRECTION_LABEL: Record<Direction, string> = {
  to_airport: "Leaves campus at",
  from_airport: "Leaves airport at",
};

function formatTime(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TripCard({
  trip,
  direction,
  isMine,
  canJoin,
  blockedReason = null,
  flash = false,
  removing = false,
}: {
  trip: TripWithCounts;
  direction: Direction;
  isMine: boolean;
  canJoin: boolean;
  blockedReason?: string | null;
  flash?: boolean;
  removing?: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/40 animate-[trip-card-enter_0.35s_ease-out] ${
        removing
          ? "pointer-events-none animate-[trip-card-exit_0.4s_ease-in_1s_forwards] opacity-50"
          : flash
            ? "animate-[trip-card-flash_1.2s_ease-out]"
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

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-time font-display font-bold text-foreground">
          {formatTime(trip.departure_time)}
        </span>
        {trip.cost_per_person != null && (
          <span className="text-price font-display font-semibold text-live">
            ~${Math.round(trip.cost_per_person)}
            <span className="text-body font-body font-normal text-foreground/60">
              /person est.
            </span>
          </span>
        )}
      </div>

      <div className="mt-4">
        <RouteDisplay pickup={trip.pickup_location} dropoff={trip.dropoff_location} />
      </div>

      {trip.vehicle_type_name && (
        <p className="mt-4 text-label font-display font-semibold text-accent">
          {trip.vehicle_type_name}
        </p>
      )}

      {trip.max_bags_per_person != null && (
        <p className="mt-1.5 text-label font-body text-foreground/50">
          Max {trip.max_bags_per_person} bag{trip.max_bags_per_person === 1 ? "" : "s"} per person
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
          <span
            title={blockedReason}
            className="shrink-0 text-label font-display font-semibold text-foreground/40"
          >
            Won&apos;t fit
          </span>
        ) : canJoin ? (
          <JoinTripButton trip={trip} />
        ) : trip.status === "full" ? (
          <span className="shrink-0 text-label font-display font-semibold text-foreground/40">
            Full
          </span>
        ) : null}
      </div>
    </div>
  );
}
