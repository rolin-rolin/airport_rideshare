"use client";

import { useEffect, useRef, useState } from "react";

// GroupStatusBar is an async Server Component and can't hold a ref across
// the router.refresh() calls TripsRealtimeListener triggers, so this small
// client wrapper does the seats/bags-changed detection instead — same
// flash-then-fade treatment as TripCard's, applied to the whole bar.
//
// Must match the animation-duration on trip-banner-flash (globals.css) and
// stay in sync with its 33.33% keyframe: the first 1.5s there is a darker,
// slower entrance down to the ambient pulse's own peak color, and the
// remaining 3s is a byte-for-byte replica of the pulse's real falling half
// (same duration/endpoints/easing) so the handoff back to the loop matches
// velocity, not just color.
const FLASH_MS = 4500;

export function GroupStatusFlash({
  tripId,
  seatsFilled,
  bagsFilled,
  children,
}: {
  tripId: string;
  seatsFilled: number;
  bagsFilled: number;
  children: React.ReactNode;
}) {
  const [flash, setFlash] = useState(false);
  const prev = useRef({ tripId, seatsFilled, bagsFilled });
  // A join near capacity can touch both the signups row and (via a
  // cascading trigger) the trips row in the same action, each broadcasting
  // its own realtime ping -- two refreshes close together for what's really
  // one logical update. Suppressing a fresh flash for a beat after the last
  // one started keeps that from reading as two separate flashes.
  const suppressUntil = useRef(0);

  useEffect(() => {
    const same = prev.current.tripId === tripId;
    const changed =
      same &&
      (prev.current.seatsFilled !== seatsFilled || prev.current.bagsFilled !== bagsFilled);
    prev.current = { tripId, seatsFilled, bagsFilled };

    // A different trip (user switched trips) just resets the baseline
    // silently -- only a capacity change on the *same* trip should flash.
    if (!changed) return;

    const now = Date.now();
    if (now < suppressUntil.current) return;
    suppressUntil.current = now + FLASH_MS;

    setFlash(true);
    const timer = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [tripId, seatsFilled, bagsFilled]);

  return (
    <div
      className={`border-b border-border bg-primary/[.06] motion-reduce:animate-none ${
        flash
          ? "animate-[trip-banner-flash_4.5s_ease-in-out]"
          : "animate-[trip-banner-pulse_6s_ease-in-out_infinite]"
      }`}
    >
      {children}
    </div>
  );
}
