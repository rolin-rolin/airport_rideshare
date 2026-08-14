"use client";

import { useEffect, useRef, useState } from "react";

// GroupStatusBar is an async Server Component and can't hold a ref across
// the router.refresh() calls TripsRealtimeListener triggers, so this small
// client wrapper does the seats/bags-changed detection instead — same
// flash-then-fade treatment as TripCard's, applied to the whole bar.
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

  useEffect(() => {
    const same = prev.current.tripId === tripId;
    const changed =
      same &&
      (prev.current.seatsFilled !== seatsFilled || prev.current.bagsFilled !== bagsFilled);
    prev.current = { tripId, seatsFilled, bagsFilled };

    // A different trip (user switched trips) just resets the baseline
    // silently -- only a capacity change on the *same* trip should flash.
    if (!changed) return;

    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(timer);
  }, [tripId, seatsFilled, bagsFilled]);

  return (
    <div
      className={`border-b border-border bg-primary/[.06] ${
        flash ? "animate-[trip-card-flash_2.5s_ease-out]" : ""
      }`}
    >
      {children}
    </div>
  );
}
