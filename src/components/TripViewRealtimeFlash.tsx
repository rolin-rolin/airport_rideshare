"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
//
const FLASH_MS = 2500;

// Passing `flash` down as a render-prop function would cross the
// Server->Client boundary from page.tsx (an async Server Component) as an
// unserializable function child. Context lets FlashCard read it instead
// while `children` stays plain, serializable ReactNode.
const FlashContext = createContext(false);

export function FlashCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const flash = useContext(FlashContext);
  return (
    <div
      className={`${className} ${
        flash ? "animate-[trip-card-flash_2.5s_ease-out]" : ""
      }`}
    >
      {children}
    </div>
  );
}

// skipSubscribe: true when tripId is the viewer's own activeTripId --
// TripsRealtimeListener (mounted for the whole dashboard layout) already
// holds a `trip:<id>` subscription for that case, and opening a second one
// to the identical topic on the same client makes the server treat the new
// phx_join as replacing the old one, knocking TripsRealtimeListener's
// channel into a non-SUBSCRIBED state it never recovers from -- a stuck
// "Reconnecting…" banner until the page is hard-refreshed.
export function TripViewRealtimeFlash({
  tripId,
  seatsFilled,
  bagsFilled,
  memberCount,
  status,
  skipSubscribe = false,
  children,
}: {
  tripId: string;
  seatsFilled: number;
  bagsFilled: number;
  memberCount: number;
  status: string;
  skipSubscribe?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const prev = useRef({ tripId, seatsFilled, bagsFilled, memberCount, status });
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A join near capacity can touch both the signups row and (via a
  // cascading trigger) the trips row in the same action, each broadcasting
  // its own realtime ping -- two refreshes close together for what's really
  // one logical update. Suppressing a fresh flash for a beat after the last
  // one started keeps that from reading as two separate flashes.
  const suppressUntil = useRef(0);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      router.refresh();
    }, 300);
  }, [router]);

  useEffect(() => {
    if (skipSubscribe) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`trip:${tripId}`, { config: { private: true } })
      .on("broadcast", { event: "change" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [tripId, skipSubscribe, scheduleRefresh]);

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

    const now = Date.now();
    if (now < suppressUntil.current) return;
    suppressUntil.current = now + FLASH_MS;

    setFlash(true);
    const timer = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [tripId, seatsFilled, bagsFilled, memberCount, status]);

  return (
    <FlashContext.Provider value={flash}>
      <div className="flex flex-col gap-5">{children}</div>
    </FlashContext.Provider>
  );
}
