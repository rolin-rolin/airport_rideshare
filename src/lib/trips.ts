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

// Attaches live seat/bag counts to each trip, derived from active
// (left_at IS NULL) signups — DESIGN.md §7: "Live spot count and bag count
// are computed from active signups rows against seat_capacity / bag_capacity
// on the trip." Per-person pricing is derived separately, per-viewer, by
// trip-pricing.ts.
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
  };
}

// One row of get_board_trips (migration 0024): public columns plus
// aggregate seat/bag counts, with no contact info and no user ids.
type BoardTripRow = Omit<Trip, "contact_method" | "contact_value" | "created_by"> & {
  vehicle_type_name: string | null;
  seats_filled: number;
  bags_filled: number;
};

// The board for one tab (To Airport / From Airport). open/full trips are
// always shown (a full trip stays visible, not hidden, per §4.3) —
// abandoned/expired trips are cleaned off the board per DESIGN.md §4.4.
//
// Read through the get_board_trips RPC (migration 0024) for signed-in and
// signed-out viewers alike: it's the only board read anon is allowed, and
// it filters to public trips and returns counts instead of signup rows, so
// no viewer's browser is sent contact info, created_by or rider ids for
// trips it's only browsing.
export async function getBoardTrips(direction: Direction): Promise<TripWithCounts[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_board_trips", { p_direction: direction });
  if (error) throw error;

  // contact_*/created_by are filled with empty values to satisfy the Trip
  // shape the board components share with the detail view -- the board
  // never reads them (see get_trip_for_view for who may see contact info).
  return (data as BoardTripRow[]).map((trip) => ({
    ...trip,
    contact_method: null,
    contact_value: null,
    created_by: "",
  }));
}

// Exported for unit testing; not otherwise part of the public API surface.
export function toMembers(signups: SignupRow[]): SignupMember[] {
  return signups
    .map((s) => ({
      id: s.id,
      user_id: s.user_id,
      // profiles.email is not-null and every signup's user_id has a
      // matching profile row, so a null here only ever means
      // get_trip_for_view withheld it -- never a data gap.
      email: s.profiles?.email ?? null,
      bag_count: s.bag_count,
      joined_at: s.joined_at,
    }))
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
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
  // Goes through the same RPC as getTripForView rather than a direct trips
  // select: contact_method/contact_value are column-privilege-restricted
  // (migration 0019), so only a SECURITY DEFINER function like
  // get_trip_for_view can read them. Safe to rely on it here even though
  // it's built for "any viewer" -- the caller is always a member of their
  // own active trip by construction of getMyActiveTripId.
  return getTripForView(tripId);
}
