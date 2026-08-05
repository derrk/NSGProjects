import "server-only";
import { Resend } from "resend";
import { SITE_URL, SITE_NAME } from "./site";
import { EVENT, formatUSD } from "../reserve/tables";

// Transactional email via Resend. Gated on RESEND_API_KEY — if it's absent,
// sends are skipped (nothing breaks). Set these in .env.local + Vercel:
//   RESEND_API_KEY  — from resend.com
//   EMAIL_FROM      — e.g. "940 Collector's Expo <tickets@940collectorsexpo.com>"
//                     (verify the domain in Resend; until then use onboarding@resend.dev)
//   ADMIN_EMAIL     — where new-request notifications go (Dustin)
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "940 Collector's Expo <onboarding@resend.dev>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

const resend = KEY ? new Resend(KEY) : null;

export function emailConfigured(): boolean {
  return !!KEY;
}

export interface ResEmailInfo {
  resCode: string;
  business: string;
  email: string;
  firstName?: string | null;
  tables: number[];
  amountCents: number;
}

async function send(opts: { to: string | string[]; subject: string; html: string }) {
  if (!resend) return;
  try {
    await resend.emails.send({ from: FROM, ...opts });
  } catch (e) {
    console.error("[email] send failed:", (e as Error)?.message ?? e);
  }
}

// --- shared HTML shell -----------------------------------------------------
function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0713;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#171022;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#a855f7,#7e22ce);padding:20px 24px;">
        <div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.5px;">940 COLLECTOR'S EXPO</div>
        <div style="font-size:12px;color:#f3e8ff;">${VENUELINE}</div>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#ffffff;">${title}</h1>
        ${body}
      </div>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:11px;margin:16px 0;">
      940 Collector's Expo · ${EVENT.venueName}, ${EVENT.roomFt ? "Wichita Falls, TX" : ""} · <a href="${SITE_URL}" style="color:#a855f7;">${SITE_URL.replace(/^https?:\/\//, "")}</a>
    </p>
  </div></body></html>`;
}
const VENUELINE = "Wichita Falls, TX";

function tableChips(tables: number[]): string {
  return tables
    .map(
      (t) =>
        `<span style="display:inline-block;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);color:#c4b5fd;border-radius:8px;padding:4px 10px;margin:0 6px 6px 0;font-weight:700;font-size:13px;">Table ${t}</span>`
    )
    .join("");
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#9ca3af;font-size:14px;">${label}</td><td style="padding:6px 0;color:#ffffff;font-size:14px;text-align:right;font-weight:600;">${value}</td></tr>`;
}

// --- 1) Acknowledgement on submit (pending, awaiting Zelle) ----------------
export async function sendVendorAcknowledgement(r: ResEmailInfo) {
  const hi = r.firstName ? `Hi ${r.firstName},` : "Hi there,";
  const body = `
    <p style="color:#d1d5db;font-size:15px;line-height:1.6;margin:0 0 16px;">${hi} thanks for reserving with the 940 Collector's Expo! Your ${
      r.tables.length > 1 ? "tables are" : "table is"
    } <strong style="color:#facc15;">held</strong> — send your Zelle payment now to lock ${r.tables.length > 1 ? "them" : "it"} in.</p>
    <div style="margin:0 0 16px;">${tableChips(r.tables)}</div>
    <div style="background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.35);border-radius:12px;padding:16px;margin:0 0 16px;">
      <div style="color:#facc15;font-weight:700;font-size:14px;margin-bottom:8px;">Pay by Zelle to confirm</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Amount", formatUSD(r.amountCents))}
        ${row("Zelle to", EVENT.zelle.name)}
        ${row("Phone", EVENT.zelle.phone)}
        ${row("Memo", `"${r.business}"`)}
        ${row("Hold #", r.resCode)}
      </table>
    </div>
    <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0;">Once we confirm your payment, you'll get a confirmation email and your spot is locked. Reply to this email with any questions.</p>`;
  await send({ to: r.email, subject: `Your 940 Collector's Expo table is held — send Zelle to confirm`, html: shell("Almost there — send your Zelle", body) });
}

// --- 2) Confirmation once admin verifies payment ---------------------------
export async function sendVendorConfirmation(r: ResEmailInfo) {
  const hi = r.firstName ? `Hi ${r.firstName},` : "Hi there,";
  const body = `
    <p style="color:#d1d5db;font-size:15px;line-height:1.6;margin:0 0 16px;">${hi} you're confirmed for the 940 Collector's Expo! Payment received — your ${
      r.tables.length > 1 ? "tables are" : "table is"
    } officially reserved. 🎉</p>
    <div style="margin:0 0 16px;">${tableChips(r.tables)}</div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      ${row("Confirmation #", r.resCode)}
      ${row("Amount paid", formatUSD(r.amountCents))}
      ${row("Venue", `${EVENT.venueName}, Wichita Falls, TX`)}
    </table>
    <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0;">We'll email you setup details and the show schedule as the date approaches. See you there!</p>`;
  await send({ to: r.email, subject: `You're confirmed for the 940 Collector's Expo ✔`, html: shell("You're confirmed!", body) });
}

// --- 3) Notify the organizer of a new pending request ----------------------
export async function sendAdminNewRequest(r: ResEmailInfo & { contactEmail?: string }) {
  if (!ADMIN_EMAIL) return;
  const body = `
    <p style="color:#d1d5db;font-size:15px;line-height:1.6;margin:0 0 16px;">New table hold — awaiting Zelle payment.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      ${row("Business", r.business)}
      ${row("Email", r.email)}
      ${row("Tables", r.tables.join(", "))}
      ${row("Amount due", formatUSD(r.amountCents))}
      ${row("Hold #", r.resCode)}
    </table>
    <p style="margin:0;"><a href="${SITE_URL}/admin" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px;">Open admin →</a></p>`;
  await send({ to: ADMIN_EMAIL, subject: `New hold: ${r.business} — ${r.tables.length} table(s)`, html: shell("New table hold", body) });
}
