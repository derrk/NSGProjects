import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  DollarSign,
  HandCoins,
  PackageCheck,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import { startOfDay, startOfMonth } from "date-fns";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { inventoryValue } from "@/lib/inventory";
import { getStoreConfig } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function AdminDashboard() {
  const { lowStockAt } = await getStoreConfig();
  const now = new Date();
  const startToday = startOfDay(now);
  const startMonth = startOfMonth(now);

  const [
    salesToday,
    salesMonth,
    ordersToday,
    ordersAwaiting,
    totalItems,
    outOfStock,
    lowStock,
    invItems,
    newOffers,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { paymentStatus: "paid", paidAt: { gte: startToday } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { paymentStatus: "paid", paidAt: { gte: startMonth } },
    }),
    prisma.order.count({ where: { createdAt: { gte: startToday } } }),
    // Awaiting shipment = paid but not yet shipped/fulfilled/cancelled.
    prisma.order.count({
      where: {
        paymentStatus: "paid",
        status: { notIn: ["shipped", "fulfilled", "cancelled"] },
      },
    }),
    prisma.product.aggregate({
      _sum: { quantity: true },
      where: { trackInventory: true },
    }),
    prisma.product.count({ where: { trackInventory: true, quantity: 0 } }),
    prisma.product.findMany({
      where: { trackInventory: true, quantity: { gt: 0, lte: lowStockAt } },
      orderBy: { quantity: "asc" },
      take: 8,
    }),
    prisma.product.findMany({
      where: { trackInventory: true },
      select: { quantity: true, costCents: true, priceCents: true },
    }),
    prisma.collectionOffer.findMany({
      where: { status: "new" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const value = inventoryValue(invItems);

  // The sales tiles read from a real (empty) Order table and will stay at zero
  // until checkout is wired up, so they aren't linked anywhere yet.
  const stats: {
    label: string;
    value: string | number;
    icon: typeof DollarSign;
    href?: string;
  }[] = [
    { label: "Sales today", value: formatCents(salesToday._sum.totalCents ?? 0), icon: DollarSign },
    { label: "Sales this month", value: formatCents(salesMonth._sum.totalCents ?? 0), icon: CalendarDays },
    { label: "Orders today", value: ordersToday, icon: ShoppingCart },
    { label: "Awaiting shipment", value: ordersAwaiting, icon: Truck },
    { label: "Inventory items", value: totalItems._sum.quantity ?? 0, icon: Boxes, href: "/admin/inventory" },
    { label: "Inventory value", value: formatCents(value.retailCents), icon: PackageCheck, href: "/admin/inventory" },
    { label: "Low stock", value: lowStock.length, icon: AlertTriangle, href: "/admin/inventory" },
    { label: "Out of stock", value: outOfStock, icon: XCircle, href: "/admin/inventory" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <div className="purple-rule mt-2" />
        </div>
        <Link href="/admin/inventory/new">
          <Button>Add product</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => {
          const tile = (
            <Card
              className={href ? "h-full transition-colors hover:border-primary/40" : "h-full"}
            >
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tnum">{value}</p>
                </div>
                <Icon className="size-6 text-primary/80" />
              </CardContent>
            </Card>
          );
          return href ? (
            <Link key={label} href={href}>
              {tile}
            </Link>
          ) : (
            <div key={label}>{tile}</div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-warning" /> Low stock
          </CardTitle>
          <Link
            href="/admin/inventory"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {lowStock.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Everything is well stocked.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <Link
                    href={`/admin/inventory/${p.id}/edit`}
                    className="min-w-0 truncate hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <Badge variant={p.quantity === 0 ? "destructive" : "warning"}>
                    {p.quantity} left
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className="size-4 text-primary" /> Sell requests
            {newOffers.length > 0 && (
              <Badge variant="default">{newOffers.length} new</Badge>
            )}
          </CardTitle>
          <Link
            href="/admin/sell-requests"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {newOffers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No new requests waiting.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {newOffers.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <Link
                    href={`/admin/sell-requests#${o.id}`}
                    className="min-w-0 flex-1 truncate hover:text-primary"
                  >
                    <span className="font-medium">{o.name}</span>
                    {o.categories.length > 0 && (
                      <span className="text-muted-foreground"> — {o.categories.join(", ")}</span>
                    )}
                  </Link>
                  {o.askingPrice && (
                    <span className="shrink-0 text-xs text-muted-foreground tnum">
                      {o.askingPrice}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
