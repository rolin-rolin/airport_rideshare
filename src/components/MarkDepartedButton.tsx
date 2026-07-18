"use client";

import { useActionState } from "react";
import { markDeparted } from "@/app/dashboard/actions";

export function MarkDepartedButton({ tripId }: { tripId: string }) {
  const [state, formAction, isPending] = useActionState(markDeparted, { error: null });

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="trip_id" value={tripId} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
      >
        {isPending ? "Marking..." : "Mark departed"}
      </button>
      {state.error && (
        <p className="text-label font-body text-red-700">{state.error}</p>
      )}
    </form>
  );
}
