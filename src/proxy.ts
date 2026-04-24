import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseProxyClient } from "@/lib/supabase/proxy";

const PUBLIC_PATHS = new Set(["/login", "/auth/callback"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // Self-hosted mode: no Supabase configured, skip auth entirely.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next();
  }

  // Allow public auth pages.
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Refresh the Supabase session (updates cookies if the JWT was refreshed).
  const response = NextResponse.next({ request });
  const supabase = createSupabaseProxyClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
