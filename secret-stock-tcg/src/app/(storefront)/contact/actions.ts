"use server";

import { headers } from "next/headers";
import { z } from "zod";
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
// default in the source would hand it straight back.
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

  // Unlike a sell request, a contact message has no row to fall back on — if
  // the email doesn't go, it is gone. So say so plainly instead of showing a
  // "Message Sent!" that isn't true.
  if (!NOTIFY_URL) {
    console.error("[contact] CONTACT_NOTIFY_URL is not set — message not delivered.");
    return {
      error:
        "Our contact form isn't available right now. Please email info@secretstocktx.com or call (972) 482-5154.",
    };
  }

  const data = parsed.data;
  try {
    const body = new FormData();
    body.append("_subject", `Contact form — ${data.name}`);
    body.append("name", data.name);
    body.append("email", data.email);
    body.append("phone", data.phone);
    body.append("interestedItem", data.interestedItem);
    body.append("message", data.message);

    const res = await fetch(NOTIFY_URL, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`notify responded ${res.status}`);
  } catch (err) {
    console.error("[contact] delivery failed:", err);
    return {
      error:
        "Something went wrong sending that. Please try again, or email info@secretstocktx.com.",
    };
  }

  return { ok: true };
}
