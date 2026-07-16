import { NextRequest, NextResponse } from "next/server";

// PIN gate for the hosted deployment. Set APP_PIN in the environment to turn
// it on (no APP_PIN = open, e.g. local dev). First visit enters the PIN once;
// a long-lived cookie keeps the device signed in.

const COOKIE = "ledger_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function loginPage(message = ""): NextResponse {
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
  input { font-size: 1.25rem; padding: .6rem .8rem; border: 1px solid #d0d5dd; border-radius: 8px;
          letter-spacing: .3em; text-align: center; }
  button { font-size: 1rem; padding: .65rem; border: 0; border-radius: 8px; background: #111827;
           color: #fff; font-weight: 600; }
  p { color: #b42318; font-size: .85rem; margin: 0; min-height: 1em; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d0d0e; }
    form { background: #17181a; box-shadow: 0 4px 24px rgba(0,0,0,.5); }
    h1 { color: #f2f2f2; }
    input { background: #0d0d0e; border-color: #333; color: #f2f2f2; }
    button { background: #dc2033; }
  }
</style>
</head>
<body>
<form method="GET">
  <h1>TCG Ledger</h1>
  <p>${message}</p>
  <input name="pin" type="password" inputmode="numeric" autocomplete="current-password"
         placeholder="PIN" autofocus required />
  <button type="submit">Unlock</button>
</form>
</body>
</html>`;
  return new NextResponse(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default function proxy(req: NextRequest) {
  const pin = process.env.APP_PIN;
  if (!pin) return NextResponse.next(); // gate off (local dev)

  // Already signed in?
  if (req.cookies.get(COOKIE)?.value === pin) return NextResponse.next();

  // PIN submitted via the login form (?pin=...)
  const attempt = req.nextUrl.searchParams.get("pin");
  if (attempt !== null) {
    if (attempt === pin) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete("pin");
      const res = NextResponse.redirect(clean);
      res.cookies.set(COOKIE, pin, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });
      return res;
    }
    return loginPage("Wrong PIN — try again.");
  }

  return loginPage();
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|uploads/).*)"],
};
