import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProfitText } from "@/components/money-text";
import { getCustomerWithHistory, getCustomerStats } from "@/lib/customers";
import { formatUSD } from "@/lib/money";
import { summarizeTransaction, txnTypeLabel } from "@/lib/txn-format";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomerWithHistory(id);
  if (!customer) notFound();
  const stats = await getCustomerStats(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/customers"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Customers
          </Link>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {customer.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3.5" /> {customer.email}
              </span>
            ) : null}
            {customer.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {customer.phone}
              </span>
            ) : null}
          </div>
        </div>
        <Link href={`/customers/${customer.id}/edit`}>
          <Button variant="outline">
            <Pencil /> Edit
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Transactions" value={String(stats.transactionCount)} />
          <Metric label="Sales to them" value={formatUSD(stats.salesToCustomerCents)} />
          <Metric label="Purchases from them" value={formatUSD(stats.purchasesFromCustomerCents)} />
          <Metric label="Trades" value={String(stats.tradesCount)} />
          <Metric
            label="First seen"
            value={stats.firstTransactionAt ? format(stats.firstTransactionAt, "MMM d, yyyy") : "—"}
          />
          <Metric
            label="Last seen"
            value={stats.lastTransactionAt ? format(stats.lastTransactionAt, "MMM d, yyyy") : "—"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Transactions ({customer.transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Cash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customer.transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nothing recorded for this customer yet.
                  </TableCell>
                </TableRow>
              ) : (
                customer.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(t.date, "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{txnTypeLabel(t.type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[340px]">
                      <Link href={`/transactions/${t.id}`} className="hover:underline">
                        <span className="line-clamp-1">{summarizeTransaction(t)}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.cashDeltaCents === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ProfitText cents={t.cashDeltaCents} />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {customer.notes ? (
        <Card>
          <CardContent className="p-5 text-sm">{customer.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tnum">{value}</div>
    </div>
  );
}
