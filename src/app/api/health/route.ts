import { NextResponse } from "next/server";

// Liveness only. Deliberately does no Octopus, Supabase or filesystem work:
// the container healthcheck polls this every 30 seconds, and pointing it at
// `/` re-rendered the whole dashboard each time — roughly 8,600 uncached
// Kraken GraphQL calls a day purely to answer "is the process up?".
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
