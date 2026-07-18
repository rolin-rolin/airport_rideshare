"use client";

import { useActionState, useState } from "react";
import { joinTrip } from "@/app/dashboard/actions";

export function JoinTripButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(joinTrip, { error: null });

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
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="trip_id" value={tripId} />
      <label className="flex items-center gap-1.5 text-body font-body text-foreground/70">
        Bags
        <input
          type="number"
          name="bag_count"
          min={0}
          defaultValue={0}
          required
          className="w-12 rounded-md border border-border bg-background px-2 py-1 text-body font-body text-foreground outline-none focus:border-primary"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Joining..." : "Confirm"}
      </button>
      {state.error && (
        <p className="text-label font-body text-red-700">{state.error}</p>
      )}
    </form>
  );
}
