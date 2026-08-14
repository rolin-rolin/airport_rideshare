// Static shell shown instantly on navigation to /dashboard, swapped for the
// real page once its Supabase queries resolve (DESIGN.md navigation notes).
// Shaped to match DashboardPage/TripsBoard/TripCard so the swap doesn't jump.
function TripCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-background p-5">
      <div className="h-3 w-24 rounded bg-foreground/10" />
      <div className="mt-2 h-5 w-40 rounded bg-foreground/10" />
      <div className="mt-4 h-4 w-full rounded bg-foreground/10" />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="h-4 w-32 rounded bg-foreground/10" />
        <div className="h-8 w-20 rounded-full bg-foreground/10" />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display-lg font-display font-bold text-foreground">
          Trip board
        </h1>
      </div>

      <div className="h-11 animate-pulse rounded-full border border-border bg-background" />

      <div className="flex flex-col gap-3">
        <TripCardSkeleton />
        <TripCardSkeleton />
        <TripCardSkeleton />
      </div>
    </div>
  );
}
