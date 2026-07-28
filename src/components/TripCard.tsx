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
}: {
  trip: TripWithCounts;
  direction: Direction;
  isMine: boolean;
  canJoin: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
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

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <CapacityRow
          seatsFilled={trip.seats_filled}
          seatCapacity={trip.seat_capacity}
          bagsFilled={trip.bags_filled}
          bagCapacity={trip.bag_capacity}
        />

        {isMine ? (
          <span className="shrink-0 text-label font-display font-semibold text-primary">
            Your trip
          </span>
        ) : canJoin ? (
          <JoinTripButton tripId={trip.id} />
        ) : trip.status === "full" ? (
          <span className="shrink-0 text-label font-display font-semibold text-foreground/40">
            Full
          </span>
        ) : null}
      </div>
    </div>
  );
}
