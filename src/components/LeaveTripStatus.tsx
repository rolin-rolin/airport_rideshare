"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type LeftInfo = { groupmeLink: string | null };

type LeaveTripStatusContextValue = {
  notifyLeft: (groupmeLink: string | null) => void;
};

const LeaveTripStatusContext = createContext<LeaveTripStatusContextValue | null>(null);

export function useLeaveTripStatus(): LeaveTripStatusContextValue {
  const ctx = useContext(LeaveTripStatusContext);
  if (!ctx) {
    throw new Error("useLeaveTripStatus must be used within a LeaveTripStatusProvider");
  }
  return ctx;
}

// Wraps GroupStatusBar (an async Server Component) so the "you've left this
// trip" confirmation survives the automatic route refresh Next.js triggers
// once the `leaveTrip` server action resolves (see dashboard/actions.ts's
// revalidatePath("/dashboard")). That refresh re-runs getMyActiveTrip(),
// which now returns null, so GroupStatusBar renders nothing. If the
// confirmation's state lived inside GroupStatusBar's own subtree (e.g. in
// LeaveTripButton), it would get unmounted by that refresh before the user
// ever saw it.
//
// This Provider is a Client Component instance sitting one level above
// GroupStatusBar. It survives the refresh (only its `children` prop — the
// re-rendered GroupStatusBar output — gets swapped out underneath it), so
// state set here isn't wiped out. LeaveTripButton reports "I just left" up
// to this Provider via context; the Provider then renders the confirmation
// itself instead of `children`, independent of whether GroupStatusBar still
// renders anything.
export function LeaveTripStatusProvider({ children }: { children: React.ReactNode }) {
  const [leftInfo, setLeftInfo] = useState<LeftInfo | null>(null);

  const notifyLeft = useCallback((groupmeLink: string | null) => {
    setLeftInfo({ groupmeLink });
  }, []);

  // Auto-dismiss after a while so the bar settles back into reflecting "no
  // active trip" (i.e. whatever `children` now is — nothing, since
  // GroupStatusBar will have already refreshed to null) without requiring
  // the user to click anything.
  useEffect(() => {
    if (!leftInfo) return;
    const timer = setTimeout(() => setLeftInfo(null), 8000);
    return () => clearTimeout(timer);
  }, [leftInfo]);

  return (
    <LeaveTripStatusContext.Provider value={{ notifyLeft }}>
      {leftInfo ? (
        <div className="border-b border-border bg-primary/[.06]">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <p className="text-body font-body text-foreground/70">
              You&apos;ve left this trip. Don&apos;t forget to let the group know in
              GroupMe.
              {leftInfo.groupmeLink && (
                <>
                  {" "}
                  <a
                    href={leftInfo.groupmeLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline"
                  >
                    Open GroupMe
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </LeaveTripStatusContext.Provider>
  );
}
