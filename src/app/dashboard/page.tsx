import Link from "next/link";
import { getBoardTrips, getMyActiveTrip } from "@/lib/trips";
import type { Direction } from "@/lib/types";
import { TabNav } from "@/components/TabNav";
import { TripsBoard } from "@/components/TripsBoard";
import { LogoutButton } from "@/components/LogoutButton";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string }>;
}) {
  const { dir } = await searchParams;
  const direction: Direction = dir === "from_airport" ? "from_airport" : "to_airport";

  const [trips, myActiveTrip] = await Promise.all([
    getBoardTrips(direction),
    getMyActiveTrip(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display-lg font-display font-bold text-foreground">
          Trip board
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {myActiveTrip ? (
            <span
              title="Leave your current trip before posting a new one"
              className="shrink-0 cursor-not-allowed rounded-full bg-primary/40 px-4 py-2 text-label font-display font-semibold text-background"
            >
              Post a trip
            </span>
          ) : (
            <Link
              href={`/dashboard/new?dir=${direction}`}
              className="shrink-0 rounded-full bg-primary px-4 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
            >
              Post a trip
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      <TabNav />

      <TripsBoard key={direction} trips={trips} direction={direction} myActiveTrip={myActiveTrip} />
    </div>
  );
}
