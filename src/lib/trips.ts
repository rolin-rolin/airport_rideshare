import { createClient } from "@/utils/supabase/server";
import type {
  Direction,
  SignupMember,
  Trip,
  TripWithCounts,
  TripWithMembers,
  VehicleType,
} from "@/lib/types";

// Reference list for the "New Trip" form (DESIGN.md §4.2).
export async function getVehicleTypes(): Promise<VehicleType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_types")
    .select("id, name, default_seat_capacity, default_bag_capacity")
    .order("default_seat_capacity", { ascending: true });

  if (error) throw error;
  return data;
}

type SignupRow = {
  id: string;
  trip_id: string;
  user_id: string;
  bag_count: number;
  joined_at: string;
  // Absent on the board query, which doesn't need names.
  profiles?: { email: string } | null;
};

// Attaches live seat/bag counts and cost-per-person to each trip, derived
// from active (left_at IS NULL) signups — DESIGN.md §7: "Live spot count and
// bag count are computed from active signups rows against seat_capacity /
// bag_capacity on the trip."
// Exported for unit testing; not otherwise part of the public API surface.
export function withCounts(
  trip: Trip & { vehicle_types: { name: string } | null },
  activeSignups: SignupRow[],
): TripWithCounts {
  const mine = activeSignups.filter((s) => s.trip_id === trip.id);
  const seats_filled = mine.length;
  const bags_filled = mine.reduce((sum, s) => sum + s.bag_count, 0);
  return {
    ...trip,
    vehicle_type_name: trip.vehicle_types?.name ?? null,
    seats_filled,
    bags_filled,
    cost_per_person:
      trip.estimated_total_cost != null && seats_filled > 0
        ? trip.estimated_total_cost / seats_filled
        : null,
  };
}

// The board for one tab (To Airport / From Airport). open/full trips are
// always shown (a full trip stays visible, not hidden, per §4.3) —
// abandoned/expired trips are cleaned off the board per DESIGN.md §4.4.
//
// Private trips are excluded here as well as by RLS (migration 0013): the
// policy still lets a poster and its members read their own private trip,
// and the board isn't where they should meet it.
export async function getBoardTrips(direction: Direction): Promise<TripWithCounts[]> {
  const supabase = await createClient();

  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("*, vehicle_types(name)")
    .eq("direction", direction)
    .eq("visibility", "public")
    .in("status", ["open", "full"])
    .order("departure_time", { ascending: true });

  if (tripsError) throw tripsError;
  if (trips.length === 0) return [];

  // No profiles embed: cards show counts, not names, and since 0013 emails
  // resolve only for your own trip-mates anyway.
  const { data: signups, error: signupsError } = await supabase
    .from("signups")
    .select("id, trip_id, user_id, bag_count, joined_at")
    .in(
      "trip_id",
      trips.map((t) => t.id),
    )
    .is("left_at", null);

  if (signupsError) throw signupsError;

  // The board never shows contact info (only a member/the poster is
  // entitled to see it — see get_trip_for_view, migration 0016), so it's
  // stripped here rather than merely left unrendered, keeping it out of the
  // RSC payload shipped to every browsing viewer's client.
  return trips.map((trip) => ({
    ...withCounts(trip, signups as unknown as SignupRow[]),
    contact_method: null,
    contact_value: null,
  }));
}

// Exported for unit testing; not otherwise part of the public API surface.
export function toMembers(signups: SignupRow[]): SignupMember[] {
  return signups
    .map((s) => ({
      id: s.id,
      user_id: s.user_id,
      email: s.profiles?.email ?? "unknown",
      bag_count: s.bag_count,
      joined_at: s.joined_at,
    }))
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

// Full roster for a single trip — used on the trip detail view.
export async function getTripWithMembers(tripId: string): Promise<TripWithMembers | null> {
  const supabase = await createClient();

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("*, vehicle_types(name)")
    .eq("id", tripId)
    .maybeSingle();

  if (tripError) throw tripError;
  if (!trip) return null;

  const { data: signups, error: signupsError } = await supabase
    .from("signups")
    .select("id, trip_id, user_id, bag_count, joined_at, profiles(email)")
    .eq("trip_id", tripId)
    .is("left_at", null);

  if (signupsError) throw signupsError;

  const rows = signups as unknown as SignupRow[];
  return { ...withCounts(trip, rows), members: toMembers(rows) };
}

// Resolves one trip for the detail page, public or private alike.
//
// Goes through the get_trip_for_view RPC rather than a direct select
// because a private trip is invisible under 0013's RLS to a link-holder who
// hasn't joined yet — possessing the (unguessable) UUID is what entitles
// them to see it. The RPC hands back exactly the shape withCounts/toMembers
// already consume, so counts are derived the same way as on the board.
export async function getTripForView(tripId: string): Promise<TripWithMembers | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_trip_for_view", { p_trip_id: tripId });

  if (error) throw error;
  if (!data) return null;

  const { trip, signups } = data as {
    trip: Trip & { vehicle_types: { name: string } | null };
    signups: SignupRow[];
  };

  return { ...withCounts(trip, signups), members: toMembers(signups) };
}

// The current user's active trip id, if any -- the same lookup
// getMyActiveTrip does, without paying for the full roster fetch. Used by
// the dashboard layout to know which realtime broadcast topic (0014) to
// subscribe to.
export async function getMyActiveTripId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: mySignup, error: mySignupError } = await supabase
    .from("signups")
    .select("trip_id, trips!inner(status)")
    .eq("user_id", user.id)
    .is("left_at", null)
    .in("trips.status", ["open", "full"])
    .maybeSingle();

  if (mySignupError) throw mySignupError;
  return mySignup?.trip_id ?? null;
}

// The current user's active trip (if any), with its full roster — powers
// the persistent group-status indicator required by DESIGN.md §4.3 ("shows
// trip details and who else is in it") and enforces "one active group at a
// time" in the UI (the DB's unique index is the actual source of truth).
export async function getMyActiveTrip(): Promise<TripWithMembers | null> {
  const tripId = await getMyActiveTripId();
  if (!tripId) return null;
  return getTripWithMembers(tripId);
}
