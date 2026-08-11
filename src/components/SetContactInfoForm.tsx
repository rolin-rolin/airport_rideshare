"use client";

import { useActionState, useState } from "react";
import { setTripContactInfo } from "@/app/dashboard/actions";
import type { ContactMethod } from "@/lib/types";

const CONTACT_METHOD_OPTIONS: { value: ContactMethod; label: string; inputType: string; placeholder: string }[] = [
  { value: "phone", label: "Phone number", inputType: "tel", placeholder: "(555) 123-4567" },
  { value: "link", label: "Group chat link", inputType: "url", placeholder: "https://groupme.com/join_group/..." },
  { value: "email", label: "Email", inputType: "email", placeholder: "you@example.com" },
];

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-body font-body text-foreground outline-none focus:border-primary";

// Shown to a trip's owner when trip.contact_method is null -- currently
// only reachable after ownership was reassigned (migration 0017 clears the
// previous owner's contact info rather than carrying it forward).
export function SetContactInfoForm({ tripId }: { tripId: string }) {
  const [state, formAction, isPending] = useActionState(setTripContactInfo, { error: null });
  const [contactMethod, setContactMethod] = useState<ContactMethod | "">("");
  const [contactValue, setContactValue] = useState("");

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <input type="hidden" name="trip_id" value={tripId} />
      <p className="text-body font-body text-foreground">
        You&apos;re now this trip&apos;s contact. How should riders reach you?
      </p>
      <div className="flex flex-wrap gap-4">
        {CONTACT_METHOD_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-1.5 text-body font-body text-foreground"
          >
            <input
              type="radio"
              name="contact_method"
              value={opt.value}
              checked={contactMethod === opt.value}
              onChange={() => setContactMethod(opt.value)}
              className="accent-primary"
            />
            {opt.label}
          </label>
        ))}
      </div>
      {contactMethod && (
        <input
          type={CONTACT_METHOD_OPTIONS.find((o) => o.value === contactMethod)?.inputType}
          name="contact_value"
          placeholder={CONTACT_METHOD_OPTIONS.find((o) => o.value === contactMethod)?.placeholder}
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          className={fieldClass}
        />
      )}
      {state.error && <p className="text-label font-body text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending || !contactMethod || !contactValue.trim()}
        className="self-start rounded-full bg-primary px-4 py-1.5 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
