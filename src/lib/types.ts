// Mirrors supabase/migrations/0002_trips_and_signups.sql.

import type { TripTimezone } from "@/lib/timezone";

export type Direction = "to_airport" | "from_airport";
export type TripStatus = "open" | "full" | "expired" | "abandoned";

// Whether a trip appears on the public board or is reachable only by its
// link (migration 0013). Affects discovery only — joining is identical.
export type TripVisibility = "public" | "private";

// How trip-mates coordinate off-platform. Nullable together — a trip either
// has one of these or none (DESIGN.md-style single-contact model, replacing
// the old always-a-GroupMe-link assumption).
export type ContactMethod = "phone" | "link" | "email";

export interface VehicleType {
  id: string;
  name: string;
  default_seat_capacity: number;
  default_bag_capacity: number;
}

export interface Trip {
  id: string;
  direction: Direction;
  departure_time: string;
  // The timezone the poster picked for departure_time (see lib/timezone.ts)
  // — the trip's physical departure point, not any viewer's own zone.
  timezone: TripTimezone;
  pickup_location: string;
  dropoff_location: string;
  vehicle_type_id: string | null;
  seat_capacity: number;
  bag_capacity: number;
  max_bags_per_person: number | null;
  estimated_total_cost: number | null;
  // Both null for a trip with no contact info on file. When set for the
  // caller, both are non-null — see trips_contact_consistency. get_trip_for
  // _view (migration 0016) nulls these out for any viewer who isn't an
  // active member or the poster, so a browsing/not-yet-joined viewer never
  // receives them regardless of what's actually on the row.
  contact_method: ContactMethod | null;
  contact_value: string | null;
  status: TripStatus;
  visibility: TripVisibility;
  created_by: string;
  created_at: string;
}

// A trip plus the live figures the board and detail views need — derived
// from active (left_at IS NULL) signups, per DESIGN.md §4.2/§7.
export interface TripWithCounts extends Trip {
  vehicle_type_name: string | null;
  seats_filled: number;
  bags_filled: number;
}

export interface SignupMember {
  id: string;
  user_id: string;
  email: string;
  bag_count: number;
  joined_at: string;
}

// A trip with its full active roster — used for the trip detail view and
// the persistent group-status indicator (DESIGN.md §4.3).
export interface TripWithMembers extends TripWithCounts {
  members: SignupMember[];
}
