"use client";

import { InfoIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

function VehicleTypeInfo() {
    return (
        <p className="text-background/90">
            Anything you can&apos;t fit on your lap counts towards the suitcase count.
        </p>
    );
}

export function VehicleTypeInfoButton() {
    return (
        <Tooltip content={<VehicleTypeInfo />}>
            <button
                type="button"
                aria-label="About vehicle tiers"
                className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-accent/60 hover:text-accent"
            >
                <InfoIcon className="h-4 w-4" />
            </button>
        </Tooltip>
    );
}
