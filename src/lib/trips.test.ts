import { describe, expect, it } from "vitest";
import { toMembers, withCounts } from "./trips";
import type { Trip } from "./types";

type TripRow = Trip & { vehicle_types: { name: string } | null };

function makeTrip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    direction: "to_airport",
    departure_time: "2026-08-01T12:00:00.000Z",
    timezone: "America/Chicago",
    pickup_location: "Dorm",
    dropoff_location: "Airport",
    vehicle_type_id: "vt-1",
    seat_capacity: 4,
    bag_capacity: 4,
    max_bags_per_person: null,
    estimated_total_cost: 40,
    contact_method: null,
    contact_value: null,
    status: "open",
    visibility: "public",
    created_by: "user-1",
    created_at: "2026-08-01T10:00:00.000Z",
    vehicle_types: { name: "Standard" },
    ...overrides,
  };
}

function makeSignup(overrides: Record<string, unknown> = {}) {
  return {
    id: "signup-1",
    trip_id: "trip-1",
    user_id: "user-1",
    bag_count: 1,
    joined_at: "2026-08-01T10:05:00.000Z",
    profiles: { email: "a@nd.edu" },
    ...overrides,
  };
}

describe("withCounts", () => {
  it("only counts active signups matching the trip's id", () => {
    const trip = makeTrip();
    const signups = [
      makeSignup({ id: "s1", trip_id: "trip-1", bag_count: 1 }),
      makeSignup({ id: "s2", trip_id: "trip-1", bag_count: 2 }),
      makeSignup({ id: "s3", trip_id: "other-trip", bag_count: 5 }),
    ];

    const result = withCounts(trip, signups);

    expect(result.seats_filled).toBe(2);
    expect(result.bags_filled).toBe(3);
  });

  it("falls back vehicle_type_name to null when vehicle_types is null", () => {
    const trip = makeTrip({ vehicle_types: null });

    expect(withCounts(trip, []).vehicle_type_name).toBeNull();
  });

  it("returns zero counts when there are no matching signups", () => {
    const trip = makeTrip();

    const result = withCounts(trip, []);

    expect(result.seats_filled).toBe(0);
    expect(result.bags_filled).toBe(0);
  });
});

describe("toMembers", () => {
  it("maps signup rows to the member shape", () => {
    const [member] = toMembers([
      makeSignup({
        id: "s1",
        user_id: "user-1",
        bag_count: 2,
        joined_at: "2026-08-01T10:05:00.000Z",
        profiles: { email: "a@nd.edu" },
      }),
    ]);

    expect(member).toEqual({
      id: "s1",
      user_id: "user-1",
      email: "a@nd.edu",
      bag_count: 2,
      joined_at: "2026-08-01T10:05:00.000Z",
    });
  });

  it("falls back email to null when profiles is null (get_trip_for_view withheld it)", () => {
    const [member] = toMembers([makeSignup({ id: "s1", profiles: null })]);

    expect(member.email).toBeNull();
  });

  it("sorts members ascending by joined_at", () => {
    const members = toMembers([
      makeSignup({ id: "s-later", joined_at: "2026-08-01T12:00:00.000Z" }),
      makeSignup({ id: "s-earlier", joined_at: "2026-08-01T09:00:00.000Z" }),
      makeSignup({ id: "s-middle", joined_at: "2026-08-01T10:30:00.000Z" }),
    ]);

    expect(members.map((m) => m.id)).toEqual(["s-earlier", "s-middle", "s-later"]);
  });

  it("returns an empty array for empty input", () => {
    expect(toMembers([])).toEqual([]);
  });
});
