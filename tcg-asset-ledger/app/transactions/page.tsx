import Link from "next/link";
import { format } from "date-fns";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProfitText } from "@/components/money-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listTransactions } from "@/lib/queries";
import { summarizeTransaction, txnTypeLabel, analyzeTransaction } from "@/lib/txn-format";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const txns = await listTransactions(300);

  return (
    <div className="space-y-6">
      <PageHeader title="Ledger" description="Every business action, in one immutable history." />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>With</TableHead>
                <TableHead className="text-right">Value Δ</TableHead>
                <TableHead className="text-right">Cash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                txns.map((t) => {
                  const a = analyzeTransaction(t);
                  // Value delta is meaningful for trades (inventory value change)
                  // and sales (realized profit).
                  const valueDelta =
                    t.type === "TRADE"
                      ? a.marketDeltaCents
                      : t.type === "SALE"
                        ? a.realizedProfitCents
                        : null;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(t.date, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline">{txnTypeLabel(t.type)}</Badge>
                          {t.attachments.length > 0 ? (
                            <Camera className="size-3.5 text-muted-foreground" />
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <Link href={`/transactions/${t.id}`} className="hover:underline">
                          <span className="line-clamp-1">{summarizeTransaction(t)}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{t.counterparty ?? "—"}</div>
                        {t.source ? (
                          <div className="text-xs text-muted-foreground/70">{t.source}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {valueDelta === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ProfitText cents={valueDelta} />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.cashDeltaCents === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ProfitText cents={t.cashDeltaCents} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
