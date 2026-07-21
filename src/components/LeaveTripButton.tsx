"use client";

import { useActionState } from "react";
import { leaveTrip } from "@/app/dashboard/actions";
import { useLeaveTripStatus } from "@/components/LeaveTripStatus";

export function LeaveTripButton({ groupmeLink }: { groupmeLink: string | null }) {
  const [state, formAction, isPending] = useActionState(leaveTrip, { error: null });
  const { notifyLeft } = useLeaveTripStatus();

  // Notify the LeaveTripStatusProvider optimistically, on click, rather
  // than reacting to the action's returned state in an effect. Once the
  // leaveTrip action resolves, Next.js's automatic revalidatePath-driven
  // refresh and this component's own state.left update land in the *same*
  // commit — GroupStatusBar's fresh (null) output unmounts this button in
  // that same pass, so a useEffect gated on state.left never gets to run
  // before it's torn down. Calling notifyLeft synchronously in the click
  // handler commits it in an earlier, separate render — well before the
  // server round-trip even starts — so it isn't racing the RSC payload
  // swap that clears the bar.
  return (
    <form action={formAction} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={isPending}
        onClick={() => notifyLeft(groupmeLink)}
        className="rounded-full border border-border px-4 py-1.5 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
      >
        {isPending ? "Leaving..." : "Leave trip"}
      </button>
      {state.error && (
        <p className="text-label font-body text-red-700">{state.error}</p>
      )}
    </form>
  );
}
