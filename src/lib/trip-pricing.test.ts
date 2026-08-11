import { describe, expect, it } from "vitest";
import { tripPricing } from "./trip-pricing";
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
    contact_method: null,
    contact_value: null,
    status: "open",
    visibility: "public",
    created_by: "user-1",
    created_at: "2026-08-01T10:00:00.000Z",
    vehicle_type_name: "Standard",
    seats_filled: 2,
    bags_filled: 2,
    ...overrides,
  };
}

describe("tripPricing", () => {
  it("prices per person among existing riders when the viewer isn't included", () => {
    const trip = makeTrip({ estimated_total_cost: 40, seats_filled: 2 });

    const pricing = tripPricing(trip, false);

    expect(pricing?.perPersonNow).toBe(20);
    expect(pricing?.includesViewer).toBe(false);
  });

  it("prices per person including the viewer's hypothetical seat", () => {
    const trip = makeTrip({ estimated_total_cost: 40, seats_filled: 2 });

    const pricing = tripPricing(trip, true);

    expect(pricing?.perPersonNow).toBe(40 / 3);
    expect(pricing?.includesViewer).toBe(true);
  });

  it("reports riders still needed to reach capacity from the priced denominator", () => {
    const trip = makeTrip({ estimated_total_cost: 40, seat_capacity: 4, seats_filled: 2 });

    expect(tripPricing(trip, true)?.moreNeeded).toBe(1);
    expect(tripPricing(trip, false)?.moreNeeded).toBe(2);
  });

  it("reports zero more needed, i.e. max savings, once the priced denominator hits capacity", () => {
    const trip = makeTrip({ estimated_total_cost: 40, seat_capacity: 4, seats_filled: 3 });

    expect(tripPricing(trip, true)?.moreNeeded).toBe(0);
  });

  it("computes the price at full capacity independent of the current denominator", () => {
    const trip = makeTrip({ estimated_total_cost: 40, seat_capacity: 4, seats_filled: 1 });

    expect(tripPricing(trip, false)?.perPersonAtCapacity).toBe(10);
  });

  it("returns null when estimated_total_cost is null", () => {
    const trip = makeTrip({ estimated_total_cost: null });

    expect(tripPricing(trip, true)).toBeNull();
  });

  it("returns null when there's nobody to divide the cost among (divide-by-zero guard)", () => {
    const trip = makeTrip({ estimated_total_cost: 40, seats_filled: 0 });

    expect(tripPricing(trip, false)).toBeNull();
  });
});
