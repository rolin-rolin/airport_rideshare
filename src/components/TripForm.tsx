"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createTrip } from "@/app/dashboard/actions";
import type { Direction, VehicleType } from "@/lib/types";

const fieldClass =
  "rounded-md border border-border bg-background px-3 py-2 text-body font-body text-foreground outline-none focus:border-primary";
const labelClass = "flex flex-col gap-1 text-label font-display font-semibold text-foreground/70";

export function TripForm({
  vehicleTypes,
  direction,
}: {
  vehicleTypes: VehicleType[];
  direction: Direction;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createTrip, { error: null });
  const [vehicleTypeId, setVehicleTypeId] = useState(vehicleTypes[0]?.id ?? "");
  const [seatCapacity, setSeatCapacity] = useState(vehicleTypes[0]?.default_seat_capacity ?? 0);
  const [bagCapacity, setBagCapacity] = useState(vehicleTypes[0]?.default_bag_capacity ?? 0);

  function handleVehicleTypeChange(id: string) {
    setVehicleTypeId(id);
    const vehicle = vehicleTypes.find((v) => v.id === id);
    if (vehicle) {
      setSeatCapacity(vehicle.default_seat_capacity);
      setBagCapacity(vehicle.default_bag_capacity);
    }
  }

  const [hasSubmitted, setHasSubmitted] = useState(false);
  useEffect(() => {
    if (hasSubmitted && !isPending && state.error === null) {
      router.push("/dashboard");
    }
  }, [hasSubmitted, isPending, state, router]);

  return (
    <form
      action={formAction}
      onSubmit={() => setHasSubmitted(true)}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="direction" value={direction} />

      <label className={labelClass}>
        Departure time
        <input type="datetime-local" name="departure_time" required className={fieldClass} />
      </label>

      <label className={labelClass}>
        Pickup location
        <input type="text" name="pickup_location" required placeholder="Dillon Hall" className={fieldClass} />
      </label>

      <label className={labelClass}>
        Dropoff location
        <input type="text" name="dropoff_location" required placeholder="O'Hare T1" className={fieldClass} />
      </label>

      <label className={labelClass}>
        Vehicle type
        <select
          name="vehicle_type_id"
          required
          value={vehicleTypeId}
          onChange={(e) => handleVehicleTypeChange(e.target.value)}
          className={fieldClass}
        >
          {vehicleTypes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.default_seat_capacity} seats, {v.default_bag_capacity} bags)
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-4">
        <label className={`flex-1 ${labelClass}`}>
          Seat capacity
          <input
            type="number"
            name="seat_capacity"
            min={1}
            required
            value={seatCapacity}
            onChange={(e) => setSeatCapacity(Number(e.target.value))}
            className={fieldClass}
          />
        </label>

        <label className={`flex-1 ${labelClass}`}>
          Bag capacity
          <input
            type="number"
            name="bag_capacity"
            min={0}
            required
            value={bagCapacity}
            onChange={(e) => setBagCapacity(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        Estimated total cost ($)
        <input type="number" name="estimated_total_cost" min={0} step="0.01" placeholder="36" className={fieldClass} />
      </label>

      <label className={labelClass}>
        GroupMe link
        <input type="url" name="groupme_link" placeholder="https://groupme.com/join_group/..." className={fieldClass} />
      </label>

      <label className={labelClass}>
        Your bag count
        <input type="number" name="bag_count" min={0} defaultValue={0} required className={fieldClass} />
      </label>

      {state.error && <p className="text-body font-body text-red-700">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-full bg-primary px-5 py-2.5 text-body font-display font-semibold text-background transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Posting..." : "Post trip"}
      </button>
    </form>
  );
}
