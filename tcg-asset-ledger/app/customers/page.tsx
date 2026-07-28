import Link from "next/link";
import { format } from "date-fns";
import { Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/components/money-text";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers } from "@/lib/customers";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const customers = await listCustomers({ search: search || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Repeat buyers and trade partners worth tracking."
        actions={
          <Link href="/customers/new" className={cn(buttonVariants())}>
            <Plus /> Add customer
          </Link>
        }
      />

      <Card>
        <CardContent className="p-4">
          <form className="flex gap-3" method="get">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search name, email, or phone"
                defaultValue={search ?? ""}
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Lifetime sales</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {search ? (
                      "No customers match that search."
                    ) : (
                      <span className="inline-flex flex-col items-center gap-2">
                        <Users className="size-6" />
                        No customers yet — they get added from a Buy/Sell/Trade flow, or here.
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-right tnum">{c.transactionCount}</TableCell>
                    <TableCell className="text-right">
                      <Money cents={c.lifetimeSalesCents} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.lastTransactionAt ? format(c.lastTransactionAt, "MMM d, yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
