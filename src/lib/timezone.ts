// Trips depart from different physical locations in different timezones
// (e.g. O'Hare is Central, South Bend is Eastern), so there's no single
// timezone that's correct for every trip — the poster picks one explicitly
// at creation (see TripForm's timezone select) and it's stored per trip.
// Display and any date-based filtering must always use that trip's own
// timezone, never the viewer's device timezone: a viewer browsing from a
// different zone (e.g. calculating when they'll land, in airport-local
// time) would otherwise see times silently converted to their own zone and
// pick the wrong trip.
export type TripTimezone = "America/Chicago" | "America/New_York";

export const TIMEZONE_OPTIONS: { value: TripTimezone; label: string }[] = [
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/New_York", label: "Eastern Time" },
];

// Converts a <input type="datetime-local"> value (a naive "wall clock"
// string with no offset, e.g. "2026-08-15T15:45") into the UTC instant it
// represents *in `timeZone`* — not in the browser's own timezone the way
// `new Date(value)` would resolve it.
export function zonedDateTimeLocalToUtcIso(value: string, timeZone: TripTimezone): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = offsetMinutesAt(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMinutes * 60_000).toISOString();
}

// How far `timeZone`'s wall clock is ahead of UTC at `date`, in minutes.
function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}
