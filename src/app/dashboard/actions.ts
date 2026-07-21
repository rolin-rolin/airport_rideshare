"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { Direction } from "@/lib/types";

type ActionState = { error: string | null };

// signups_one_active_per_user (0002) has no custom message, since a unique
// index can't carry one — translate the raw constraint violation into the
// same "one active group at a time" wording DESIGN.md §4.3 describes.
const ONE_ACTIVE_GROUP_MESSAGE =
  "You're already in a trip. Leave your current trip before joining another.";

function friendlyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return ONE_ACTIVE_GROUP_MESSAGE;
  return error.message;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

// Posting a trip also joins the poster to it (DESIGN.md §4.2/§4.3: the
// poster declares their own bag count same as any other joiner). Both rows
// are written atomically by the create_trip_with_signup RPC (see migration
// 0003) so a poster who's already in another active group gets rejected
// before any trip is created, rather than left with an empty post.
export async function createTrip(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();

  const direction = String(formData.get("direction")) as Direction;
  const departureTime = String(formData.get("departure_time"));
  const pickupLocation = String(formData.get("pickup_location") ?? "").trim();
  const dropoffLocation = String(formData.get("dropoff_location") ?? "").trim();
  const vehicleTypeId = String(formData.get("vehicle_type_id") ?? "");
  const seatCapacity = Number(formData.get("seat_capacity"));
  const bagCapacity = Number(formData.get("bag_capacity"));
  const estimatedTotalCostRaw = String(formData.get("estimated_total_cost") ?? "").trim();
  const groupmeLink = String(formData.get("groupme_link") ?? "").trim();
  const bagCount = Number(formData.get("bag_count") ?? 0);

  if (!pickupLocation || !dropoffLocation || !vehicleTypeId || !departureTime) {
    return { error: "Please fill in all required fields." };
  }
  if (!Number.isFinite(seatCapacity) || !Number.isFinite(bagCapacity)) {
    return { error: "Seat and bag capacity must be numbers." };
  }

  const { error } = await supabase.rpc("create_trip_with_signup", {
    p_direction: direction,
    p_departure_time: new Date(departureTime).toISOString(),
    p_pickup_location: pickupLocation,
    p_dropoff_location: dropoffLocation,
    p_vehicle_type_id: vehicleTypeId,
    p_seat_capacity: seatCapacity,
    p_bag_capacity: bagCapacity,
    p_estimated_total_cost: estimatedTotalCostRaw ? Number(estimatedTotalCostRaw) : null,
    p_groupme_link: groupmeLink || null,
    p_bag_count: bagCount,
  });

  if (error) return { error: friendlyError(error) };

  revalidatePath("/dashboard");
  return { error: null };
}

// Capacity (seats/bags) and the one-active-group rule are enforced by DB
// triggers (0002's signups_check_capacity, signups_one_active_per_user) —
// this just surfaces whatever they reject as a readable message.
export async function joinTrip(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser();

  const tripId = String(formData.get("trip_id") ?? "");
  const bagCount = Number(formData.get("bag_count") ?? 0);
  if (!tripId || !Number.isFinite(bagCount) || bagCount < 0) {
    return { error: "Invalid join request." };
  }

  const { error } = await supabase
    .from("signups")
    .insert({ trip_id: tripId, user_id: user.id, bag_count: bagCount });

  if (error) return { error: friendlyError(error) };

  revalidatePath("/dashboard");
  return { error: null };
}

// Leaves whichever trip the user is currently signed up for — a user can
// only ever have one active signup, so no trip_id is needed from the
// client. The caller is responsible for showing DESIGN.md §4.3's reminder
// to notify the group via GroupMe after this succeeds.
export async function leaveTrip(): Promise<ActionState> {
  const { supabase, user } = await requireUser();

  const { data: activeSignup, error: findError } = await supabase
    .from("signups")
    .select("id")
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (findError) return { error: friendlyError(findError) };
  if (!activeSignup) return { error: "You're not currently in a trip." };

  const { error } = await supabase
    .from("signups")
    .update({ left_at: new Date().toISOString() })
    .eq("id", activeSignup.id);

  if (error) return { error: friendlyError(error) };

  revalidatePath("/dashboard");
  return { error: null };
}

// Marking a trip departed (DESIGN.md §4.4) is a one-way status flip; RLS
// policy "Active members can mark a trip departed" (0002) already rejects
// this for anyone not currently signed up to the trip.
//
// Departure is meant to be terminal for everyone in the trip (DESIGN.md
// §4.4): migration 0005's close_trip_signups_on_departure trigger closes
// every member's signup (left_at) the moment status flips to 'departed',
// which is what actually frees the whole group to join/post elsewhere and
// makes the status bar disappear for all of them. The extra update below
// is just a same-user fallback for environments where that migration
// hasn't been applied yet — RLS ("Users can update their own signup")
// only lets this action close the *caller's* own row, not other members',
// so it's not a substitute for the trigger, only a partial mitigation.
export async function markDeparted(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser();

  const tripId = String(formData.get("trip_id") ?? "");
  if (!tripId) return { error: "Invalid trip." };

  const { error } = await supabase
    .from("trips")
    .update({ status: "departed" })
    .eq("id", tripId);

  if (error) return { error: friendlyError(error) };

  await supabase
    .from("signups")
    .update({ left_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .is("left_at", null);

  revalidatePath("/dashboard");
  return { error: null };
}
