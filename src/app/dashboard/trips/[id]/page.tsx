import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getMyActiveTrip, getTripForView } from "@/lib/trips";
import { RouteDisplay } from "@/components/RouteDisplay";
import { CapacityRow } from "@/components/CapacityRow";
import { JoinTripButton } from "@/components/JoinTripButton";
import { TripPricing } from "@/components/TripPricing";
import { VehicleTypeInfoButton } from "@/components/VehicleTypeInfoButton";
import { CopyTripLinkButton } from "@/components/CopyTripLinkButton";
import {
  FormattedTripDate,
  FormattedTripTime,
} from "@/components/FormattedTripTime";
import {
  TripViewRealtimeFlash,
  FlashCard,
} from "@/components/TripViewRealtimeFlash";

const DIRECTION_LABEL = {
  to_airport: "Leaves campus at",
  from_airport: "Leaves airport at",
} as const;

const CONTACT_HREF = {
  phone: (value: string) => `tel:${value}`,
  email: (value: string) => `mailto:${value}`,
  link: (value: string) => value,
} as const;

const CONTACT_VERB = {
  phone: "Text",
  email: "Email",
  link: "Join",
} as const;

// The landing page for a shared trip link, and the detail view for any trip
// on the board. One page for both visibilities — a private trip differs
// only in not being listed, so it must not get its own join flow.
export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [trip, myActiveTrip] = await Promise.all([
    // Resolves private trips too: holding the UUID is what entitles the
    // viewer to see it (migration 0013's get_trip_for_view).
    getTripForView(id).catch(() => null),
    getMyActiveTrip(),
  ]);

  if (!trip) notFound();

  const isMember = trip.members.some((m) => m.user_id === user?.id);
  const isPoster = trip.created_by === user?.id;
  const inAnotherTrip = myActiveTrip != null && myActiveTrip.id !== trip.id;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <Link
        href={`/dashboard?dir=${trip.direction}`}
        className="text-label font-display font-semibold text-primary hover:underline"
      >
        &larr; Back to board
      </Link>

      <TripViewRealtimeFlash
        tripId={trip.id}
        seatsFilled={trip.seats_filled}
        bagsFilled={trip.bags_filled}
        memberCount={trip.members.length}
        status={trip.status}
        skipSubscribe={myActiveTrip?.id === trip.id}
      >
        <>
          <FlashCard className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-label font-body text-foreground/50">
                  {DIRECTION_LABEL[trip.direction]}
                </p>
                <p className="mt-1 text-time font-display font-bold text-foreground">
                  <FormattedTripDate
                    iso={trip.departure_time}
                    timeZone={trip.timezone}
                  />{" "}
                  @{" "}
                  <FormattedTripTime
                    iso={trip.departure_time}
                    timeZone={trip.timezone}
                  />
                </p>
              </div>
              {trip.visibility === "private" && (
                <span className="shrink-0 rounded-full bg-accent/15 px-3 py-1 text-label font-display font-semibold text-accent">
                  Private
                </span>
              )}
            </div>

            <div className="mt-4">
              <RouteDisplay
                pickup={trip.pickup_location}
                dropoff={trip.dropoff_location}
              />
            </div>

            <div className="mt-4">
              <TripPricing trip={trip} includeViewer={!isMember} />
            </div>

            {trip.vehicle_type_name && (
              <p className="mt-4 flex items-center gap-1.5 text-label font-display font-semibold text-accent">
                {trip.vehicle_type_name}
                <VehicleTypeInfoButton />
              </p>
            )}

            {trip.max_bags_per_person != null && (
              <p className="mt-1.5 text-label font-body text-foreground/50">
                Max {trip.max_bags_per_person} suitcase
                {trip.max_bags_per_person === 1 ? "" : "s"} per person
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
          </FlashCard>

          <FlashCard className="rounded-xl border border-border bg-background p-5">
            <h2 className="text-label font-display font-semibold uppercase tracking-wide text-foreground/50">
              Riders
            </h2>
            {trip.members.length === 0 ? (
              <p className="mt-2 text-body font-body text-foreground/50">
                No riders yet.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {trip.members.map((m) => (
                  <li
                    key={m.id}
                    className="text-body font-body text-foreground"
                  >
                    {m.email}
                    <span className="text-foreground/50">
                      {" "}
                      &middot; {m.bag_count} suitcase
                      {m.bag_count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {isMember && trip.contact_method && trip.contact_value && (
              <p className="mt-3 border-t border-border pt-3 text-body font-body text-foreground">
                {CONTACT_VERB[trip.contact_method]}{" "}
                <a
                  href={CONTACT_HREF[trip.contact_method](trip.contact_value)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline"
                >
                  {trip.contact_value}
                </a>{" "}
                to coordinate
              </p>
            )}
          </FlashCard>
        </>
      </TripViewRealtimeFlash>

      {/* Join states. Capacity never hides the panel — the rider hasn't said
          what they're carrying yet, and the bag input inside JoinTripButton
          is what validates it. Only seats-left and terminal status, neither
          of which depends on their input, replace it with a message. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isMember ? (
          <p className="text-body font-body text-primary">
            You&apos;re in this trip.
          </p>
        ) : trip.status === "expired" ? (
          <p className="text-body font-body text-foreground/50">
            This trip expired &mdash; trips expire an hour after the set
            departure time.
          </p>
        ) : trip.status === "abandoned" ? (
          <p className="text-body font-body text-foreground/50">
            This trip was abandoned &mdash; every rider left before departure.
          </p>
        ) : inAnotherTrip ? (
          <p className="text-body font-body text-foreground/50">
            You&apos;re already in a trip. Leave your current trip before
            joining this one.
          </p>
        ) : trip.status === "full" ? (
          <p className="text-body font-body text-foreground/50">
            This trip is full.
          </p>
        ) : (
          <JoinTripButton trip={trip} defaultOpen />
        )}

        {isPoster && trip.visibility === "private" && (
          <CopyTripLinkButton tripId={trip.id} />
        )}
      </div>

      {isPoster && trip.visibility === "private" && (
        <p className="text-label font-body text-foreground/50">
          This trip isn&apos;t on the board. Share the link with people you want
          to ride with.
        </p>
      )}
    </div>
  );
}
