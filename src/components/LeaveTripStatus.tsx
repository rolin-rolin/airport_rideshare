"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "@/components/Modal";
import type { ContactMethod } from "@/lib/types";

type LeftInfo = { contactMethod: ContactMethod | null; contactValue: string | null };

type LeaveTripStatusContextValue = {
  notifyLeft: (contactMethod: ContactMethod | null, contactValue: string | null) => void;
};

const CONTACT_HREF: Record<ContactMethod, (value: string) => string> = {
  phone: (value) => `tel:${value}`,
  email: (value) => `mailto:${value}`,
  link: (value) => value,
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
// trip" panel survives the automatic route refresh Next.js triggers once the
// `leaveTrip` server action resolves (see dashboard/actions.ts's
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
// panel over `children` (rather than replacing it — this is the second of
// two panels the leave flow shows: LeaveTripButton's own confirm-you-want-
// to-leave panel comes first).
export function LeaveTripStatusProvider({ children }: { children: React.ReactNode }) {
  const [leftInfo, setLeftInfo] = useState<LeftInfo | null>(null);

  const notifyLeft = useCallback((contactMethod: ContactMethod | null, contactValue: string | null) => {
    setLeftInfo({ contactMethod, contactValue });
  }, []);

  return (
    <LeaveTripStatusContext.Provider value={{ notifyLeft }}>
      {children}
      {leftInfo && (
        <Modal>
          <p className="text-body font-body text-foreground">
            You&apos;ve left this trip. Don&apos;t forget to let the group
            know — you were part of their plans.
          </p>
          {leftInfo.contactMethod && leftInfo.contactValue && (
            <p className="mt-2">
              <a
                href={CONTACT_HREF[leftInfo.contactMethod](leftInfo.contactValue)}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline"
              >
                Reach the group
              </a>
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setLeftInfo(null)}
              className="rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </Modal>
      )}
    </LeaveTripStatusContext.Provider>
  );
}
