"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export type ContactFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// Same shape as the sell form's cap, and for the same reason: this runs for
// anyone on the internet.
const SUBMIT_RULE = { limit: 5, windowMs: 10 * 60 * 1000 };

// Server-side only, with no fallback. The point of moving this off the client
// is that the endpoint stops being readable in the shipped JavaScript; a
// default in the source would hand it straight back. Unset means no email;
// the message is still saved and still shows in the admin.
const NOTIFY_URL = process.env.CONTACT_NOTIFY_URL ?? "";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Please tell us your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().max(40).optional().default(""),
  interestedItem: z.string().trim().max(300).optional().default(""),
  message: z.string().trim().min(1, "Please write a message").max(5000),
});

async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `contact:${ip}`;
}

export async function submitContactMessage(
  _prev: ContactFormState | undefined,
  formData: FormData,
): Promise<ContactFormState> {
  // Honeypot — succeed quietly so a bot learns nothing.
  if (String(formData.get("website") ?? "").trim() !== "") return { ok: true };

  const gate = rateLimit(await clientKey(), SUBMIT_RULE);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfterSec / 60);
    return {
      error: `We've got your message. Try again in ${mins} minute${
        mins === 1 ? "" : "s"
      }, or call the shop.`,
    };
  }

  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    interestedItem: formData.get("interestedItem") ?? "",
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please check the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;
  const nn = (s: string) => (s.trim() ? s.trim() : null);

  // Save first. The row is what makes the message recoverable, so a failure
  // here — and only here — is worth telling the sender about.
  let saved;
  try {
    saved = await prisma.contactMessage.create({
      data: {
        name: data.name,
        email: data.email,
        phone: nn(data.phone),
        interestedItem: nn(data.interestedItem),
        message: data.message,
      },
    });
  } catch (err) {
    console.error("[contact] save failed:", err);
    return {
      error:
        "Something went wrong sending that. Please try again, or email info@secretstocktx.com.",
    };
  }

  // Notify second, best-effort. The message is already recorded and waiting in
  // the admin, so a dead endpoint is the owner's problem to notice, not a
  // reason to tell a customer their message didn't go through.
  if (!NOTIFY_URL) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[contact] CONTACT_NOTIFY_URL is not set — message ${saved.id} saved but no email sent.`,
      );
    }
    return { ok: true };
  }

  try {
    const body = new FormData();
    body.append("_subject", `Contact form — ${data.name}`);
    body.append("name", data.name);
    body.append("email", data.email);
    body.append("phone", data.phone);
    body.append("interestedItem", data.interestedItem);
    body.append("message", data.message);
    body.append("adminLink", `/admin/messages#${saved.id}`);

    const res = await fetch(NOTIFY_URL, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`notify responded ${res.status}`);
  } catch (err) {
    console.error(`[contact] notify failed for ${saved.id} (message is saved):`, err);
  }

  return { ok: true };
}
