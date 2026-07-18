export function RouteDisplay({
  pickup,
  dropoff,
}: {
  pickup: string;
  dropoff: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span className="shrink-0 text-route font-body font-semibold text-foreground">
        {pickup} <span className="text-foreground/50">&rarr;</span> {dropoff}
      </span>
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
    </div>
  );
}
