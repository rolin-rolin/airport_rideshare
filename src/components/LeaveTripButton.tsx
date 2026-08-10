"use client";

import { useState, useTransition } from "react";
import { leaveTrip } from "@/app/dashboard/actions";
import { useLeaveTripStatus } from "@/components/LeaveTripStatus";
import { Modal } from "@/components/Modal";
import type { ContactMethod } from "@/lib/types";

export function LeaveTripButton({
  contactMethod,
  contactValue,
}: {
  contactMethod: ContactMethod | null;
  contactValue: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
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
  const handleConfirmLeave = () => {
    startTransition(async () => {
      const result = await leaveTrip();
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setConfirming(false);
      notifyLeft(contactMethod, contactValue);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5"
      >
        Leave trip
      </button>

      {confirming && (
        <Modal>
          <p className="text-body font-body text-foreground">
            Leave this trip? You&apos;ll lose your spot and it may open up to
            someone else.
          </p>
          {error && <p className="mt-2 text-label font-body text-red-700">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleConfirmLeave}
              className="rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Leaving..." : "Leave trip"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
