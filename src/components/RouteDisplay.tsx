export function RouteDisplay({
  pickup,
  dropoff,
}: {
  pickup: string;
  dropoff: string;
}) {
  return (
    // @container: the route text's font-size below is in cqw (container
    // query width units), so it scales down with this row's own available
    // width instead of wrapping onto a second line when the destination
    // graphic would otherwise be too wide for the viewport (narrow phones,
    // long location names). `truncate` is just a backstop in case a name is
    // long enough that even the clamped minimum size doesn't fit.
    <div className="@container flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span className="min-w-0 truncate text-[clamp(0.75rem,5.5cqw,1.125rem)] font-body font-semibold text-foreground">
        {pickup} <span className="text-foreground/50">&rarr;</span> {dropoff}
      </span>
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
    </div>
  );
}
