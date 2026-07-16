import { NextRequest, NextResponse } from "next/server";

// Login gate for the hosted deployment. Set ADMIN_USERNAME + ADMIN_PASSWORD in
// the environment to turn it on (unset = open, e.g. local dev). A successful
// login sets a long-lived session cookie (a hash, never the raw password) so
// the device stays signed in. Repeated failed attempts lock out the browser
// for a cooldown period — this can be bypassed by clearing cookies, but it
// stops naive automated brute force, and a real (non-numeric) password makes
// the search space impractical to guess either way.

const SESSION_COOKIE = "ledger_auth";
const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const ATTEMPTS_COOKIE = "ledger_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface AttemptState {
  count: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

function readAttempts(req: NextRequest): AttemptState {
  const raw = req.cookies.get(ATTEMPTS_COOKIE)?.value;
  if (!raw) return { count: 0, lockedUntil: 0 };
  try {
    const parsed = JSON.parse(raw);
    return { count: Number(parsed.count) || 0, lockedUntil: Number(parsed.lockedUntil) || 0 };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function writeAttempts(res: NextResponse, state: AttemptState) {
  res.cookies.set(ATTEMPTS_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: Math.ceil(LOCKOUT_MS / 1000),
    path: "/",
  });
}

function loginPage(message = "", locked = false): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TCG Ledger — Sign in</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; background: #f6f7f9; }
  form { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08);
         display: flex; flex-direction: column; gap: .75rem; width: min(320px, 90vw); }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  input { font-size: 1rem; padding: .6rem .8rem; border: 1px solid #d0d5dd; border-radius: 8px; }
  button { font-size: 1rem; padding: .65rem; border: 0; border-radius: 8px; background: #111827;
           color: #fff; font-weight: 600; }
  button:disabled { opacity: .5; }
  p { color: #b42318; font-size: .85rem; margin: 0; min-height: 1em; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d0d0e; }
    form { background: #17181a; box-shadow: 0 4px 24px rgba(0,0,0,.5); }
    h1 { color: #f2f2f2; }
    input { background: #0d0d0e; border-color: #333; color: #f2f2f2; }
  }
</style>
</head>
<body>
<form method="POST">
  <h1>TCG Ledger</h1>
  <p>${message}</p>
  <input name="username" type="text" autocomplete="username" placeholder="Username" autofocus required ${locked ? "disabled" : ""} />
  <input name="password" type="password" autocomplete="current-password" placeholder="Password" required ${locked ? "disabled" : ""} />
  <button type="submit" ${locked ? "disabled" : ""}>Sign in</button>
</form>
</body>
</html>`;
  return new NextResponse(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default async function proxy(req: NextRequest) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return NextResponse.next(); // gate off (local dev)

  const sessionValue = await sha256(`${username}:${password}`);

  // Already signed in?
  if (req.cookies.get(SESSION_COOKIE)?.value === sessionValue) return NextResponse.next();

  const attempts = readAttempts(req);
  const now = Date.now();
  const stillLocked = attempts.lockedUntil > now;

  if (req.method === "POST") {
    if (stillLocked) {
      const minutesLeft = Math.ceil((attempts.lockedUntil - now) / 60_000);
      return loginPage(`Too many attempts — try again in ${minutesLeft} minute(s).`, true);
    }

    const form = await req.formData();
    const attemptUser = String(form.get("username") ?? "");
    const attemptPass = String(form.get("password") ?? "");

    if (attemptUser === username && attemptPass === password) {
      const res = NextResponse.redirect(req.nextUrl);
      res.cookies.set(SESSION_COOKIE, sessionValue, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
      res.cookies.delete(ATTEMPTS_COOKIE);
      return res;
    }

    const nextCount = attempts.count + 1;
    const lockedOut = nextCount >= MAX_ATTEMPTS;
    const res = loginPage(
      lockedOut
        ? `Too many attempts — try again in ${Math.ceil(LOCKOUT_MS / 60_000)} minute(s).`
        : "Wrong username or password.",
      lockedOut,
    );
    writeAttempts(res, { count: nextCount, lockedUntil: lockedOut ? now + LOCKOUT_MS : 0 });
    return res;
  }

  if (stillLocked) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - now) / 60_000);
    return loginPage(`Too many attempts — try again in ${minutesLeft} minute(s).`, true);
  }

  return loginPage();
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|uploads/).*)"],
};
