import { getMyActiveTrip } from "@/lib/trips";
import { CapacityRow } from "@/components/CapacityRow";
import { LeaveTripButton } from "@/components/LeaveTripButton";
import { MarkDepartedButton } from "@/components/MarkDepartedButton";

function formatTime(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function GroupStatusBar() {
  const trip = await getMyActiveTrip();
  if (!trip) return null;

  return (
    <div className="border-b border-border bg-primary/[.06]">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label font-display font-semibold uppercase tracking-wide text-primary">
            Your trip &middot; {formatTime(trip.departure_time)}
          </p>
          <p className="mt-0.5 text-body font-body text-foreground">
            {trip.pickup_location} &rarr; {trip.dropoff_location}
          </p>
          <div className="mt-1.5">
            <CapacityRow
              seatsFilled={trip.seats_filled}
              seatCapacity={trip.seat_capacity}
              bagsFilled={trip.bags_filled}
              bagCapacity={trip.bag_capacity}
            />
          </div>
          {trip.members.length > 0 && (
            <p className="mt-1.5 text-label font-body text-foreground/60">
              With: {trip.members.map((m) => m.email).join(", ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MarkDepartedButton tripId={trip.id} />
          <LeaveTripButton groupmeLink={trip.groupme_link} />
        </div>
      </div>
    </div>
  );
}
