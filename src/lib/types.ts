// Mirrors supabase/migrations/0002_trips_and_signups.sql.

export type Direction = "to_airport" | "from_airport";
export type TripStatus = "open" | "full" | "departed" | "expired" | "abandoned";

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
  pickup_location: string;
  dropoff_location: string;
  vehicle_type_id: string | null;
  seat_capacity: number;
  bag_capacity: number;
  estimated_total_cost: number | null;
  groupme_link: string | null;
  status: TripStatus;
  departed_at: string | null;
  created_by: string;
  created_at: string;
}

// A trip plus the live figures the board and detail views need — derived
// from active (left_at IS NULL) signups, per DESIGN.md §4.2/§7.
export interface TripWithCounts extends Trip {
  vehicle_type_name: string | null;
  seats_filled: number;
  bags_filled: number;
  cost_per_person: number | null;
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
