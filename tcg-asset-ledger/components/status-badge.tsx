import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type AssetStatus } from "@/lib/domain";

const VARIANT: Record<string, "success" | "muted" | "warning" | "secondary" | "destructive"> = {
  InStock: "success",
  Sold: "muted",
  Traded: "secondary",
  Grading: "warning",
  BrokenDown: "secondary",
  UsedAsPrize: "warning",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as AssetStatus] ?? status;
  return <Badge variant={VARIANT[status] ?? "muted"}>{label}</Badge>;
}
