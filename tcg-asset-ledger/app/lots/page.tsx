import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listSaleLots } from "@/lib/sale-lots";
import { CreateLotForm } from "./create-lot";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, "success" | "outline" | "muted"> = {
  Open: "outline",
  Sold: "success",
  Cancelled: "muted",
};

export default async function LotsPage() {
  const lots = await listSaleLots();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lot sales"
        description="Sell a batch of cards for one lump sum (Whatnot stream, bulk / percentage deal). Enter the gross and the net payout after fees — profit is judged against the combined cost basis."
      />
      <CreateLotForm />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cards</TableHead>
                <TableHead className="text-right">Cost basis</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No lots yet — start one above to group cards for a stream or bulk sale.</TableCell></TableRow>
              ) : lots.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell>
                    <Link href={`/lots/${lot.id}`} className="font-medium hover:underline">{lot.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lot.source}</TableCell>
                  <TableCell><Badge variant={statusBadge[lot.status] ?? "outline"}>{lot.status}</Badge></TableCell>
                  <TableCell className="text-right tnum">{lot.econ.unitCount}</TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">{formatUSD(lot.econ.totalBasisCents)}</TableCell>
                  <TableCell className="text-right tnum">{lot.netCents != null ? formatUSD(lot.netCents) : "—"}</TableCell>
                  <TableCell className={cn("text-right tnum font-semibold", lot.econ.profitCents == null ? "text-muted-foreground" : lot.econ.profitCents >= 0 ? "text-success" : "text-destructive")}>
                    {lot.econ.profitCents == null ? "—" : `${lot.econ.profitCents >= 0 ? "+" : "−"}${formatUSD(Math.abs(lot.econ.profitCents))}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
