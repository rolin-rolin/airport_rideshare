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

export function formatTripDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FormattedTripTime({ iso }: { iso: string }) {
  return <>{formatTripTime(iso)}</>;
}

export function FormattedTripDateTime({ iso }: { iso: string }) {
  return <>{formatTripDateTime(iso)}</>;
}
