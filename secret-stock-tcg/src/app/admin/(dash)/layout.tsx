import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScanLine,
  Settings,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { isAdminAuthed } from "@/lib/auth";
import { countNewOffers } from "@/lib/collection-offers";
import { countNewMessages } from "@/lib/contact-messages";
import { logout } from "@/app/admin/login/actions";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/sell-requests", label: "Sell Requests", icon: HandCoins },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
];

// Later phases. Shown so the shape of the finished admin is visible, but not
// linked — a nav item that 404s is worse than one that says "soon".
const NAV_SOON = [
  { label: "Orders", icon: ClipboardList },
  { label: "Shipping", icon: Truck },
  { label: "Customers", icon: Users },
  { label: "Reports", icon: BarChart3 },
  { label: "Point of Sale", icon: ScanLine },
  { label: "Settings", icon: Settings },
];

export default async function AdminDashLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Proxy already gates this, but re-check here as defense in depth.
  if (!(await isAdminAuthed())) redirect("/admin/login");

  // Anything unanswered rides in the nav, so a lead or a question can't sit
  // unnoticed just because the owner didn't think to open that page.
  const [newOffers, newMessages] = await Promise.all([
    countNewOffers(),
    countNewMessages(),
  ]);
  const UNREAD: Record<string, number> = {
    "/admin/sell-requests": newOffers,
    "/admin/messages": newMessages,
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-border bg-card md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 p-4">
          <div className="size-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-primary/40">
            <Image
              src="/images/secretstockjpg.jpg"
              alt=""
              width={32}
              height={32}
              className="size-full object-cover"
            />
          </div>
          <span className="font-display text-sm font-bold gradient-text">
            Secret Stock TX
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Admin
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="size-4" />
              {label}
              {UNREAD[href] !== undefined && UNREAD[href]! > 0 && (
                <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tnum">
                  {UNREAD[href]}
                </span>
              )}
            </Link>
          ))}
          <div className="mt-2 hidden border-t border-border pt-2 md:block">
            {NAV_SOON.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/50"
                title="Coming in a later phase"
              >
                <Icon className="size-4" />
                {label}
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  Soon
                </span>
              </span>
            ))}
          </div>
        </nav>
        <div className="hidden border-t border-border p-3 md:block">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Store className="size-4" /> View storefront
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
