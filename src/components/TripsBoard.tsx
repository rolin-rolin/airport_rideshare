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
// trip-card-flash duration (2.5s).
const FLASH_MS = 2500;
// How long a card stays flagged as "entering" before the flag is cleared.
// Matches TripCard's trip-card-enter duration (0.35s) -- only cards flagged
// here get that animation, so an update to an already-displayed card can't
// retrigger it (see below).
const ENTER_MS = 350;

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
  // Cards currently playing the enter animation -- the initial board's own
  // trips count as "entering" too (a fresh page load is a fresh mount for
  // all of them), set below in the mount-only effect.
  const [enterIds, setEnterIds] = useState<Set<string>>(new Set());
  const prevCounts = useRef<Map<string, { seats_filled: number; bags_filled: number }>>(
    new Map(trips.map((t) => [t.id, { seats_filled: t.seats_filled, bags_filled: t.bags_filled }])),
  );
  const removeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const enterTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const removeTimersMap = removeTimers.current;
    const flashTimersMap = flashTimers.current;
    const enterTimersMap = enterTimers.current;
    return () => {
      removeTimersMap.forEach((t) => clearTimeout(t));
      flashTimersMap.forEach((t) => clearTimeout(t));
      enterTimersMap.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Flags the initial trips as "entering" once, on mount, so the board's
  // first paint still gets the same fade-in every card gets when it's
  // genuinely added later (see the trips-diffing effect below).
  useEffect(() => {
    const ids = trips.map((t) => t.id);
    setEnterIds(new Set(ids));
    for (const id of ids) {
      const timer = setTimeout(() => {
        enterTimers.current.delete(id);
        setEnterIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, ENTER_MS);
      enterTimers.current.set(id, timer);
    }
    // Mount-only: later trips arriving via props are handled by the
    // trips-diffing effect instead, which can tell new ids apart from
    // updates to ones already on the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const incomingIds = new Set(trips.map((t) => t.id));
    const newlyFlashed: string[] = [];
    const newlyEntering: string[] = [];

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
          newlyEntering.push(trip.id);
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

    if (newlyEntering.length > 0) {
      setEnterIds((prev) => new Set([...prev, ...newlyEntering]));
      for (const id of newlyEntering) {
        const existing = enterTimers.current.get(id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          enterTimers.current.delete(id);
          setEnterIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, ENTER_MS);
        enterTimers.current.set(id, timer);
      }
    }
  }, [trips]);

  const destinationOptions = useMemo(() => {
    return Array.from(new Set(displayed.map((t) => t.dropoff_location))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [displayed]);

  const filtered = useMemo(() => {
    return displayed.filter((trip) => {
      if (trip._removing) return true;
      if (date) {
        const tripDate = new Date(trip.departure_time).toLocaleDateString("en-CA", {
          timeZone: trip.timezone,
        });
        if (tripDate !== date) return false;
      }
      if (destination && trip.dropoff_location !== destination) return false;
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
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className={fieldClass}
          >
            <option value="">All destinations</option>
            {destinationOptions.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Your suitcases
          <select
            value={luggage}
            onChange={(e) => setLuggage(Number(e.target.value))}
            className={fieldClass}
          >
            {LUGGAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} suitcase{n === 1 ? "" : "s"}
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
                entering={enterIds.has(trip.id)}
                removing={trip._removing}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
