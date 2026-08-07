"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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

  useEffect(() => {
    const supabase = createClient();

    // Coalesce bursts of change events (e.g. a cron sweep expiring several
    // trips at once) into a single refresh rather than one per row.
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) return;
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
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
