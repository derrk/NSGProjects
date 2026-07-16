import Link from "next/link";
import { format } from "date-fns";
import { Plus, MapPin, CalendarDays, Tent } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listShows, daysUntil } from "@/lib/shows";
import { formatUSD } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "success" | "secondary" | "destructive"> = {
  Upcoming: "default",
  Active: "success",
  Completed: "secondary",
  Cancelled: "destructive",
};

export default async function ShowsPage() {
  const shows = await listShows();
  const upcoming = shows.filter((s) => s.status === "Upcoming");
  const active = shows.filter((s) => s.status === "Active");
  const past = shows.filter((s) => s.status === "Completed" || s.status === "Cancelled");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Shows"
          description="Plan card shows, run them in Show Mode, and see what each one actually made."
        />
        <Link href="/shows/new">
          <Button>
            <Plus /> Add show
          </Button>
        </Link>
      </div>

      {shows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <CalendarDays className="size-8 text-muted-foreground" />
            <div className="font-medium">No shows yet</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Add your next card show. When you arrive, hit Enter Show Mode and every sale, trade,
              and buy gets tagged to it automatically.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {active.length > 0 ? <Section title="Happening now" shows={active} /> : null}
      {upcoming.length > 0 ? <Section title="Upcoming" shows={upcoming} /> : null}
      {past.length > 0 ? <Section title="Past" shows={past} /> : null}
    </div>
  );
}

function Section({
  title,
  shows,
}: {
  title: string;
  shows: Awaited<ReturnType<typeof listShows>>;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {shows.map((s) => {
          const days = daysUntil(s.startDate);
          const expenses =
            s.tableFeeCents + s.hotelCents + s.travelCents + s.foodCents + s.otherCents;
          return (
            <Link key={s.id} href={`/shows/${s.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{s.name}</div>
                    <span className="inline-flex items-center gap-1.5">
                      {s.status === "Active" ? <Tent className="size-3.5 text-success" /> : null}
                      <Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>{s.status}</Badge>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" />
                      {format(s.startDate, "MMM d, yyyy")}
                      {s.endDate ? ` – ${format(s.endDate, "MMM d")}` : ""}
                    </span>
                    {s.venue || s.city ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {[s.venue, s.city].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tnum">
                    {s.status === "Upcoming" && days >= 0 ? (
                      <span className="font-medium text-foreground">
                        {days === 0 ? "Today!" : `${days} day${days === 1 ? "" : "s"} until show`}
                      </span>
                    ) : null}
                    {expenses > 0 ? <span>Expenses {formatUSD(expenses)}</span> : null}
                    <span>{s._count.transactions} transaction(s)</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
