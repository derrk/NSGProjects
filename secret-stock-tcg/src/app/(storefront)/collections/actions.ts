"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { collectionOfferSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";

export type SellFormState = {
  ok?: boolean;
  error?: string;
  /** Per-field messages, keyed by input name. */
  fieldErrors?: Record<string, string>;
};

// This is the one action on the site any stranger can call, so it is capped.
// Generous for a human — nobody submits their collection six times in ten
// minutes — and low enough that a script gets bored.
const SUBMIT_RULE = { limit: 5, windowMs: 10 * 60 * 1000 };

// The owner has been getting these as Formspree emails. The database is now the
// record, but the email is how he actually finds out, so it still fires —
// best-effort, after the row is safely written.
//
// No default on purpose. This repository is public, and a notification endpoint
// baked into the source is one anyone can POST to directly, flooding the lead
// inbox without ever touching the rate limit below. Unset simply means no
// email; the request is still saved and still shows in the admin.
const NOTIFY_URL = process.env.SELL_NOTIFY_URL ?? "";

async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `sell-offer:${ip}`;
}

async function notify(offer: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  categories: string[];
  description: string;
  askingPrice: string | null;
}): Promise<void> {
  if (!NOTIFY_URL) {
    // Empty is the intended state locally. In production it means a real lead
    // just came in and nobody was told, which is worth saying out loud in the
    // logs rather than discovering weeks later.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[sell] SELL_NOTIFY_URL is not set — offer ${offer.id} saved but no email sent.`,
      );
    }
    return;
  }
  try {
    const body = new FormData();
    body.append("_subject", `Sell request from ${offer.name}`);
    body.append("name", offer.name);
    body.append("email", offer.email);
    body.append("phone", offer.phone ?? "");
    body.append("collection", offer.categories.join(", "));
    body.append("askingPrice", offer.askingPrice ?? "");
    body.append("notes", offer.description);
    body.append("adminLink", `/admin/sell-requests#${offer.id}`);
    await fetch(NOTIFY_URL, { method: "POST", body, headers: { Accept: "application/json" } });
  } catch {
    // A failed notification must never cost the shop the lead. The row is
    // already saved and shows up in the admin either way.
  }
}

export async function submitCollectionOffer(
  _prev: SellFormState | undefined,
  formData: FormData,
): Promise<SellFormState> {
  // Honeypot: a field positioned off-screen that no human ever fills in.
  // Succeed quietly rather than erroring, so a bot learns nothing.
  if (String(formData.get("website") ?? "").trim() !== "") return { ok: true };

  const gate = rateLimit(await clientKey(), SUBMIT_RULE);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfterSec / 60);
    return {
      error: `We've already got your request. Try again in ${mins} minute${
        mins === 1 ? "" : "s"
      }, or call the shop.`,
    };
  }

  const parsed = collectionOfferSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    preferredContact: String(formData.get("preferredContact") ?? "email"),
    categories: formData.getAll("categories").map(String),
    description: formData.get("description") ?? "",
    itemCountEstimate: formData.get("itemCountEstimate") ?? "",
    askingPrice: formData.get("askingPrice") ?? "",
    photosUrl: formData.get("photosUrl") ?? "",
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

  try {
    const created = await prisma.collectionOffer.create({
      data: {
        name: data.name,
        email: data.email,
        phone: nn(data.phone),
        preferredContact: data.preferredContact,
        categories: data.categories,
        description: data.description,
        itemCountEstimate: nn(data.itemCountEstimate),
        askingPrice: nn(data.askingPrice),
        photosUrl: nn(data.photosUrl),
      },
    });
    await notify(created);
  } catch {
    return {
      error: "Something went wrong saving your request. Please try again or call the shop.",
    };
  }

  return { ok: true };
}
