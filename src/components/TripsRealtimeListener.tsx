"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

// "idle" = no status callback has fired yet for this channel (e.g. no
// activeTripId, so the trip channel was never opened). Kept distinct from
// the real supabase-js states so we can tell "never subscribed" apart from
// "subscribed, then dropped" -- see the visibility rule below.
type ChannelStatus = REALTIME_SUBSCRIBE_STATES | "idle";

// Pages with no live board/roster data worth refreshing, where a
// self-triggered realtime event could otherwise race the page's own
// post-mutation navigation -- e.g. /dashboard/new: posting a trip commits a
// `trips` row, which fires this same listener via the tab's own
// subscription, and createTrip (actions.ts) redirects server-side once the
// write succeeds. There's no upside to also refreshing this page's stale
// getMyActiveTrip() in the moment before that redirect lands, and doing so
// risks flashing the "already in a trip" gate mid-navigation.
const REALTIME_REFRESH_EXCLUDED_PATHS = ["/dashboard/new"];

// Keeps an open dashboard tab in sync with changes to trips/signups that
// didn't originate from this tab's own server actions -- most notably the
// trip-cleanup cron job (0006/0007), which runs outside app code and so has
// no way to call revalidatePath. Listens via Realtime Broadcast (0014):
// DB triggers ping a "board-public" topic on any public-trip activity and a
// per-trip "trip:<id>" topic for the caller's own active trip, and this
// component just asks the router to re-fetch the current route's Server
// Components on any ping -- the same refresh a server action's
// revalidatePath already triggers. Pings carry no row data; the real data
// always comes back through the normal RLS-checked server fetch.
//
// Delivery is itself RLS-gated per topic (0014, mirroring 0013's read
// policies) -- a tab with no reason to hear about a private trip's activity
// never receives a ping for it in the first place.
export function TripsRealtimeListener({ activeTripId }: { activeTripId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Coalesce bursts of change events (e.g. a cron sweep expiring several
  // trips at once) into a single refresh rather than one per row. Shared
  // across both channels below so a board ping and a trip ping arriving
  // together still only trigger one refresh.
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      if (REALTIME_REFRESH_EXCLUDED_PATHS.includes(pathnameRef.current)) return;
      router.refresh();
    }, 300);
  }, [router]);

  // Per-channel subscribe status, surfaced as a small "reconnecting"
  // indicator below. Both start "idle" so the very first render (before
  // either channel's .subscribe() callback has fired at all) shows nothing
  // -- only a callback actually reporting a non-SUBSCRIBED state flips the
  // indicator on, whether that's an initial failure/timeout or a drop after
  // a prior successful subscribe.
  const [boardStatus, setBoardStatus] = useState<ChannelStatus>("idle");
  const [tripStatus, setTripStatus] = useState<ChannelStatus>("idle");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("board-public", { config: { private: true } })
      .on("broadcast", { event: "change" }, scheduleRefresh)
      .subscribe((status) => setBoardStatus(status));

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      supabase.removeChannel(channel);
      setBoardStatus("idle");
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    // No setTripStatus("idle") needed here: when activeTripId goes from set
    // to null, the previous run's cleanup below already resets it before
    // this effect body runs again.
    if (!activeTripId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`trip:${activeTripId}`, { config: { private: true } })
      .on("broadcast", { event: "change" }, scheduleRefresh)
      .subscribe((status) => setTripStatus(status));

    return () => {
      supabase.removeChannel(channel);
      setTripStatus("idle");
    };
  }, [activeTripId, scheduleRefresh]);

  // "idle" (no callback yet, or no trip channel open) never counts as
  // disconnected -- that's what keeps this from flashing on every normal
  // mount, per the rule above.
  const isDown = (status: ChannelStatus) => status !== "idle" && status !== "SUBSCRIBED";
  const showReconnecting = isDown(boardStatus) || isDown(tripStatus);

  if (!showReconnecting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2"
    >
      <div className="rounded-full border border-border bg-background px-3 py-1 text-label font-body text-accent shadow-sm">
        Reconnecting…
      </div>
    </div>
  );
}
