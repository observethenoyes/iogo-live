import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseProxyClient } from "@/lib/supabase/proxy";
import { supabaseConfigured } from "@/lib/supabase/config";

const PUBLIC_PATHS = new Set(["/login", "/auth/callback", "/api/health"]);

// PWA assets the browser fetches without (or before) a session — the manifest
// is often requested anonymously. Redirecting these to /login hands the
// browser an HTML login page in place of the manifest, which kills the
// "Add to Home Screen" install prompt on the very page that needs it.
const PUBLIC_ASSETS = new Set([
  "/manifest.webmanifest",
  "/icon-192x192",
  "/icon-512x512",
  "/apple-icon",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    PUBLIC_ASSETS.has(pathname)
  ) {
    return NextResponse.next();
  }

  // Self-hosted mode: no Supabase configured, skip auth entirely. Uses the
  // same predicate as the DAL so the two can't disagree about which mode
  // we're in.
  if (!supabaseConfigured()) {
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
