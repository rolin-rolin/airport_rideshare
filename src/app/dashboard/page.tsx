import Link from "next/link";
import { getBoardTrips, getMyActiveTrip } from "@/lib/trips";
import type { Direction } from "@/lib/types";
import { TabNav } from "@/components/TabNav";
import { TripCard } from "@/components/TripCard";

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
        <Link
          href={`/dashboard/new?dir=${direction}`}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
        >
          Post a trip
        </Link>
      </div>

      <TabNav />

      {trips.length === 0 ? (
        <p className="mt-8 text-center text-body font-body text-foreground/50">
          No trips posted yet for this direction.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              direction={direction}
              isMine={trip.id === myActiveTrip?.id}
              canJoin={!myActiveTrip && trip.status === "open"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
