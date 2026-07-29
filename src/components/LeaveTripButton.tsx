"use client";

import { useState, useTransition } from "react";
import { leaveTrip } from "@/app/dashboard/actions";
import { useLeaveTripStatus } from "@/components/LeaveTripStatus";

export function LeaveTripButton({ groupmeLink }: { groupmeLink: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { notifyLeft } = useLeaveTripStatus();

  // Call the action directly and await its real result, rather than firing
  // notifyLeft optimistically on click. This still avoids the race the
  // optimistic version worked around (Next's revalidatePath-driven refresh
  // unmounting this button in the same commit that would clear a
  // state.left flag read here) — but for a different reason: notifyLeft
  // sets state on LeaveTripStatusProvider, a component that stays mounted
  // regardless of what happens to this button, so it doesn't matter
  // whether this component is still alive by the time the await resolves.
  const handleLeave = () => {
    startTransition(async () => {
      const result = await leaveTrip();
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      notifyLeft(groupmeLink);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleLeave}
        className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
      >
        {isPending ? "Leaving..." : "Leave trip"}
      </button>
      {error && <p className="text-label font-body text-red-700">{error}</p>}
    </div>
  );
}
