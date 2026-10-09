"use client";

import { useActionState, useState } from "react";
import { createTrip } from "@/app/dashboard/actions";
import type { ContactMethod, Direction, VehicleType } from "@/lib/types";
import {
  TIMEZONE_OPTIONS,
  formatZonedDateTime,
  nightOfPreviousDayLabel,
  zonedDateTimeLocalToUtcIso,
  type TripTimezone,
} from "@/lib/timezone";
import { VehicleTypeSelectInfoButton } from "@/components/VehicleTypeSelectInfoButton";

const CONTACT_METHOD_OPTIONS: { value: ContactMethod; label: string; inputType: string; placeholder: string }[] = [
  { value: "phone", label: "Phone number", inputType: "tel", placeholder: "(555) 123-4567" },
  { value: "link", label: "Group chat link", inputType: "url", placeholder: "https://groupme.com/join_group/..." },
  { value: "email", label: "Email", inputType: "email", placeholder: "you@example.com" },
];

const AIRPORT_LOCATIONS = [
  "O'Hare Terminal 1",
  "O'Hare Terminal 2",
  "O'Hare Terminal 3",
  "O'Hare Terminal 5",
  "Midway Airport",
  "South Bend Airport",
  "South Bend Amtrak",
];

const NOTRE_DAME_LOCATIONS = ["Main Circle", "Library Circle"];

const OTHER_LOCATION = "__other__";

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "to_airport", label: "I'm going to the airport" },
  { value: "from_airport", label: "I'm coming from the airport" },
];

// Digit inputs are kept as strings, not numbers: a numeric state forces
// itself back to "0" the instant the field is cleared, which then makes the
// next keystroke land in front of that "0" (e.g. typing 3 produces "03")
// instead of replacing it. Stripping leading zeros here keeps typed digits
// clean while still letting the field sit empty mid-edit.
function stripLeadingZeros(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

// Every field is required except max luggage per person and the private
// checkbox. Rather than the browser's native `required` (which blocks
// submission with its own popover before the user ever sees which fields
// are at fault), validity is tracked here field-by-field so a failed
// submit can highlight every missing field at once.
type FieldName =
  | "direction"
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

function LocationField({
  label,
  name,
  placeholder,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  name: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className: string;
}) {
  const [otherSelected, setOtherSelected] = useState(false);
  const selectValue = otherSelected ? OTHER_LOCATION : value;

  return (
    <label className={labelClass}>
      {label}
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === OTHER_LOCATION) {
            setOtherSelected(true);
            onChange("");
          } else {
            setOtherSelected(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="" disabled>
          Select a location&hellip;
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={OTHER_LOCATION}>Other&hellip;</option>
      </select>
      {otherSelected && (
        <input
          type="text"
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`mt-2 ${className}`}
        />
      )}
      {!otherSelected && <input type="hidden" name={name} value={value} />}
    </label>
  );
}

export function TripForm({ vehicleTypes }: { vehicleTypes: VehicleType[] }) {
  const [state, formAction, isPending] = useActionState(createTrip, { error: null });
  // Deliberately starts unset rather than inheriting whichever board tab the
  // poster came from: the direction decides which board the trip lands on,
  // so it has to be an explicit choice.
  const [direction, setDirection] = useState<Direction | "">("");
  const [vehicleTypeId, setVehicleTypeId] = useState(vehicleTypes[0]?.id ?? "");
  const [seatCapacity, setSeatCapacity] = useState(String(vehicleTypes[0]?.default_seat_capacity ?? 0));
  const [bagCapacity, setBagCapacity] = useState(String(vehicleTypes[0]?.default_bag_capacity ?? 0));
  // datetime-local's raw value has no timezone. The poster is entering a
  // wall-clock time for the trip's departure location, not their own
  // current location, so it must be resolved against the timezone they
  // pick below -- not the browser's own timezone (which would silently
  // store the wrong instant for a poster traveling outside it).
  const [timezone, setTimezone] = useState<TripTimezone>(TIMEZONE_OPTIONS[0].value);
  const [departureTimeLocal, setDepartureTimeLocal] = useState("");
  const departureTimeIso = departureTimeLocal
    ? zonedDateTimeLocalToUtcIso(departureTimeLocal, timezone)
    : "";
  const nightOfLabel = departureTimeIso ? nightOfPreviousDayLabel(departureTimeIso, timezone) : null;
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [estimatedTotalCost, setEstimatedTotalCost] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactMethod | "">("");
  const [contactValue, setContactValue] = useState("");
  const [bagCount, setBagCount] = useState("0");
  const [maxBagsPerPerson, setMaxBagsPerPerson] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Pickup and dropoff draw from opposite location lists depending on
  // direction, so whatever was picked under the old direction no longer
  // applies.
  function handleDirectionChange(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    setPickupLocation("");
    setDropoffLocation("");
  }

  function handleVehicleTypeChange(id: string) {
    setVehicleTypeId(id);
    const vehicle = vehicleTypes.find((v) => v.id === id);
    if (vehicle) {
      setSeatCapacity(String(vehicle.default_seat_capacity));
      setBagCapacity(String(vehicle.default_bag_capacity));
    }
  }

  function fieldClassFor(name: FieldName) {
    return `${fieldClass} ${invalidFields.has(name) ? invalidFieldClass : ""}`;
  }

  function computeInvalidFields(): Set<FieldName> {
    const invalid = new Set<FieldName>();
    if (!direction) invalid.add("direction");
    if (!departureTimeIso) invalid.add("departure_time");
    if (!pickupLocation.trim()) invalid.add("pickup_location");
    if (!dropoffLocation.trim()) invalid.add("dropoff_location");
    if (!vehicleTypeId) invalid.add("vehicle_type_id");
    if (!estimatedTotalCost.trim()) invalid.add("estimated_total_cost");
    if (!contactMethod) invalid.add("contact_method");
    if (contactMethod && !contactValue.trim()) invalid.add("contact_value");
    if (!bagCount.trim()) invalid.add("bag_count");
    return invalid;
  }

  // Errors stay hidden until the first submit attempt, then are recomputed
  // every render off current field state (cheap: a handful of string
  // checks) so each highlight clears as soon as its field is filled in.
  const invalidFields = submitAttempted ? computeInvalidFields() : new Set<FieldName>();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setSubmitAttempted(true);
    if (computeInvalidFields().size > 0) {
      e.preventDefault();
    }
  }

  // On success createTrip redirects server-side (see actions.ts) straight to
  // the new trip's page, so this component only ever sees state.error !=
  // null -- there's no success state to react to here.
  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <span className={labelClass}>Which way are you headed?</span>
        <input type="hidden" name="direction" value={direction} />
        <div className="flex flex-wrap gap-4">
          {DIRECTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-1.5 text-body font-body text-foreground"
            >
              <input
                type="radio"
                name="direction_choice"
                value={opt.value}
                checked={direction === opt.value}
                onChange={() => handleDirectionChange(opt.value)}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {invalidFields.has("direction") && (
          <p className="text-label font-body text-red-600">Please choose one.</p>
        )}
      </div>

      <input type="hidden" name="departure_time" value={departureTimeIso} />
      <div className="flex flex-col gap-4 sm:flex-row">
        <label className={`min-w-0 flex-1 ${labelClass}`}>
          Departure time
          <input
            type="datetime-local"
            className={fieldClassFor("departure_time")}
            value={departureTimeLocal}
            onChange={(e) => setDepartureTimeLocal(e.target.value)}
          />
          {nightOfLabel && (
            <span className="text-label font-body font-bold text-foreground/70">
              (night of {nightOfLabel})
            </span>
          )}
        </label>
        <label className={`min-w-0 flex-1 ${labelClass}`}>
          Timezone
          <select
            name="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value as TripTimezone)}
            className={fieldClass}
          >
            {TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {departureTimeIso && (
        <p className="-mt-2 break-words text-label font-body font-semibold text-foreground">
          That&apos;s {formatZonedDateTime(departureTimeIso, timezone)}
        </p>
      )}
      <p className="-mt-2 text-label font-body text-foreground/50">
        Enter the time where this trip departs from. This trip posting expires one hour after
        departure — coordinate with your group before then.
      </p>

      {/* Keyed by direction so each field's own "Other…" toggle resets along
          with its value when the direction flips. */}
      {direction ? (
        <>
          <LocationField
            key={`pickup-${direction}`}
            label="Pickup location"
            name="pickup_location"
            placeholder={direction === "to_airport" ? "Dillon Hall" : "O'Hare T1"}
            options={direction === "to_airport" ? NOTRE_DAME_LOCATIONS : AIRPORT_LOCATIONS}
            value={pickupLocation}
            onChange={setPickupLocation}
            className={fieldClassFor("pickup_location")}
          />

          <LocationField
            key={`dropoff-${direction}`}
            label="Dropoff location"
            name="dropoff_location"
            placeholder={direction === "to_airport" ? "O'Hare T1" : "Dillon Hall"}
            options={direction === "to_airport" ? AIRPORT_LOCATIONS : NOTRE_DAME_LOCATIONS}
            value={dropoffLocation}
            onChange={setDropoffLocation}
            className={fieldClassFor("dropoff_location")}
          />
        </>
      ) : (
        <p className="text-label font-body text-foreground/50">
          Choose which way you&apos;re headed above to pick your pickup and dropoff locations.
        </p>
      )}

      <label className={labelClass}>
        <span className="flex items-center gap-1.5">
          Vehicle type
          <VehicleTypeSelectInfoButton />
        </span>
        <select
          name="vehicle_type_id"
          value={vehicleTypeId}
          onChange={(e) => handleVehicleTypeChange(e.target.value)}
          className={fieldClassFor("vehicle_type_id")}
        >
          {vehicleTypes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.default_seat_capacity} seats, {v.default_bag_capacity} suitcases)
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
            onChange={(e) => setSeatCapacity(stripLeadingZeros(e.target.value))}
            className={fieldClass}
          />
        </label>

        <label className={`min-w-0 flex-1 ${labelClass}`}>
          Suitcase capacity
          <input
            type="number"
            name="bag_capacity"
            min={0}
            value={bagCapacity}
            onChange={(e) => setBagCapacity(stripLeadingZeros(e.target.value))}
            className={fieldClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        Max suitcases per person (optional)
        <input
          type="number"
          name="max_bags_per_person"
          min={0}
          placeholder="No limit"
          value={maxBagsPerPerson}
          onChange={(e) => setMaxBagsPerPerson(stripLeadingZeros(e.target.value))}
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
        Your suitcase count
        <input
          type="number"
          name="bag_count"
          min={0}
          value={bagCount}
          onChange={(e) => setBagCount(stripLeadingZeros(e.target.value))}
          className={fieldClassFor("bag_count")}
        />
        <span className="text-label font-body font-normal text-foreground/50">
          Count whatever you can&apos;t fit on your lap.
        </span>
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
