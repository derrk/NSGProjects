import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Money, ProfitText } from "@/components/money-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTransaction } from "@/lib/queries";
import { txnTypeLabel, analyzeTransaction } from "@/lib/txn-format";
import { formatUSD } from "@/lib/money";
import { DeleteTransactionButton } from "./delete-button";
import { TransactionPhotos } from "./photos";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTransaction(id);
  if (!t) notFound();

  const inLines = t.lines.filter((l) => l.direction === "IN");
  const outLines = t.lines.filter((l) => l.direction === "OUT");

  const analysis = analyzeTransaction(t);
  const realized = analysis.realizedProfitCents;
  const isTrade = t.type === "TRADE";

  return (
    <div className="space-y-6">
      <Link
        href="/transactions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to ledger
      </Link>

      <PageHeader
        title={`${txnTypeLabel(t.type)} · ${format(t.date, "MMM d, yyyy")}`}
        description={t.counterparty ? `With ${t.counterparty}` : undefined}
        actions={<DeleteTransactionButton id={t.id} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cash</div>
            <div className="mt-1 text-2xl font-semibold">
              {t.cashDeltaCents === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <ProfitText cents={t.cashDeltaCents} />
              )}
            </div>
          </CardContent>
        </Card>
        {realized !== null ? (
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Realized profit</div>
              <div className="mt-1 text-2xl font-semibold"><ProfitText cents={realized} /></div>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Items</div>
            <div className="mt-1 text-2xl font-semibold tnum">{t.lines.length}</div>
          </CardContent>
        </Card>
      </div>

      {isTrade ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trade analysis</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-2 pt-0 text-sm sm:grid-cols-2">
            <Row label="Market value received" value={formatUSD(analysis.valueInCents)} />
            <Row label="Market value given" value={formatUSD(analysis.valueOutCents)} />
            <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
              <span>Inventory value change</span>
              <ProfitText cents={analysis.marketDeltaCents} />
            </div>
            {t.cashDeltaCents !== 0 ? (
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Net after cash</span>
                <ProfitText cents={analysis.netWithCashCents} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {t.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TransactionPhotos paths={t.attachments.map((a) => a.path)} />
          </CardContent>
        </Card>
      ) : null}

      {t.notes ? (
        <Card>
          <CardContent className="p-5 text-sm">{t.notes}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <LineTable title="Out" tone="muted" lines={outLines} />
        <LineTable title="In" tone="success" lines={inLines} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

function LineTable({
  title,
  tone,
  lines,
}: {
  title: string;
  tone: "success" | "muted";
  lines: {
    id: string;
    assetId: string;
    quantity: number;
    unitValueCents: number;
    unitBasisCents: number;
    asset: { name: string } | null;
  }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Badge variant={tone}>{title}</Badge>
          <span className="text-sm font-normal text-muted-foreground">{lines.length} line(s)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">None</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Value/u</TableHead>
                <TableHead className="text-right">Basis/u</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/inventory/${l.assetId}`} className="hover:underline">
                      {l.asset?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tnum">{l.quantity}</TableCell>
                  <TableCell className="text-right"><Money cents={l.unitValueCents} /></TableCell>
                  <TableCell className="text-right"><Money cents={l.unitBasisCents} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
