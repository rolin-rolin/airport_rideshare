// Static shell shown instantly on navigation to a trip detail page, swapped
// for the real page once its Supabase queries resolve. Shaped to match
// TripDetailPage's two cards + join row so the swap doesn't jump.
export default function TripDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="h-4 w-28 rounded bg-foreground/10" />

      <div className="animate-pulse rounded-xl border border-border bg-background p-5">
        <div className="h-3 w-24 rounded bg-foreground/10" />
        <div className="mt-2 h-6 w-48 rounded bg-foreground/10" />
        <div className="mt-4 h-4 w-full rounded bg-foreground/10" />
        <div className="mt-4 h-4 w-32 rounded bg-foreground/10" />
        <div className="mt-4 h-4 w-40 rounded bg-foreground/10" />
      </div>

      <div className="animate-pulse rounded-xl border border-border bg-background p-5">
        <div className="h-3 w-16 rounded bg-foreground/10" />
        <div className="mt-3 h-4 w-3/4 rounded bg-foreground/10" />
        <div className="mt-2 h-4 w-2/3 rounded bg-foreground/10" />
      </div>

      <div className="h-9 w-24 animate-pulse rounded-full bg-foreground/10" />
    </div>
  );
}
