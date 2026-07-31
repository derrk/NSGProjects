"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUSD } from "../reserve/tables";

interface AdminReservation {
  id: string;
  resCode: string;
  status: string;
  business: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  instagram: string | null;
  category: string | null;
  amountCents: number;
  promoCode: string | null;
  createdAt: string;
  tables: number[];
}

interface AdminInquiry {
  id: string;
  business: string | null;
  contactName: string | null;
  email: string;
  phone: string | null;
  products: string[];
  tablesRequested: string | null;
  website: string | null;
  social: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminReservation[]>([]);
  const [inquiries, setInquiries] = useState<AdminInquiry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reservations", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const json = await res.json();
    setAuthed(true);
    setConfigured(json.configured !== false);
    setRows(json.reservations ?? []);
    const iq = await fetch("/api/admin/inquiries", { cache: "no-store" });
    if (iq.ok) {
      const ij = await iq.json();
      setInquiries(ij.inquiries ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setLoginError(j.error === "admin_not_configured" ? "Admin passcode isn't set on the server yet." : "Incorrect passcode.");
      return;
    }
    setPasscode("");
    await load();
  };

  const act = async (resCode: string, action: "confirm" | "release") => {
    setBusy(resCode + action);
    await fetch("/api/admin/reservations/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resCode, action }),
    });
    await load();
    setBusy(null);
  };

  const archiveInquiry = async (id: string, status: "new" | "archived") => {
    setBusy(id);
    await fetch("/api/admin/inquiries/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
    setBusy(null);
  };

  const newInquiries = inquiries.filter((i) => i.status !== "archived");
  const pending = rows.filter((r) => r.status === "pending");
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const totalConfirmed = confirmed.reduce((s, r) => s + r.amountCents, 0);
  const tablesSold = confirmed.reduce((s, r) => s + r.tables.length, 0);

  return (
    <main className="min-h-screen px-4 sm:px-8 py-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="pixel-eyebrow text-[#A855F7] mb-2">940 Collector&apos;s Expo</p>
          <h1 className="text-2xl font-black text-white">Vendor Admin</h1>
        </div>
        <a href="/" className="text-sm text-[#E5E7EB]/50 hover:text-white">← Site</a>
      </div>

      {authed === null && <p className="text-[#E5E7EB]/50">Loading…</p>}

      {authed === false && (
        <form onSubmit={login} className="retro-panel p-6 max-w-sm">
          <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">Admin passcode</label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0713] border border-white/10 text-white focus:outline-none focus:border-[#A855F7]/50 text-sm mb-3"
          />
          {loginError && <p className="text-sm text-red-400 mb-3">{loginError}</p>}
          <button type="submit" className="retro-btn w-full">Log In</button>
        </form>
      )}

      {authed && !configured && (
        <div className="retro-panel p-6">
          <p className="text-[#FACC15] font-bold mb-2">Backend not configured</p>
          <p className="text-sm text-[#E5E7EB]/60">
            Add <code className="text-[#A855F7]">SUPABASE_URL</code>,{" "}
            <code className="text-[#A855F7]">SUPABASE_SERVICE_ROLE_KEY</code>, and run the SQL migration to
            enable live reservations. Until then the public site runs on per-browser storage.
          </p>
        </div>
      )}

      {authed && configured && (
        <div className="space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Pending" value={String(pending.length)} />
            <Stat label="Tables sold" value={String(tablesSold)} />
            <Stat label="Confirmed $" value={formatUSD(totalConfirmed)} />
            <Stat label="Inquiries" value={String(newInquiries.length)} />
          </div>

          <Section title={`Pending payment (${pending.length})`}>
            {pending.length === 0 && <Empty>No pending requests.</Empty>}
            {pending.map((r) => (
              <ResRow key={r.id} r={r} busy={busy} onConfirm={() => act(r.resCode, "confirm")} onRelease={() => act(r.resCode, "release")} />
            ))}
          </Section>

          <Section title={`Confirmed (${confirmed.length})`}>
            {confirmed.length === 0 && <Empty>None yet.</Empty>}
            {confirmed.map((r) => (
              <ResRow key={r.id} r={r} busy={busy} onRelease={() => act(r.resCode, "release")} />
            ))}
          </Section>

          <Section title={`Vendor inquiries (${newInquiries.length})`}>
            {newInquiries.length === 0 && <Empty>No new inquiries.</Empty>}
            {newInquiries.map((i) => (
              <InquiryRow key={i.id} i={i} busy={busy} onArchive={() => archiveInquiry(i.id, "archived")} />
            ))}
          </Section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="retro-panel p-4 text-center">
      <p className="text-xl font-black text-white tabular-nums">{value}</p>
      <p className="pixel-eyebrow text-[#E5E7EB]/40 mt-1" style={{ fontSize: 8 }}>{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="pixel-eyebrow text-[#A855F7] mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#E5E7EB]/40">{children}</p>;
}

function InquiryRow({
  i,
  busy,
  onArchive,
}: {
  i: AdminInquiry;
  busy: string | null;
  onArchive: () => void;
}) {
  return (
    <div className="retro-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white">
            {i.business || "(no business name)"}
            {i.tablesRequested ? ` · ${i.tablesRequested} table(s)` : ""}
          </p>
          <p className="text-xs text-[#E5E7EB]/50">
            {i.contactName ? `${i.contactName} · ` : ""}
            <a href={`mailto:${i.email}`} className="text-[#A855F7] hover:underline">{i.email}</a>
            {i.phone ? ` · ${i.phone}` : ""}
          </p>
          {(i.website || i.social) && (
            <p className="text-xs text-[#E5E7EB]/40 mt-0.5">
              {i.website ? i.website : ""}
              {i.website && i.social ? " · " : ""}
              {i.social ? i.social : ""}
            </p>
          )}
          {i.products.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {i.products.map((p) => (
                <span key={p} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] text-[#E5E7EB]/60">
                  {p}
                </span>
              ))}
            </div>
          )}
          {i.notes && <p className="text-xs text-[#E5E7EB]/55 mt-2 italic">“{i.notes}”</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-[#E5E7EB]/40">
            {new Date(i.createdAt).toLocaleDateString()}
          </p>
          <button
            onClick={onArchive}
            disabled={!!busy}
            className="mt-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#E5E7EB]/70 text-xs font-semibold hover:text-white disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function ResRow({
  r,
  busy,
  onConfirm,
  onRelease,
}: {
  r: AdminReservation;
  busy: string | null;
  onConfirm?: () => void;
  onRelease?: () => void;
}) {
  return (
    <div className="retro-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white">{r.business}</p>
          <p className="text-xs text-[#E5E7EB]/50">
            {[r.firstName, r.lastName].filter(Boolean).join(" ")} · {r.email}
            {r.phone ? ` · ${r.phone}` : ""}
          </p>
          <p className="text-xs text-[#E5E7EB]/40 mt-0.5">
            {r.category ?? "—"}
            {r.instagram ? ` · ${r.instagram}` : ""}
            {r.promoCode ? ` · code ${r.promoCode}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.tables.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded bg-[#A855F7]/15 border border-[#A855F7]/30 text-[11px] font-bold text-[#A855F7]">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-white tabular-nums">{formatUSD(r.amountCents)}</p>
          <p className="text-[11px] text-[#E5E7EB]/40 font-mono">{r.resCode}</p>
          <div className="flex gap-2 mt-2 justify-end">
            {onConfirm && (
              <button
                onClick={onConfirm}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-xs font-semibold hover:bg-green-500/30 disabled:opacity-50"
              >
                Confirm paid
              </button>
            )}
            {onRelease && (
              <button
                onClick={onRelease}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold hover:bg-red-500/25 disabled:opacity-50"
              >
                Release
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
