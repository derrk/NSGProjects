import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { countPendingSyncTasks } from "@/lib/sync-backlog";
import { countPendingReconcileTasks } from "@/lib/reconcile-tasks";
import { getActiveShow } from "@/lib/shows";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG Asset Ledger",
  description: "Local-first asset ledger for trading card vendors.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [syncPending, reconcilePending, activeShow] = await Promise.all([
    countPendingSyncTasks(),
    countPendingReconcileTasks(),
    getActiveShow(),
  ]);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="rocket"){document.documentElement.classList.add(t);document.documentElement.style.colorScheme="dark"}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Shell
          syncPending={syncPending}
          reconcilePending={reconcilePending}
          activeShow={activeShow ? { id: activeShow.id, name: activeShow.name } : null}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
