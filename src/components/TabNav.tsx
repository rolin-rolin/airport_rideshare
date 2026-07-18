"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Direction } from "@/lib/types";

const TABS: { direction: Direction; label: string }[] = [
  { direction: "to_airport", label: "To Airport" },
  { direction: "from_airport", label: "From Airport" },
];

export function TabNav() {
  const searchParams = useSearchParams();
  const active = searchParams.get("dir") === "from_airport" ? "from_airport" : "to_airport";

  return (
    <div className="flex gap-1 rounded-full border border-border bg-background p-1">
      {TABS.map((tab) => {
        const isActive = tab.direction === active;
        return (
          <Link
            key={tab.direction}
            href={`/dashboard?dir=${tab.direction}`}
            className={`flex-1 rounded-full px-4 py-2 text-center text-body font-display font-semibold transition-colors ${
              isActive
                ? "bg-primary text-background"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
