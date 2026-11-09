import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

// A single shared passphrase gates the whole /admin area. The owner types
// ADMIN_PASSPHRASE at /admin/login; on success we set a cookie whose value is
// ADMIN_SESSION_TOKEN, and middleware checks for that exact value on every
// /admin request. Simple, and easy to use on the fly behind the counter.

export const ADMIN_COOKIE = "ss_admin";

export function sessionToken(): string {
  return process.env.ADMIN_SESSION_TOKEN ?? "";
}

// Compare via fixed-width digests. Comparing the raw strings would have to bail
// out early when the lengths differ, which tells an attacker how long the
// passphrase is; hashing first makes every comparison 32 bytes regardless.
function secretEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassphrase(input: string): boolean {
  const expected = process.env.ADMIN_PASSPHRASE ?? "";
  if (!expected || !sessionToken()) return false;
  return secretEquals(input, expected);
}

export async function isAdminAuthed(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const expected = sessionToken();
  if (!token || !expected) return false;
  return secretEquals(token, expected);
}
