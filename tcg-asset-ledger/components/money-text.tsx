import { cn } from "@/lib/utils";
import { formatUSD, formatSignedUSD } from "@/lib/money";

/** Profit/loss value, colored green/red, with an explicit sign. */
export function ProfitText({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const tone =
    cents > 0 ? "text-success" : cents < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={cn("tnum font-medium", tone, className)}>
      {formatSignedUSD(cents)}
    </span>
  );
}

/** Plain money value with tabular numerals. */
export function Money({
  cents,
  className,
}: {
  cents: number | null | undefined;
  className?: string;
}) {
  return <span className={cn("tnum", className)}>{formatUSD(cents)}</span>;
}
