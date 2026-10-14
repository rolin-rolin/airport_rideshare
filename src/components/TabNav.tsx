"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Direction } from "@/lib/types";

const TABS: { direction: Direction; label: string }[] = [
  { direction: "from_airport", label: "From Airport" },
  { direction: "to_airport", label: "To Airport" },
];

// `counts` is how many trips each tab would list right now. The caller
// derives it from the same board trip data each tab renders, so it stays in
// step with every realtime-triggered refresh of the page. A tab whose count
// is missing or 0 shows no status at all.
export function TabNav({ counts }: { counts?: Partial<Record<Direction, number>> }) {
  const searchParams = useSearchParams();
  const active = searchParams.get("dir") === "to_airport" ? "to_airport" : "from_airport";

  return (
    <div className="flex gap-1 rounded-full border border-border bg-background p-1">
      {TABS.map((tab) => {
        const isActive = tab.direction === active;
        const count = counts?.[tab.direction] ?? 0;
        const status = `${count} active posting${count === 1 ? "" : "s"}`;
        return (
          <Link
            key={tab.direction}
            href={`/dashboard?dir=${tab.direction}`}
            aria-current={isActive ? "page" : undefined}
            // Spelled out so screen readers get "To Airport, 3 active
            // postings" -- the visible dot is decorative.
            aria-label={count > 0 ? `${tab.label}, ${status}` : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 text-center text-body font-display font-semibold transition-colors sm:flex-row sm:gap-2.5 ${
              isActive
                ? "bg-primary text-background"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <span>{tab.label}</span>
            {count > 0 && (
              <span
                className={`flex items-center gap-1.5 whitespace-nowrap text-label font-body font-medium ${
                  isActive ? "text-background/85" : "text-foreground/60"
                }`}
              >
                <LiveDot onPrimary={isActive} />
                {status}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// Decorative "this is live" cue: a solid dot with a ping ring behind it. The
// ring is removed under prefers-reduced-motion, leaving a static dot. A
// lighter green on the active (primary-filled) tab keeps it visible there.
function LiveDot({ onPrimary }: { onPrimary: boolean }) {
  const color = onPrimary ? "bg-emerald-300" : "bg-emerald-500";
  return (
    <span aria-hidden="true" className="relative flex size-2 shrink-0">
      <span
        className={`absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping motion-reduce:hidden ${color}`}
      />
      <span className={`relative inline-flex size-2 rounded-full ${color}`} />
    </span>
  );
}
