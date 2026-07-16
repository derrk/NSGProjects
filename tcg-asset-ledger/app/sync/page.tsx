import Link from "next/link";
import { format } from "date-fns";
import { PlusCircle, Pencil, MinusCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPendingSyncTasks } from "@/lib/sync-backlog";
import { txnTypeLabel } from "@/lib/txn-format";
import { formatUSD } from "@/lib/money";
import { MarkDoneButton, MarkAllDoneButton } from "./sync-actions";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    kind: "add",
    title: "Add to Collectr",
    icon: PlusCircle,
    blurb: "New cards from buys, trades, and breaks that Collectr doesn't know about yet.",
  },
  {
    kind: "update",
    title: "Update in Collectr",
    icon: Pencil,
    blurb: "Cards whose cost basis changed here and no longer matches Collectr.",
  },
  {
    kind: "remove",
    title: "Remove from Collectr",
    icon: MinusCircle,
    blurb: "Cards sold, traded away, or given as prizes — still listed in Collectr.",
  },
] as const;

export default async function SyncPage() {
  const tasks = await listPendingSyncTasks();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Collectr backlog"
          description="Changes recorded here that still need to be reflected in your Collectr portfolio. Items check themselves off when a re-import confirms them."
        />
        {tasks.length > 0 ? <MarkAllDoneButton /> : null}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <div className="font-medium">All synced up</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Everything you've recorded here is reflected in Collectr. New buys, trades, breaks,
              and sales will show up in this backlog automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        SECTIONS.map((section) => {
          const items = tasks.filter((t) => t.kind === section.kind);
          if (items.length === 0) return null;
          const Icon = section.icon;
          return (
            <Card key={section.kind}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4" />
                  {section.title}
                  <Badge variant="outline">{items.length}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{section.blurb}</p>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {items.map((t) => {
                  const a = t.asset;
                  const market = a.priceOverrideCents ?? a.marketValueCents;
                  return (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/inventory/${a.id}`}
                            className="font-medium hover:underline"
                          >
                            {a.name}
                          </Link>
                          {a.cardNumber ? (
                            <span className="text-xs text-muted-foreground">#{a.cardNumber}</span>
                          ) : null}
                          {t.transaction ? (
                            <Link href={`/transactions/${t.transaction.id}`}>
                              <Badge variant="outline">
                                {txnTypeLabel(t.transaction.type)} ·{" "}
                                {format(t.transaction.date, "MMM d")}
                              </Badge>
                            </Link>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {[a.game, a.set, a.variant, a.grade, a.condition]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="mt-1 text-sm">
                          <span className="text-muted-foreground">{t.note}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tnum">
                          <span>Qty {a.quantity}</span>
                          <span>Cost {formatUSD(a.costBasisCents)}/u</span>
                          <span>Market {formatUSD(market)}/u</span>
                        </div>
                      </div>
                      <MarkDoneButton taskId={t.id} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        Tip: after updating Collectr, export your portfolio and{" "}
        <Link href="/import" className="underline">
          re-import it
        </Link>
        . Matching items resolve automatically — imports merge by card identity, never duplicate,
        and never create transactions.
      </p>
    </div>
  );
}
