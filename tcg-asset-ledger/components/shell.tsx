"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Tags,
  ArrowLeftRight,
  PackageOpen,
  Gift,
  Upload,
  Receipt,
  BarChart3,
  Layers,
  ListChecks,
  CalendarDays,
  Tent,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShowModeProvider, type ActiveShowInfo } from "@/components/show-mode-context";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV: { section: string; items: { href: string; label: string; icon: React.ElementType }[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/transactions", label: "Ledger", icon: Receipt },
      { href: "/shows", label: "Shows", icon: CalendarDays },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    section: "Record",
    items: [
      { href: "/buy", label: "Buy", icon: ShoppingCart },
      { href: "/sell", label: "Sell", icon: Tags },
      { href: "/trade", label: "Trade", icon: ArrowLeftRight },
      { href: "/break", label: "Break", icon: PackageOpen },
      { href: "/prize", label: "Prize", icon: Gift },
    ],
  },
  {
    section: "Data",
    items: [
      { href: "/import", label: "Import from Collectr", icon: Upload },
      { href: "/sync", label: "Collectr backlog", icon: ListChecks },
      { href: "/reconcile", label: "Catch-up", icon: ClipboardCheck },
    ],
  },
];

export function Shell({
  children,
  syncPending = 0,
  reconcilePending = 0,
  activeShow = null,
}: {
  children: React.ReactNode;
  syncPending?: number;
  reconcilePending?: number;
  activeShow?: ActiveShowInfo | null;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <ShowModeProvider value={activeShow}>
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/60 md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">TCG Ledger</div>
            <div className="text-[11px] text-muted-foreground">Asset management</div>
          </div>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.section}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{item.label}</span>
                      {(item.href === "/sync" && syncPending > 0) ||
                      (item.href === "/reconcile" && reconcilePending > 0) ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum",
                            active
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : item.href === "/reconcile"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-warning/15 text-warning",
                          )}
                        >
                          {item.href === "/sync" ? syncPending : reconcilePending}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-3 overflow-x-auto border-b border-border bg-card px-4 md:hidden">
          <span className="font-semibold">TCG Ledger</span>
          <ThemeToggle compact />
          {NAV.flatMap((g) => g.items).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap text-sm",
                isActive(item.href)
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </header>

        {activeShow ? (
          <Link
            href={`/shows/${activeShow.id}`}
            className="flex items-center justify-center gap-2 bg-success px-4 py-1.5 text-sm font-medium text-white hover:opacity-95"
          >
            <Tent className="size-4" />
            Show Mode — {activeShow.name}. Everything you record is tagged to this show.
            <span className="underline">Open</span>
          </Link>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
    </ShowModeProvider>
  );
}
