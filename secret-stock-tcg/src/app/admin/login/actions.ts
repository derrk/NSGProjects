"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassphrase, sessionToken, ADMIN_COOKIE } from "@/lib/auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string };

// One shared passphrase guards the whole shop, and /admin/login is reachable
// from the open internet, so without a cap an attacker can simply keep
// guessing. Generous enough that a real typo or two costs nothing.
const LOGIN_RULE = { limit: 8, windowMs: 10 * 60 * 1000 };

async function clientKey(): Promise<string> {
  const h = await headers();
  // Vercel always sets x-forwarded-for; the first entry is the real client.
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `admin-login:${ip}`;
}

export async function login(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const passphrase = String(formData.get("passphrase") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  const key = await clientKey();
  const gate = rateLimit(key, LOGIN_RULE);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfterSec / 60);
    return {
      error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  if (!checkPassphrase(passphrase)) {
    // Deliberately vague, and it does not say how many attempts remain.
    return { error: "Incorrect passphrase." };
  }

  // Clear the window so a couple of fat-fingered attempts before a correct one
  // don't leave the owner throttled.
  resetRateLimit(key);

  (await cookies()).set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
