"use client";

import { useState, useTransition, type FormEvent } from "react";
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
  defaultBagCount,
  onError,
}: {
  trip: TripWithCounts;
  defaultOpen?: boolean;
  // Pre-fills the suitcase input, e.g. with the count the rider already
  // picked in the board's "Your suitcases" filter before following the
  // Join link over to this trip's detail page.
  defaultBagCount?: number;
  // Called the instant joinTrip resolves with an error, in addition to (not
  // instead of) this component's own local `error` state below. A losing
  // bid for the last seat can resolve at the same tick as the realtime
  // "trip is now full" refresh that flips this button back to a plain
  // "Full" span in the parent — which unmounts this component before its
  // own re-render carrying the new local error ever gets painted. This
  // callback is a plain promise continuation, not a render, so it isn't at
  // risk of that same discard; a parent that outlives us (TripCard) can
  // hang onto it and keep the message visible after we're gone.
  onError?: (error: string) => void;
}) {
  const maxBags = maxBagsForRider(trip);
  const [open, setOpen] = useState(defaultOpen);
  const [bagCount, setBagCount] = useState(
    defaultBagCount != null ? String(Math.min(Math.max(defaultBagCount, 0), Math.max(maxBags, 0))) : "0",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reason = blockedReason(trip, Number(bagCount) || 0);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await joinTrip({ error: null }, formData);
      if (result.error) {
        onError?.(result.error);
        setError(result.error);
      }
    });
  }

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
    <form onSubmit={handleSubmit} className="flex shrink-0 flex-wrap items-center gap-2">
      <input type="hidden" name="trip_id" value={trip.id} />
      <label className="flex items-center gap-1.5 text-body font-body text-foreground/70">
        Suitcases
        <input
          type="number"
          name="bag_count"
          min={0}
          max={Math.max(maxBags, 0)}
          value={bagCount}
          onChange={(e) => setBagCount(e.target.value.replace(/^0+(?=\d)/, ""))}
          required
          title="Count whatever you can't fit on your lap"
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
      {error && <p className="text-label font-body text-red-700">{error}</p>}
    </form>
  );
}
