import { describe, expect, it } from "vitest";
import { toMembers, withCounts } from "./trips";
import type { Trip } from "./types";

function makeTrip(overrides: Partial<Trip> = {}): Trip & { vehicle_types: { name: string } | null } {
  return {
    id: "trip-1",
    direction: "to_airport",
    departure_time: "2026-08-01T12:00:00.000Z",
    pickup_location: "Dorm",
    dropoff_location: "Airport",
    vehicle_type_id: "vt-1",
    seat_capacity: 4,
    bag_capacity: 4,
    max_bags_per_person: null,
    estimated_total_cost: 40,
    groupme_link: null,
    status: "open",
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

  it("computes cost_per_person from estimated_total_cost / seats_filled", () => {
    const trip = makeTrip({ estimated_total_cost: 40 });
    const signups = [
      makeSignup({ id: "s1", trip_id: "trip-1" }),
      makeSignup({ id: "s2", trip_id: "trip-1" }),
    ];

    expect(withCounts(trip, signups).cost_per_person).toBe(20);
  });

  it("cost_per_person is null when estimated_total_cost is null", () => {
    const trip = makeTrip({ estimated_total_cost: null });
    const signups = [makeSignup({ id: "s1", trip_id: "trip-1" })];

    expect(withCounts(trip, signups).cost_per_person).toBeNull();
  });

  it("cost_per_person is null when seats_filled is zero (divide-by-zero guard)", () => {
    const trip = makeTrip({ estimated_total_cost: 40 });

    expect(withCounts(trip, []).cost_per_person).toBeNull();
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

  it("falls back email to 'unknown' when profiles is null", () => {
    const [member] = toMembers([makeSignup({ id: "s1", profiles: null })]);

    expect(member.email).toBe("unknown");
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
