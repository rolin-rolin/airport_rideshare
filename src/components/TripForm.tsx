"use client";

import { useActionState, useState } from "react";
import { createTrip } from "@/app/dashboard/actions";
import type { ContactMethod, Direction, VehicleType } from "@/lib/types";

const CONTACT_METHOD_OPTIONS: { value: ContactMethod; label: string; inputType: string; placeholder: string }[] = [
  { value: "phone", label: "Phone number", inputType: "tel", placeholder: "(555) 123-4567" },
  { value: "link", label: "Group chat link", inputType: "url", placeholder: "https://groupme.com/join_group/..." },
  { value: "email", label: "Email", inputType: "email", placeholder: "you@example.com" },
];

// Every field is required except max luggage per person and the private
// checkbox. Rather than the browser's native `required` (which blocks
// submission with its own popover before the user ever sees which fields
// are at fault), validity is tracked here and only surfaced — as a red
// border, per field — once the user has actually tried to submit.
type FieldName =
  | "departure_time"
  | "pickup_location"
  | "dropoff_location"
  | "vehicle_type_id"
  | "estimated_total_cost"
  | "contact_method"
  | "contact_value"
  | "bag_count";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-body font-body text-foreground outline-none focus:border-primary";
const labelClass = "flex flex-col gap-1 text-label font-display font-semibold text-foreground/70";
const invalidFieldClass = "border-red-500 focus:border-red-500";

export function TripForm({
  vehicleTypes,
  direction,
}: {
  vehicleTypes: VehicleType[];
  direction: Direction;
}) {
  const [state, formAction, isPending] = useActionState(createTrip, { error: null });
  const [vehicleTypeId, setVehicleTypeId] = useState(vehicleTypes[0]?.id ?? "");
  const [seatCapacity, setSeatCapacity] = useState(vehicleTypes[0]?.default_seat_capacity ?? 0);
  const [bagCapacity, setBagCapacity] = useState(vehicleTypes[0]?.default_bag_capacity ?? 0);
  // datetime-local's raw value has no timezone, so it must be converted to
  // an unambiguous ISO string here, in the browser, where `new Date` resolves
  // it against the user's own timezone. Doing this conversion in the server
  // action instead would resolve it against the server's timezone, silently
  // storing the wrong instant for any user not in that zone.
  const [departureTimeLocal, setDepartureTimeLocal] = useState("");
  const departureTimeIso = departureTimeLocal ? new Date(departureTimeLocal).toISOString() : "";
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [estimatedTotalCost, setEstimatedTotalCost] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactMethod | "">("");
  const [contactValue, setContactValue] = useState("");
  const [bagCount, setBagCount] = useState("0");
  const [maxBagsPerPerson, setMaxBagsPerPerson] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<FieldName>>(new Set());

  function handleVehicleTypeChange(id: string) {
    setVehicleTypeId(id);
    const vehicle = vehicleTypes.find((v) => v.id === id);
    if (vehicle) {
      setSeatCapacity(vehicle.default_seat_capacity);
      setBagCapacity(vehicle.default_bag_capacity);
    }
  }

  function fieldClassFor(name: FieldName) {
    return `${fieldClass} ${invalidFields.has(name) ? invalidFieldClass : ""}`;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const invalid = new Set<FieldName>();
    if (!departureTimeIso) invalid.add("departure_time");
    if (!pickupLocation.trim()) invalid.add("pickup_location");
    if (!dropoffLocation.trim()) invalid.add("dropoff_location");
    if (!vehicleTypeId) invalid.add("vehicle_type_id");
    if (!estimatedTotalCost.trim()) invalid.add("estimated_total_cost");
    if (!contactMethod) invalid.add("contact_method");
    if (contactMethod && !contactValue.trim()) invalid.add("contact_value");
    if (!bagCount.trim()) invalid.add("bag_count");

    setInvalidFields(invalid);
    if (invalid.size > 0) {
      e.preventDefault();
    }
  }

  // On success createTrip redirects server-side (see actions.ts) straight to
  // the new trip's page, so this component only ever sees state.error !=
  // null -- there's no success state to react to here.
  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="direction" value={direction} />

      <input type="hidden" name="departure_time" value={departureTimeIso} />
      <label className={labelClass}>
        Departure time
        <input
          type="datetime-local"
          className={fieldClassFor("departure_time")}
          value={departureTimeLocal}
          onChange={(e) => setDepartureTimeLocal(e.target.value)}
        />
      </label>

      <label className={labelClass}>
        Pickup location
        <input
          type="text"
          name="pickup_location"
          placeholder="Dillon Hall"
          value={pickupLocation}
          onChange={(e) => setPickupLocation(e.target.value)}
          className={fieldClassFor("pickup_location")}
        />
      </label>

      <label className={labelClass}>
        Dropoff location
        <input
          type="text"
          name="dropoff_location"
          placeholder="O'Hare T1"
          value={dropoffLocation}
          onChange={(e) => setDropoffLocation(e.target.value)}
          className={fieldClassFor("dropoff_location")}
        />
      </label>

      <label className={labelClass}>
        Vehicle type
        <select
          name="vehicle_type_id"
          value={vehicleTypeId}
          onChange={(e) => handleVehicleTypeChange(e.target.value)}
          className={fieldClassFor("vehicle_type_id")}
        >
          {vehicleTypes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.default_seat_capacity} seats, {v.default_bag_capacity} bags)
            </option>
          ))}
        </select>
      </label>

      <div className="flex w-full gap-4">
        <label className={`min-w-0 flex-1 ${labelClass}`}>
          Seat capacity
          <input
            type="number"
            name="seat_capacity"
            min={1}
            value={seatCapacity}
            onChange={(e) => setSeatCapacity(Number(e.target.value))}
            className={fieldClass}
          />
        </label>

        <label className={`min-w-0 flex-1 ${labelClass}`}>
          Bag capacity
          <input
            type="number"
            name="bag_capacity"
            min={0}
            value={bagCapacity}
            onChange={(e) => setBagCapacity(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        Max luggage per person (optional)
        <input
          type="number"
          name="max_bags_per_person"
          min={0}
          placeholder="No limit"
          value={maxBagsPerPerson}
          onChange={(e) => setMaxBagsPerPerson(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Estimated total cost ($)
        <input
          type="number"
          name="estimated_total_cost"
          min={0}
          step="0.01"
          placeholder="36"
          value={estimatedTotalCost}
          onChange={(e) => setEstimatedTotalCost(e.target.value)}
          className={fieldClassFor("estimated_total_cost")}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={labelClass}>How should riders coordinate?</span>
        <input type="hidden" name="contact_method" value={contactMethod} />
        <div className="flex flex-wrap gap-4">
          {CONTACT_METHOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-1.5 text-body font-body text-foreground"
            >
              <input
                type="radio"
                name="contact_method_choice"
                value={opt.value}
                checked={contactMethod === opt.value}
                onChange={() => setContactMethod(opt.value)}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {invalidFields.has("contact_method") && (
          <p className="text-label font-body text-red-600">Please choose one.</p>
        )}
        {contactMethod && (
          <input
            type={CONTACT_METHOD_OPTIONS.find((o) => o.value === contactMethod)?.inputType}
            name="contact_value"
            placeholder={CONTACT_METHOD_OPTIONS.find((o) => o.value === contactMethod)?.placeholder}
            value={contactValue}
            onChange={(e) => setContactValue(e.target.value)}
            className={fieldClassFor("contact_value")}
          />
        )}
      </div>

      <label className={labelClass}>
        Your bag count
        <input
          type="number"
          name="bag_count"
          min={0}
          value={bagCount}
          onChange={(e) => setBagCount(e.target.value)}
          className={fieldClassFor("bag_count")}
        />
      </label>

      <div className="rounded-md border border-border p-3">
        <label className="flex items-start gap-2.5 text-body font-body text-foreground">
          <input
            type="checkbox"
            name="visibility"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Make this trip private
            <span className="mt-0.5 block text-label font-body text-foreground/50">
              It won&apos;t show on the trip board. You&apos;ll get a link to share
              with the people you want to ride with.
            </span>
          </span>
        </label>
      </div>

      {invalidFields.size > 0 && (
        <p className="text-body font-body text-red-700">
          Please fill in the highlighted fields.
        </p>
      )}
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
