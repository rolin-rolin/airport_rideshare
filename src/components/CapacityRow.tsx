import { BriefcaseIcon, PersonIcon } from "@/components/icons";

export function CapacityRow({
  seatsFilled,
  seatCapacity,
  bagsFilled,
  bagCapacity,
}: {
  seatsFilled: number;
  seatCapacity: number;
  bagsFilled: number;
  bagCapacity: number;
}) {
  const seatsLeft = Math.max(seatCapacity - seatsFilled, 0);
  const bagsLeft = Math.max(bagCapacity - bagsFilled, 0);

  return (
    <div className="flex items-center gap-5 text-body font-body text-foreground">
      <span className="flex items-center gap-1.5">
        <PersonIcon className="h-4 w-4 text-primary" />
        {seatsLeft}/{seatCapacity} seats left
      </span>
      <span className="flex items-center gap-1.5">
        <BriefcaseIcon className="h-4 w-4 text-accent" />
        {bagsLeft}/{bagCapacity} bags left
      </span>
    </div>
  );
}
