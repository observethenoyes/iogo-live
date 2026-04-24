import { NextResponse } from "next/server";
import { buildDailySummary } from "@/lib/calculator/calculate-daily";
import {
  buildWeeklySummary,
  buildMonthlySummary,
  buildYearlySummary,
} from "@/lib/calculator/calculate-range";
import { todayUkDate } from "@/lib/calculator/timezone";
import { OctopusError } from "@/lib/octopus/rest-client";
import { verifySession, getUserCredentials } from "@/lib/dal";
import { supabaseConfigured, octopusEnv, envToCredentials } from "@/lib/env";
import type { OctopusCredentials } from "@/lib/octopus/types";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(["daily", "weekly", "monthly", "yearly"]);

// GET /api/summary?range=daily&date=YYYY-MM-DD
export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "daily";
  const date = url.searchParams.get("date") ?? todayUkDate();

  if (!VALID_RANGES.has(range)) {
    return NextResponse.json(
      { error: `range "${range}" is not supported` },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: `date must be YYYY-MM-DD, got "${date}"` },
      { status: 400 }
    );
  }

  // Resolve credentials: Supabase (multi-user) or env vars (self-hosted).
  let creds: OctopusCredentials;
  if (supabaseConfigured()) {
    const { userId } = await verifySession();
    // In API routes verifySession redirects on failure which throws a
    // Next.js redirect — let it bubble up.
    const userCreds = await getUserCredentials(userId);
    if (!userCreds) {
      return NextResponse.json(
        { error: "No Octopus credentials configured. Visit /setup first." },
        { status: 403 }
      );
    }
    creds = userCreds;
  } else {
    const env = octopusEnv();
    if (!env) {
      return NextResponse.json(
        { error: "Missing OCTOPUS_* environment variables." },
        { status: 500 }
      );
    }
    creds = envToCredentials(env);
  }

  try {
    let summary;
    switch (range) {
      case "daily":
        summary = await buildDailySummary({ creds, date });
        break;
      case "weekly":
        summary = await buildWeeklySummary({ creds, date });
        break;
      case "monthly":
        summary = await buildMonthlySummary({ creds, date });
        break;
      case "yearly":
        summary = await buildYearlySummary({ creds, date });
        break;
    }
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof OctopusError) {
      return NextResponse.json(
        { error: err.message, upstream: err.status },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
