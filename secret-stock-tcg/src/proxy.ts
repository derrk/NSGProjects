import { NextResponse, type NextRequest } from "next/server";

// Gate the whole /admin area behind the shared passphrase cookie. Kept
// self-contained (no next/headers import) so it runs at the edge.
const ADMIN_COOKIE = "ss_admin";

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login page must stay reachable, or there'd be no way back in.
  if (pathname === "/admin/login") return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = process.env.ADMIN_SESSION_TOKEN;

  if (!expected || token !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
