"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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
// no way to call revalidatePath. Subscribes to Postgres changes (enabled via
// migration 0012's `alter publication supabase_realtime add table ...`) and
// asks the router to re-fetch the current route's Server Components, the
// same refresh a server action's revalidatePath already triggers.
//
// RLS still gates what this subscription actually receives -- it can only
// ever hear about rows the signed-in user's own SELECT policies would let
// them read (0002, granted via 0009), so no data is exposed here that
// getBoardTrips/getMyActiveTrip wouldn't already return.
export function TripsRealtimeListener() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();

    // Coalesce bursts of change events (e.g. a cron sweep expiring several
    // trips at once) into a single refresh rather than one per row.
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) return;
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        if (REALTIME_REFRESH_EXCLUDED_PATHS.includes(pathnameRef.current)) return;
        router.refresh();
      }, 300);
    };

    const channel = supabase
      .channel("trips-and-signups-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
