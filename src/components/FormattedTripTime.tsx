import type { TripTimezone } from "@/lib/timezone";

// Trip times are always shown in the trip's own timezone (see
// lib/timezone.ts), never the viewer's own device timezone -- a departure
// time only means anything relative to the physical location it's for, and
// different trips depart from different zones (O'Hare vs. South Bend). The
// explicit timeZoneName suffix (e.g. "3:45 PM CDT") is what lets a viewer
// browsing from a different zone tell the two apart instead of silently
// misreading it as their own local time.

export function formatTripTime(iso: string, timeZone: TripTimezone): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

// "<Month>, <Date>", e.g. "Aug, 15" — Intl has no built-in pattern for this
// exact pairing (its comma placement is for the year), so the two parts are
// formatted separately and joined by hand.
export function formatTripDate(iso: string, timeZone: TripTimezone): string {
  const d = new Date(iso);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone });
  const day = d.toLocaleDateString("en-US", { day: "numeric", timeZone });
  return `${month}, ${day}`;
}

export function FormattedTripTime({ iso, timeZone }: { iso: string; timeZone: TripTimezone }) {
  return <>{formatTripTime(iso, timeZone)}</>;
}

export function FormattedTripDate({ iso, timeZone }: { iso: string; timeZone: TripTimezone }) {
  return <>{formatTripDate(iso, timeZone)}</>;
}
