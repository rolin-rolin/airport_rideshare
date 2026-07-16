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
  profiles: { email: string } | null;
};

// Attaches live seat/bag counts and cost-per-person to each trip, derived
// from active (left_at IS NULL) signups — DESIGN.md §7: "Live spot count and
// bag count are computed from active signups rows against seat_capacity /
// bag_capacity on the trip."
function withCounts(
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

// The board for one tab (To Airport / From Airport). Only open/full trips
// are shown — departed/expired trips are cleaned off the board per
// DESIGN.md §4.4, while a full trip stays visible (not hidden) per §4.3.
export async function getBoardTrips(direction: Direction): Promise<TripWithCounts[]> {
  const supabase = await createClient();

  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("*, vehicle_types(name)")
    .eq("direction", direction)
    .in("status", ["open", "full"])
    .order("flight_time", { ascending: true });

  if (tripsError) throw tripsError;
  if (trips.length === 0) return [];

  const { data: signups, error: signupsError } = await supabase
    .from("signups")
    .select("id, trip_id, user_id, bag_count, joined_at, profiles(email)")
    .in(
      "trip_id",
      trips.map((t) => t.id),
    )
    .is("left_at", null);

  if (signupsError) throw signupsError;

  return trips.map((trip) => withCounts(trip, signups as unknown as SignupRow[]));
}

function toMembers(signups: SignupRow[]): SignupMember[] {
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

// The current user's active trip (if any), with its full roster — powers
// the persistent group-status indicator required by DESIGN.md §4.3 ("shows
// trip details and who else is in it") and enforces "one active group at a
// time" in the UI (the DB's unique index is the actual source of truth).
export async function getMyActiveTrip(): Promise<TripWithMembers | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: mySignup, error: mySignupError } = await supabase
    .from("signups")
    .select("trip_id")
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (mySignupError) throw mySignupError;
  if (!mySignup) return null;

  return getTripWithMembers(mySignup.trip_id);
}
