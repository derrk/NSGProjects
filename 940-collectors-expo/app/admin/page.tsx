"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatUSD, getTable, SEATING_TABLES, FOUNDER_TABLES, TABLE_LAYOUT } from "../reserve/tables";
import { EVENT_DATE_ISO, EVENT_DATE_LABEL } from "../lib/site";

// Bookable vendor tables (excludes founder HQ + seating).
const BOOKABLE_TABLE_COUNT = TABLE_LAYOUT.filter(
  (t) => !FOUNDER_TABLES.includes(t.id) && !SEATING_TABLES.includes(t.id)
).length;

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
  photo: string | null;
  amountCents: number;
  promoCode: string | null;
  featured: boolean;
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
  const [editRes, setEditRes] = useState<AdminReservation | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [flash, setFlash] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reservations", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    if (!res.ok) {
      // Don't silently blank the list on a server error — say something.
      setAuthed(true);
      setFlash({
        text: "Couldn't load reservations — the server returned an error. If you just deployed, make sure the database migration has been run.",
        kind: "error",
      });
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

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

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

  const act = async (resCode: string, action: "confirm" | "release" | "pending") => {
    setBusy(resCode + action);
    await fetch("/api/admin/reservations/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resCode, action }),
    });
    await load();
    setBusy(null);
  };

  const resendEmail = async (resCode: string) => {
    setBusy(resCode + "resend");
    try {
      const res = await fetch("/api/admin/reservations/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resCode, action: "resend" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setFlash({ text: `Confirmation email re-sent (${resCode}).`, kind: "ok" });
      } else {
        const msg =
          j.error === "email_not_configured"
            ? "Email isn't set up on the server yet — nothing sent."
            : typeof j.error === "string" && j.error
            ? `Couldn't resend: ${j.error}`
            : "Couldn't resend — try again.";
        setFlash({ text: msg, kind: "error" });
      }
    } catch {
      setFlash({ text: "Couldn't resend — try again.", kind: "error" });
    }
    setBusy(null);
  };

  const toggleFeature = async (resCode: string, next: boolean) => {
    setBusy(resCode + "feature");
    try {
      const res = await fetch("/api/admin/reservations/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resCode, action: next ? "feature" : "unfeature" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setFlash({
          text: typeof j.error === "string" ? `Couldn't update: ${j.error}` : "Couldn't update featured.",
          kind: "error",
        });
      }
      await load();
    } catch {
      setFlash({ text: "Couldn't update featured.", kind: "error" });
    }
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
  // Count TABLES, not reservations (a vendor may hold multiple), and only tables
  // that are actually part of the bookable pool (exclude any stranded on removed
  // / founder / seating tables so availability math stays correct).
  const bookableTables = (ts: number[]) =>
    ts.filter((t) => getTable(t) && !FOUNDER_TABLES.includes(t) && !SEATING_TABLES.includes(t));
  const tablesSold = confirmed.reduce((s, r) => s + bookableTables(r.tables).length, 0);
  const pendingTables = pending.reduce((s, r) => s + bookableTables(r.tables).length, 0);
  const availableTables = Math.max(0, BOOKABLE_TABLE_COUNT - tablesSold - pendingTables);
  const daysUntilShow = Math.max(
    0,
    Math.ceil((new Date(EVENT_DATE_ISO).getTime() - Date.now()) / 86_400_000)
  );

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
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            {flash ? (
              <p
                className={`text-sm rounded-lg px-3 py-2 border ${
                  flash.kind === "ok"
                    ? "text-green-300 bg-green-500/10 border-green-500/25"
                    : "text-red-300 bg-red-500/10 border-red-500/30"
                }`}
              >
                {flash.text}
              </p>
            ) : (
              <span />
            )}
            <button
              onClick={() => setBroadcastOpen(true)}
              className="retro-btn-outline text-xs px-4 py-2 whitespace-nowrap"
            >
              ✉ Email vendors
            </button>
          </div>

          {/* Countdown to show day */}
          <div className="retro-panel p-4 flex items-center justify-between gap-3">
            <div>
              <p className="pixel-eyebrow text-[#A855F7]" style={{ fontSize: 9 }}>Countdown</p>
              <p className="text-white mt-1">
                <span className="text-3xl font-black tabular-nums">{daysUntilShow}</span>{" "}
                <span className="text-sm text-[#E5E7EB]/70">
                  {daysUntilShow === 1 ? "day" : "days"} until the show
                </span>
              </p>
            </div>
            <p className="text-sm text-[#E5E7EB]/50 text-right shrink-0">{EVENT_DATE_LABEL}</p>
          </div>

          {/* Stats (all table counts, not reservation counts) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Available" value={String(availableTables)} />
            <Stat label="Pending" value={String(pendingTables)} />
            <Stat label="Sold" value={String(tablesSold)} />
            <Stat label="Revenue" value={formatUSD(totalConfirmed)} />
            <Stat label="Inquiries" value={String(newInquiries.length)} />
          </div>

          <Section title={`Pending payment (${pending.length} ${pending.length === 1 ? "vendor" : "vendors"} · ${pendingTables} ${pendingTables === 1 ? "table" : "tables"})`}>
            {pending.length === 0 && <Empty>No pending requests.</Empty>}
            {pending.map((r) => (
              <ResRow key={r.id} r={r} busy={busy} onEdit={() => setEditRes(r)} onConfirm={() => act(r.resCode, "confirm")} onRelease={() => act(r.resCode, "release")} />
            ))}
          </Section>

          <Section title={`Confirmed (${confirmed.length} ${confirmed.length === 1 ? "vendor" : "vendors"} · ${tablesSold} ${tablesSold === 1 ? "table" : "tables"})`}>
            {confirmed.length === 0 && <Empty>None yet.</Empty>}
            {confirmed.map((r) => (
              <ResRow
                key={r.id}
                r={r}
                busy={busy}
                onEdit={() => setEditRes(r)}
                onResend={() => resendEmail(r.resCode)}
                onToggleFeature={() => toggleFeature(r.resCode, !r.featured)}
                onUnconfirm={() => act(r.resCode, "pending")}
                onRelease={() => act(r.resCode, "release")}
              />
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

      {editRes && (
        <EditReservationModal
          res={editRes}
          onClose={() => setEditRes(null)}
          onSaved={async () => {
            setEditRes(null);
            await load();
          }}
        />
      )}

      {broadcastOpen && (
        <BroadcastModal
          rows={rows}
          onClose={() => setBroadcastOpen(false)}
          onSent={(text, kind) => {
            setBroadcastOpen(false);
            setFlash({ text, kind });
          }}
        />
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
  onEdit,
  onResend,
  onToggleFeature,
  onUnconfirm,
}: {
  r: AdminReservation;
  busy: string | null;
  onConfirm?: () => void;
  onRelease?: () => void;
  onEdit?: () => void;
  onResend?: () => void;
  onToggleFeature?: () => void;
  onUnconfirm?: () => void;
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
            {r.tables.map((t) => {
              const stranded = !getTable(t) || SEATING_TABLES.includes(t);
              return (
                <span
                  key={t}
                  className={
                    stranded
                      ? "px-2 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-[11px] font-bold text-red-300"
                      : "px-2 py-0.5 rounded bg-[#A855F7]/15 border border-[#A855F7]/30 text-[11px] font-bold text-[#A855F7]"
                  }
                >
                  {t}
                  {stranded ? " ⚠" : ""}
                </span>
              );
            })}
          </div>
          {r.tables.some((t) => !getTable(t) || SEATING_TABLES.includes(t)) && (
            <p className="text-[11px] text-red-300/80 mt-1">
              ⚠ On a table that no longer exists in the new layout — use Edit to reassign.
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-white tabular-nums">{formatUSD(r.amountCents)}</p>
          <p className="text-[11px] text-[#E5E7EB]/40 font-mono">{r.resCode}</p>
          <div className="flex flex-wrap gap-2 mt-2 justify-end">
            {onToggleFeature && (
              <button
                onClick={onToggleFeature}
                disabled={!!busy}
                title={r.featured ? "Featured on homepage — click to remove" : "Feature this vendor on the homepage"}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 transition-colors ${
                  r.featured
                    ? "bg-[#FACC15]/20 border-[#FACC15]/50 text-[#FACC15]"
                    : "bg-white/5 border-white/10 text-[#E5E7EB]/70 hover:text-white"
                }`}
              >
                {busy === r.resCode + "feature" ? "…" : r.featured ? "★ Featured" : "☆ Feature"}
              </button>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#E5E7EB]/70 text-xs font-semibold hover:text-white disabled:opacity-50"
              >
                Edit
              </button>
            )}
            {onConfirm && (
              <button
                onClick={onConfirm}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-xs font-semibold hover:bg-green-500/30 disabled:opacity-50"
              >
                Confirm paid
              </button>
            )}
            {onResend && (
              <button
                onClick={onResend}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/30 text-[#A855F7] text-xs font-semibold hover:bg-[#A855F7]/25 disabled:opacity-50"
              >
                {busy === r.resCode + "resend" ? "Sending…" : "Resend email"}
              </button>
            )}
            {onUnconfirm && (
              <button
                onClick={onUnconfirm}
                disabled={!!busy}
                title="Move back to pending payment"
                className="px-3 py-1.5 rounded-lg bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15] text-xs font-semibold hover:bg-[#FACC15]/25 disabled:opacity-50"
              >
                {busy === r.resCode + "pending" ? "…" : "↩ Pending"}
              </button>
            )}
            {onRelease && (
              <button
                onClick={onRelease}
                disabled={!!busy}
                title={onUnconfirm ? "Cancel this reservation and free the table(s)" : "Release the held table(s)"}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold hover:bg-red-500/25 disabled:opacity-50"
              >
                {onUnconfirm ? "Cancel" : "Release"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#E5E7EB]/60 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function EditReservationModal({
  res,
  onClose,
  onSaved,
}: {
  res: AdminReservation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    business: res.business ?? "",
    instagram: res.instagram ?? "",
    firstName: res.firstName ?? "",
    lastName: res.lastName ?? "",
    email: res.email ?? "",
    phone: res.phone ?? "",
    category: res.category ?? "",
    photo: res.photo ?? "",
    amountPaid: res.amountCents != null ? (res.amountCents / 100).toString() : "",
    tables: res.tables.join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // Downscale an admin-uploaded vendor logo to a ~200px square JPEG data URL
  // (same treatment as the vendor's own checkout upload) so it renders on the map.
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const size = 200;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setForm((f) => ({ ...f, photo: canvas.toDataURL("image/jpeg", 0.82) }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.business.trim()) {
      setErr("Business name can't be empty.");
      return;
    }
    // Amount collected (dollars -> cents). Blank = leave unchanged.
    let amountCents: number | undefined;
    if (form.amountPaid.trim() !== "") {
      const dollars = Number(form.amountPaid);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setErr("Amount paid must be a positive number.");
        return;
      }
      amountCents = Math.round(dollars * 100);
    }
    // Table numbers.
    const parsedTables = form.tables
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    if (parsedTables.length === 0) {
      setErr("Enter at least one table number.");
      return;
    }

    setSaving(true);
    setErr(null);

    // 1) Vendor info + amount.
    const fields: Record<string, unknown> = {
      business: form.business,
      instagram: form.instagram,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      category: form.category,
      photo: form.photo,
    };
    if (amountCents !== undefined) fields.amountCents = amountCents;

    const r = await fetch("/api/admin/reservations/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resCode: res.resCode, fields }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error === "business_required" ? "Business name can't be empty." : "Couldn't save — try again.");
      setSaving(false);
      return;
    }

    // 2) Table reassignment (only if changed).
    const origTables = [...res.tables].sort((a, b) => a - b).join(",");
    const nextTables = [...parsedTables].sort((a, b) => a - b).join(",");
    if (origTables !== nextTables) {
      const t = await fetch("/api/admin/reservations/tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resCode: res.resCode, tables: parsedTables }),
      });
      if (!t.ok) {
        const j = await t.json().catch(() => ({}));
        if (j.error === "conflict") {
          setErr(`Table(s) ${(j.tables ?? []).join(", ")} are already taken or blocked. Vendor info was saved; the table move was not.`);
        } else {
          setErr(
            typeof j.error === "string" && j.error
              ? `Vendor info saved, but the table move failed: ${j.error}`
              : "Vendor info saved, but the table move failed."
          );
        }
        setSaving(false);
        return;
      }
    }

    onSaved();
  };

  const input =
    "w-full px-3.5 py-2.5 rounded-xl bg-[#0B0713] border border-white/10 text-white text-sm focus:outline-none focus:border-[#A855F7]/50";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[90vh] overflow-y-auto retro-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Edit reservation</h3>
          <span className="text-[11px] font-mono text-[#E5E7EB]/40">{res.resCode}</span>
        </div>
        <div className="space-y-3">
          <EditField label="Table image (logo shown on the map)">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#0B0713] border border-white/10 flex items-center justify-center shrink-0">
                {form.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.photo} alt="Vendor" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-[#E5E7EB]/30 text-center px-1">No image</span>
                )}
              </div>
              <div className="min-w-0">
                <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B0713] border border-white/10 text-[#E5E7EB]/80 hover:text-white hover:border-[#A855F7]/40 transition-colors text-xs font-medium"
                  >
                    {form.photo ? "Change image" : "Upload image"}
                  </button>
                  {form.photo && (
                    <a
                      href={form.photo}
                      download={`${(form.business || "vendor").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vendor"}-logo.jpg`}
                      className="text-xs text-[#A855F7] hover:underline"
                    >
                      Save image
                    </a>
                  )}
                  {form.photo && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photo: "" }))}
                      className="text-xs text-[#E5E7EB]/40 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#E5E7EB]/40 mt-1.5 leading-snug">
                  Replaces the table number on the map. A square logo works best.
                </p>
              </div>
            </div>
          </EditField>
          <EditField label="Business name (shown on the map)">
            <input className={input} value={form.business} onChange={set("business")} />
          </EditField>
          <EditField label="Instagram">
            <input className={input} value={form.instagram} onChange={set("instagram")} placeholder="@handle" />
          </EditField>
          <div className="grid grid-cols-2 gap-3">
            <EditField label="First name">
              <input className={input} value={form.firstName} onChange={set("firstName")} />
            </EditField>
            <EditField label="Last name">
              <input className={input} value={form.lastName} onChange={set("lastName")} />
            </EditField>
          </div>
          <EditField label="Email">
            <input className={input} type="email" value={form.email} onChange={set("email")} />
          </EditField>
          <EditField label="Phone">
            <input className={input} value={form.phone} onChange={set("phone")} />
          </EditField>
          <EditField label="Category">
            <input className={input} value={form.category} onChange={set("category")} />
          </EditField>
          <div className="grid grid-cols-2 gap-3">
            <EditField label="Amount paid ($)">
              <input
                className={input}
                type="number"
                min="0"
                step="0.01"
                value={form.amountPaid}
                onChange={set("amountPaid")}
                placeholder="e.g. 85"
              />
            </EditField>
            <EditField label="Table number(s)">
              <input
                className={input}
                value={form.tables}
                onChange={set("tables")}
                placeholder="e.g. 45, 46"
              />
            </EditField>
          </div>
          <p className="text-[11px] text-[#E5E7EB]/40 -mt-1">
            Comma-separate multiple tables. Changing these moves the vendor on the public map.
          </p>
        </div>
        {err && <p className="text-sm text-red-400 mt-3">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={saving} className="retro-btn flex-1">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose} className="retro-btn-outline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BroadcastModal({
  rows,
  onClose,
  onSent,
}: {
  rows: AdminReservation[];
  onClose: () => void;
  onSent: (msg: string, kind: "ok" | "error") => void;
}) {
  const [toConfirmed, setToConfirmed] = useState(true);
  const [toPending, setToPending] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attach, setAttach] = useState<{ filename: string; content: string } | null>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  const onAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttach({ filename: file.name, content: dataUrl.split(",")[1] ?? "" });
    };
    reader.readAsDataURL(file);
  };

  const statuses = [
    ...(toConfirmed ? ["confirmed"] : []),
    ...(toPending ? ["pending"] : []),
  ];

  // Distinct recipients (by email) across the selected groups.
  const recipientCount = (() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (statuses.includes(r.status) && r.email) set.add(r.email.toLowerCase());
    }
    return set.size;
  })();

  const send = async () => {
    setErr(null);
    if (statuses.length === 0) return setErr("Pick at least one group to send to.");
    if (!subject.trim() || !message.trim()) return setErr("Add a subject and a message.");
    if (recipientCount === 0) return setErr("No vendors match the selected groups yet.");
    if (attach && attach.content.length > 3_500_000)
      return setErr("That image is too large — please use one under ~2.5MB.");
    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statuses, subject, message, attachment: attach }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {
          email_not_configured: "Email isn't set up on the server (RESEND_API_KEY missing).",
          not_configured: "Backend isn't configured.",
          no_recipients_selected: "Pick at least one group to send to.",
          subject_and_message_required: "Add a subject and a message.",
          attachment_too_large: "That image is too large — please use one under ~2.5MB.",
        };
        setErr(map[j.error as string] ?? "Couldn't send — try again.");
        setSending(false);
        return;
      }
      // A 200 can still mean every message was rejected (batch errored) — treat
      // a total failure as an error and keep the modal open.
      if (j.total > 0 && j.sent === 0) {
        setErr(`Couldn't send — all ${j.total} failed. Check the email setup and try again.`);
        setSending(false);
        return;
      }
      const failNote = j.failed ? `, ${j.failed} failed` : "";
      onSent(`Sent to ${j.sent} of ${j.total} vendor(s)${failNote}.`, j.failed ? "error" : "ok");
    } catch {
      setErr("Couldn't send — try again.");
      setSending(false);
    }
  };

  const input =
    "w-full px-3.5 py-2.5 rounded-xl bg-[#0B0713] border border-white/10 text-white text-sm focus:outline-none focus:border-[#A855F7]/50";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[90vh] overflow-y-auto retro-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Email vendors</h3>
          <button onClick={onClose} className="text-[#E5E7EB]/40 hover:text-white text-sm">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#E5E7EB]/60 mb-2">Send to</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setToConfirmed((v) => !v)}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold ${
                  toConfirmed
                    ? "bg-[#A855F7]/20 border-[#A855F7]/50 text-white"
                    : "bg-white/5 border-white/10 text-[#E5E7EB]/60"
                }`}
              >
                Confirmed ({rows.filter((r) => r.status === "confirmed").length})
              </button>
              <button
                type="button"
                onClick={() => setToPending((v) => !v)}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold ${
                  toPending
                    ? "bg-[#A855F7]/20 border-[#A855F7]/50 text-white"
                    : "bg-white/5 border-white/10 text-[#E5E7EB]/60"
                }`}
              >
                Pending ({rows.filter((r) => r.status === "pending").length})
              </button>
            </div>
            <p className="text-[11px] text-[#E5E7EB]/40 mt-2">
              {recipientCount} unique recipient{recipientCount === 1 ? "" : "s"} · each gets their own private email.
            </p>
          </div>

          <EditField label="Subject">
            <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="An update from the 940 Collector's Expo" />
          </EditField>

          <EditField label="Message">
            <textarea
              className={`${input} min-h-[150px] resize-y`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={"Hey! Quick update for our vendors…\n\nLinks (https://…) become clickable. Blank lines start new paragraphs."}
            />
          </EditField>

          <EditField label="Attach an image (optional)">
            <input ref={attachRef} type="file" accept="image/*" onChange={onAttach} className="hidden" />
            {attach ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-[#E5E7EB]/80 truncate">📎 {attach.filename}</span>
                <button type="button" onClick={() => setAttach(null)} className="text-xs text-[#E5E7EB]/40 hover:text-red-400 shrink-0">
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => attachRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B0713] border border-white/10 text-[#E5E7EB]/80 hover:text-white hover:border-[#A855F7]/40 text-xs font-medium"
              >
                Choose image
              </button>
            )}
            <p className="text-[11px] text-[#E5E7EB]/40 mt-1.5 leading-snug">
              Attaches to the email (e.g. a flyer). Keep it under ~2.5MB. Attaching sends individually,
              so a large list takes a little longer.
            </p>
          </EditField>

          <p className="text-[11px] text-[#E5E7EB]/40">
            Sent from your branded address with the 940 Collector&apos;s Expo header. Heads up: the free
            Resend tier caps at 100 emails/day — shared with automatic confirmation emails — so a large
            blast can use up the day&apos;s quota.
          </p>
        </div>

        {err && <p className="text-sm text-red-400 mt-3">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={send} disabled={sending} className="retro-btn flex-1">
            {sending ? "Sending…" : `Send${recipientCount ? ` to ${recipientCount}` : ""}`}
          </button>
          <button onClick={onClose} className="retro-btn-outline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
