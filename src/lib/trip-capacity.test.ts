import { describe, expect, it } from "vitest";
import { blockedReason, maxBagsForRider } from "./trip-capacity";
import type { TripWithCounts } from "./types";

function makeTrip(overrides: Partial<TripWithCounts> = {}): TripWithCounts {
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
    visibility: "public",
    created_by: "user-1",
    created_at: "2026-08-01T10:00:00.000Z",
    vehicle_type_name: "Standard",
    seats_filled: 1,
    bags_filled: 1,
    cost_per_person: 40,
    ...overrides,
  };
}

describe("blockedReason", () => {
  it("returns null when the luggage fits", () => {
    expect(blockedReason(makeTrip(), 2)).toBeNull();
  });

  it("blocks luggage over the per-person cap", () => {
    const trip = makeTrip({ max_bags_per_person: 1 });
    expect(blockedReason(trip, 2)).toBe("Limits riders to 1 bag each");
  });

  it("allows exactly the per-person cap", () => {
    const trip = makeTrip({ max_bags_per_person: 2 });
    expect(blockedReason(trip, 2)).toBeNull();
  });

  it("pluralises the per-person cap message", () => {
    const trip = makeTrip({ max_bags_per_person: 2 });
    expect(blockedReason(trip, 3)).toBe("Limits riders to 2 bags each");
  });

  it("treats a null per-person cap as no limit", () => {
    const trip = makeTrip({ max_bags_per_person: null, bag_capacity: 10, bags_filled: 0 });
    expect(blockedReason(trip, 9)).toBeNull();
  });

  it("blocks luggage over the trip's remaining bag capacity", () => {
    const trip = makeTrip({ bag_capacity: 4, bags_filled: 3 });
    expect(blockedReason(trip, 2)).toBe("Not enough bag space left for your luggage");
  });

  it("allows luggage that exactly fills the remaining capacity", () => {
    const trip = makeTrip({ bag_capacity: 4, bags_filled: 3 });
    expect(blockedReason(trip, 1)).toBeNull();
  });

  it("reports the per-person cap first when both limits are exceeded", () => {
    const trip = makeTrip({ max_bags_per_person: 1, bag_capacity: 4, bags_filled: 4 });
    expect(blockedReason(trip, 3)).toBe("Limits riders to 1 bag each");
  });
});

describe("maxBagsForRider", () => {
  it("is the remaining capacity when there's no per-person cap", () => {
    expect(maxBagsForRider(makeTrip({ bag_capacity: 6, bags_filled: 2 }))).toBe(4);
  });

  it("is the per-person cap when that's the tighter limit", () => {
    const trip = makeTrip({ bag_capacity: 6, bags_filled: 2, max_bags_per_person: 2 });
    expect(maxBagsForRider(trip)).toBe(2);
  });

  it("is the remaining capacity when the per-person cap is looser", () => {
    const trip = makeTrip({ bag_capacity: 6, bags_filled: 5, max_bags_per_person: 3 });
    expect(maxBagsForRider(trip)).toBe(1);
  });
});
