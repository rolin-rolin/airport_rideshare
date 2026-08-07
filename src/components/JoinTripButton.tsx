"use client";

import { useActionState, useState } from "react";
import { joinTrip } from "@/app/dashboard/actions";
import { blockedReason, maxBagsForRider } from "@/lib/trip-capacity";
import type { TripWithCounts } from "@/lib/types";

// The one confirmation panel, shared by the board card and the trip detail
// page (DESIGN.md §4.3). Both post the same form to the same joinTrip
// action, so a private trip joins through exactly the path a public one
// does — visibility never forks the flow.
//
// The bag count typed here is what gets validated. The board's "Your
// luggage" filter used to gate the Join button while this input submitted
// an unrelated number, so filtering at 0 bags and then typing 5 sailed past
// the client check and failed with a raw Postgres message instead.
export function JoinTripButton({
  trip,
  defaultOpen = false,
}: {
  trip: TripWithCounts;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [bagCount, setBagCount] = useState(0);
  const [state, formAction, isPending] = useActionState(joinTrip, { error: null });

  const reason = blockedReason(trip, bagCount);

  const maxBags = maxBagsForRider(trip);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
      >
        Join
      </button>
    );
  }

  return (
    <form action={formAction} className="flex shrink-0 flex-wrap items-center gap-2">
      <input type="hidden" name="trip_id" value={trip.id} />
      <label className="flex items-center gap-1.5 text-body font-body text-foreground/70">
        Bags
        <input
          type="number"
          name="bag_count"
          min={0}
          max={Math.max(maxBags, 0)}
          value={bagCount}
          onChange={(e) => setBagCount(Number(e.target.value))}
          required
          className="w-12 rounded-md border border-border bg-background px-2 py-1 text-body font-body text-foreground outline-none focus:border-primary"
        />
      </label>
      <button
        type="submit"
        disabled={isPending || reason !== null}
        className="rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Joining..." : "Confirm"}
      </button>
      {reason && <p className="text-label font-body text-foreground/60">{reason}</p>}
      {state.error && <p className="text-label font-body text-red-700">{state.error}</p>}
    </form>
  );
}
