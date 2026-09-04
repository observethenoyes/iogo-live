import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDailySummary } from "@/lib/calculator/calculate-daily";
import {
  buildWeeklySummary,
  buildMonthlySummary,
  buildYearlySummary,
} from "@/lib/calculator/calculate-range";
import { todayUkDate } from "@/lib/calculator/timezone";
import { OctopusError } from "@/lib/octopus/rest-client";
import { getSession, getUserCredentials } from "@/lib/dal";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { supabaseConfigured, octopusEnv, envToCredentials } from "@/lib/env";
import type { OctopusCredentials } from "@/lib/octopus/types";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  range: z.enum(["daily", "weekly", "monthly", "yearly"]).default("daily"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// GET /api/summary?range=daily&date=YYYY-MM-DD
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid `range` or `date` parameter." },
      { status: 400 }
    );
  }
  const { range } = parsed.data;
  const date = parsed.data.date ?? todayUkDate();

  // Resolve credentials: Supabase (multi-user) or env vars (self-hosted).
  let creds: OctopusCredentials;
  let userId: string | null = null;
  if (supabaseConfigured()) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    userId = session.userId;
    const userCreds = await getUserCredentials(session.userId);
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

  // Throttle before the expensive part. A `yearly` build fans out to a year of
  // consumption plus 14 Kraken queries, and in self-hosted mode this endpoint
  // has no auth in front of it at all. Keyed on the user where there is one,
  // since an IP is spoofable.
  const { ok, retryAfterSec } = rateLimit(
    `summary:${rateLimitKey(request.headers, userId)}`,
    { limit: 30, windowMs: 60_000 }
  );
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
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
    console.error("[api/summary] unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
