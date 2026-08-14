"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

// The trip detail page (page.tsx) is an async Server Component, so it can't
// hold a ref across the router.refresh() this triggers -- same reason
// GroupStatusFlash exists for the dashboard banner. This wrapper subscribes
// to the viewed trip's own broadcast topic (0014/0015) so a user who clicked
// into a trip but hasn't joined yet still sees seats/riders/status change
// live, not just members of the trip (TripsRealtimeListener only opens this
// channel for the caller's *own* active trip).
//
// A viewer with no access to a private trip's topic gets CHANNEL_ERROR on
// subscribe -- expected and silent here (no "Reconnecting…" indicator): the
// page still works from its initial server-rendered data, it just won't get
// live updates, same as it wouldn't have before this component existed.
export function TripViewRealtimeFlash({
  tripId,
  seatsFilled,
  bagsFilled,
  memberCount,
  status,
  children,
}: {
  tripId: string;
  seatsFilled: number;
  bagsFilled: number;
  memberCount: number;
  status: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const prev = useRef({ tripId, seatsFilled, bagsFilled, memberCount, status });
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      router.refresh();
    }, 300);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`trip:${tripId}`, { config: { private: true } })
      .on("broadcast", { event: "change" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [tripId, scheduleRefresh]);

  useEffect(() => {
    const same = prev.current.tripId === tripId;
    const changed =
      same &&
      (prev.current.seatsFilled !== seatsFilled ||
        prev.current.bagsFilled !== bagsFilled ||
        prev.current.memberCount !== memberCount ||
        prev.current.status !== status);
    prev.current = { tripId, seatsFilled, bagsFilled, memberCount, status };

    // A different trip (navigated to another detail page) just resets the
    // baseline silently -- only a change on the *same* trip should flash.
    if (!changed) return;

    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(timer);
  }, [tripId, seatsFilled, bagsFilled, memberCount, status]);

  return (
    <div
      className={`flex flex-col gap-5 rounded-xl ${
        flash ? "animate-[trip-card-flash_2.5s_ease-out]" : ""
      }`}
    >
      {children}
    </div>
  );
}
