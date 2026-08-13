"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TripCard } from "@/components/TripCard";
import { blockedReason } from "@/lib/trip-capacity";
import type { Direction, TripWithCounts, TripWithMembers } from "@/lib/types";

const LUGGAGE_OPTIONS = [0, 1, 2, 3, 4, 5];

const fieldClass =
  "rounded-md border border-border bg-background px-3 py-2 text-body font-body text-foreground outline-none focus:border-primary";
const labelClass = "flex flex-col gap-1 text-label font-display font-semibold text-foreground/70";

// How long a trip that dropped off the board (expired/abandoned/departed)
// lingers, grayed out, before it's actually removed from local state. Must
// be >= TripCard's trip-card-exit animation delay (1s) + duration (0.4s) so
// the fade-out finishes before the node is unmounted out from under it.
const REMOVE_LINGER_MS = 1400;
// How long a flashed card stays flagged before the flag is cleared, letting
// a later change re-trigger the animation. Matches TripCard's
// trip-card-flash duration (1.2s).
const FLASH_MS = 1200;

type DisplayedTrip = TripWithCounts & { _removing?: boolean };

export function TripsBoard({
  trips,
  direction,
  myActiveTrip,
}: {
  trips: TripWithCounts[];
  direction: Direction;
  myActiveTrip: TripWithMembers | null;
}) {
  const [date, setDate] = useState("");
  const [destination, setDestination] = useState("");
  const [luggage, setLuggage] = useState(0);

  const [displayed, setDisplayed] = useState<DisplayedTrip[]>(trips);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const prevCounts = useRef<Map<string, { seats_filled: number; bags_filled: number }>>(
    new Map(trips.map((t) => [t.id, { seats_filled: t.seats_filled, bags_filled: t.bags_filled }])),
  );
  const removeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const removeTimersMap = removeTimers.current;
    const flashTimersMap = flashTimers.current;
    return () => {
      removeTimersMap.forEach((t) => clearTimeout(t));
      flashTimersMap.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    const incomingIds = new Set(trips.map((t) => t.id));
    const newlyFlashed: string[] = [];

    setDisplayed((prev) => {
      const next: DisplayedTrip[] = [];

      // Keep existing entries in their prior order, updating data for ones
      // still present and marking newly-missing ones as removing (so they
      // linger instead of vanishing immediately).
      for (const entry of prev) {
        if (incomingIds.has(entry.id)) {
          const fresh = trips.find((t) => t.id === entry.id)!;
          const prevSeen = prevCounts.current.get(entry.id);
          if (
            prevSeen &&
            (prevSeen.seats_filled !== fresh.seats_filled ||
              prevSeen.bags_filled !== fresh.bags_filled)
          ) {
            newlyFlashed.push(entry.id);
          }
          prevCounts.current.set(entry.id, {
            seats_filled: fresh.seats_filled,
            bags_filled: fresh.bags_filled,
          });
          // The server only ever sends open/full trips, so a trip that's
          // back in `trips` can't still be terminal — cancel any pending
          // removal from a prior refresh (e.g. it briefly left and rejoined
          // the open/full set) rather than leaving it stuck grayed out.
          const pendingRemoval = removeTimers.current.get(entry.id);
          if (pendingRemoval) {
            clearTimeout(pendingRemoval);
            removeTimers.current.delete(entry.id);
          }
          next.push({ ...fresh, _removing: false });
        } else if (!entry._removing) {
          const timer = setTimeout(() => {
            removeTimers.current.delete(entry.id);
            prevCounts.current.delete(entry.id);
            setDisplayed((cur) => cur.filter((t) => t.id !== entry.id));
          }, REMOVE_LINGER_MS);
          removeTimers.current.set(entry.id, timer);
          next.push({ ...entry, _removing: true });
        } else {
          next.push(entry);
        }
      }

      // Add genuinely new trips (never seen before).
      for (const trip of trips) {
        if (!prev.some((entry) => entry.id === trip.id)) {
          prevCounts.current.set(trip.id, {
            seats_filled: trip.seats_filled,
            bags_filled: trip.bags_filled,
          });
          next.push(trip);
        }
      }

      // `next` was built by walking `prev`'s order, so a new trip (pushed
      // above) or one that jumped the queue (e.g. its departure time
      // changed) would otherwise sit wherever it landed instead of where
      // `trips` — always server-sorted by departure_time — says it belongs.
      // Re-sorting here keeps the earliest-first order without discarding
      // the lingering/flash bookkeeping above.
      next.sort(
        (a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime(),
      );

      return next;
    });

    if (newlyFlashed.length > 0) {
      setFlashIds((prev) => new Set([...prev, ...newlyFlashed]));
      for (const id of newlyFlashed) {
        const existing = flashTimers.current.get(id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          flashTimers.current.delete(id);
          setFlashIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, FLASH_MS);
        flashTimers.current.set(id, timer);
      }
    }
  }, [trips]);

  const filtered = useMemo(() => {
    return displayed.filter((trip) => {
      if (trip._removing) return true;
      if (date) {
        const tripDate = new Date(trip.departure_time).toLocaleDateString("en-CA", {
          timeZone: trip.timezone,
        });
        if (tripDate !== date) return false;
      }
      if (destination.trim()) {
        const q = destination.trim().toLowerCase();
        if (
          !trip.pickup_location.toLowerCase().includes(q) &&
          !trip.dropoff_location.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [displayed, date, destination]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Destination
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="O'Hare"
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Your luggage
          <select
            value={luggage}
            onChange={(e) => setLuggage(Number(e.target.value))}
            className={fieldClass}
          >
            {LUGGAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} bag{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-body font-body text-foreground/50">
          {trips.length === 0 ? "No trips posted yet for this direction." : "No trips match your filters."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((trip) => {
            const isMine = trip.id === myActiveTrip?.id;
            const reason = isMine ? null : blockedReason(trip, luggage);
            return (
              <TripCard
                key={trip.id}
                trip={trip}
                direction={direction}
                isMine={isMine}
                canJoin={!myActiveTrip && trip.status === "open" && reason === null}
                blockedReason={reason}
                flash={flashIds.has(trip.id)}
                removing={trip._removing}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
