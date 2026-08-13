import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getMyActiveTrip } from "@/lib/trips";
import { CapacityRow } from "@/components/CapacityRow";
import { LeaveTripButton } from "@/components/LeaveTripButton";
import { GroupStatusFlash } from "@/components/GroupStatusFlash";
import { FormattedTripDate, FormattedTripTime } from "@/components/FormattedTripTime";
import { SetContactInfoForm } from "@/components/SetContactInfoForm";
import { tripPricing } from "@/lib/trip-pricing";

export async function GroupStatusBar() {
  const trip = await getMyActiveTrip();
  if (!trip) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ownership gets reassigned to the next-oldest rider when a trip's
  // contact leaves (migration 0017), which clears contact_method — so
  // whoever now holds created_by must set new contact info before the
  // trip can keep going without a dead point of contact.
  const needsContactInfo = trip.created_by === user?.id && !trip.contact_method;

  // includeViewer: false — the viewer is already one of trip.seats_filled,
  // so this is their real current price, not the hypothetical "if you join"
  // figure TripPricing shows on other cards.
  const pricing = tripPricing(trip, false);

  if (needsContactInfo) {
    return (
      <div className="border-b border-accent/30 bg-accent/10">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-label font-display font-semibold uppercase tracking-wide text-accent">
              You&apos;re now this trip&apos;s contact &middot;{" "}
              <FormattedTripDate iso={trip.departure_time} timeZone={trip.timezone} /> @{" "}
              <FormattedTripTime iso={trip.departure_time} timeZone={trip.timezone} />
            </p>
            <p className="mt-0.5 text-body font-body text-foreground">
              {trip.pickup_location} &rarr; {trip.dropoff_location}
            </p>
            {pricing && (
              <p className="mt-0.5 text-body font-body text-foreground">
                You&apos;re paying: ${Math.round(pricing.perPersonNow)}
              </p>
            )}
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
            <p className="mt-1.5 text-body font-body text-foreground">
              The previous contact left. Add a way for other riders to reach you, or leave the
              trip if you can&apos;t be the point of contact.
            </p>
            <SetContactInfoForm tripId={trip.id} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/dashboard/trips/${trip.id}`}
              className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              Your trip
            </Link>
            <LeaveTripButton contactMethod={trip.contact_method} contactValue={trip.contact_value} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <GroupStatusFlash
      tripId={trip.id}
      seatsFilled={trip.seats_filled}
      bagsFilled={trip.bags_filled}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label font-display font-semibold uppercase tracking-wide text-primary">
            Your trip &middot; <FormattedTripDate iso={trip.departure_time} timeZone={trip.timezone} /> @{" "}
            <FormattedTripTime iso={trip.departure_time} timeZone={trip.timezone} />
          </p>
          <p className="mt-0.5 text-body font-body text-foreground">
            {trip.pickup_location} &rarr; {trip.dropoff_location}
          </p>
          {pricing && (
            <p className="mt-0.5 text-body font-body text-foreground">
              You&apos;re paying: ${Math.round(pricing.perPersonNow)}
            </p>
          )}
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
          <Link
            href={`/dashboard/trips/${trip.id}`}
            className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5"
          >
            Your trip
          </Link>
          <LeaveTripButton contactMethod={trip.contact_method} contactValue={trip.contact_value} />
        </div>
      </div>
    </GroupStatusFlash>
  );
}
