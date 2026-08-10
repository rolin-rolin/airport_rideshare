"use client";

// Server components render once on the server, baking in the server's
// timezone -- wrong for any user whose device is in a different zone. These
// must stay client components so the browser's own timezone is used instead.

export function formatTripTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// "<Month>, <Date>", e.g. "Aug, 15" — Intl has no built-in pattern for this
// exact pairing (its comma placement is for the year), so the two parts are
// formatted separately and joined by hand.
export function formatTripDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.toLocaleDateString("en-US", { day: "numeric" });
  return `${month}, ${day}`;
}

export function FormattedTripTime({ iso }: { iso: string }) {
  return <>{formatTripTime(iso)}</>;
}

export function FormattedTripDate({ iso }: { iso: string }) {
  return <>{formatTripDate(iso)}</>;
}
