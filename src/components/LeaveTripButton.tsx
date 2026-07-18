"use client";

import { useActionState, useState } from "react";
import { leaveTrip } from "@/app/dashboard/actions";

export function LeaveTripButton({ groupmeLink }: { groupmeLink: string | null }) {
  const [left, setLeft] = useState(false);
  const [state, formAction, isPending] = useActionState(leaveTrip, { error: null });

  if (left && !state.error) {
    return (
      <p className="text-body font-body text-foreground/70">
        You&apos;ve left this trip. Don&apos;t forget to let the group know in
        GroupMe.
        {groupmeLink && (
          <>
            {" "}
            <a
              href={groupmeLink}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary underline"
            >
              Open GroupMe
            </a>
          </>
        )}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setLeft(true)}
      className="flex items-center gap-2"
    >
      <button
        type="submit"
        disabled={isPending}
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
