"use client";

import { InfoIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

const VEHICLE_TIERS = [
    { name: "Standard", detail: "4 seats, ~2 suitcases" },
    { name: "XL", detail: "6 seats, ~4-5 suitcases" },
    { name: "XXL", detail: "6 seats, 6+ suitcases" },
];

function VehicleTypeSelectInfo() {
    return (
        <div>
            <ul className="space-y-1">
                {VEHICLE_TIERS.map((tier) => (
                    <li key={tier.name}>
                        <span className="font-semibold">{tier.name}:</span>{" "}
                        <span className="text-background/80">{tier.detail}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-1.5 text-background/80">
                XXL guarantees trunk space. Drivers may not let riders put suitcases on seats —
                contact your Uber/Lyft driver if you want to be sure.
            </p>
        </div>
    );
}

export function VehicleTypeSelectInfoButton() {
    return (
        <Tooltip content={<VehicleTypeSelectInfo />}>
            <button
                type="button"
                aria-label="About vehicle types"
                className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-accent/60 hover:text-accent"
            >
                <InfoIcon className="h-4 w-4" />
            </button>
        </Tooltip>
    );
}
