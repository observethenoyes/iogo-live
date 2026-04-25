import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/";
  // Reject absolute URLs and protocol-relative paths so `next` can never
  // redirect off-origin. `new URL("https://evil", origin)` does NOT stay on
  // origin — the base is ignored when the first arg is absolute.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  // Code missing or exchange failed — send to login with error hint.
  return NextResponse.redirect(
    new URL("/login?error=auth_failed", url.origin)
  );
}
