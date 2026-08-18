export function RouteDisplay({
  pickup,
  dropoff,
}: {
  pickup: string;
  dropoff: string;
}) {
  const routeText = `${pickup} → ${dropoff}`;
  // @container: font-size is in cqw (container query width units), so it
  // scales with this row's own available width. A *fixed* cqw value only
  // fits names up to some length before overflowing, so the coefficient
  // itself is scaled down as routeText gets longer -- at a given container
  // width, rendered text width is roughly fontSize * avgCharWidth * length,
  // and fontSize here is proportional to (coefficient / length), so length
  // cancels out and the text occupies a roughly constant share of the
  // container regardless of how long the names are. No lower bound: the
  // whole point is this never truncates, just keeps shrinking.
  const fontSizeCqw = Math.min(7, 110 / routeText.length);

  return (
    <div className="@container flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span
        className="min-w-0 whitespace-nowrap font-body font-semibold text-foreground"
        style={{ fontSize: `clamp(0px, ${fontSizeCqw}cqw, 1.125rem)` }}
      >
        {pickup} <span className="text-foreground/50">&rarr;</span> {dropoff}
      </span>
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
    </div>
  );
}
