import Dashboard from "@/components/dashboard/Dashboard";
import { buildDailySummary } from "@/lib/calculator/calculate-daily";
import { todayUkDate, ukLocalDayLabel, ukDayStart } from "@/lib/calculator/timezone";
import { resolveCredentials } from "@/lib/dal";
import { supabaseConfigured, octopusEnv, envToCredentials } from "@/lib/env";
import { getAgreementEndDate } from "@/lib/octopus/rest-client";
import { calculateTariffComparison } from "@/lib/octopus/tariff-comparison";

// "Today" depends on the wall clock, and the upstream Octopus calls require
// secrets only available at request time, so this page must not be prerendered
// at build time. The fetch() calls inside the Octopus client still cache the
// upstream responses via next: { revalidate }, so each request is cheap.
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_RANGES = new Set(["live", "daily", "weekly", "monthly", "yearly"]);

export default async function Home({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ date?: string | string[]; range?: string | string[] }>;
}) {
  const params = await searchParams;
  const today = todayUkDate();

  // Validate `?date=YYYY-MM-DD`. Anything malformed, in the future, or missing
  // falls back to today — we don't want a typo'd URL to crash the page.
  const raw = Array.isArray(params.date) ? params.date[0] : params.date;
  const date =
    raw && DATE_RE.test(raw) && raw <= today ? raw : today;

  // Optional `?range=live|daily|weekly|monthly|yearly` — lets Live navigate
  // back to today while preserving the selected range across the page load.
  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const initialRange = rawRange && VALID_RANGES.has(rawRange) ? rawRange : undefined;

  // Resolve credentials: Supabase (multi-user) or env vars (self-hosted).
  let creds;
  if (supabaseConfigured()) {
    const resolved = await resolveCredentials();
    creds = resolved.creds;
  } else {
    const env = octopusEnv();
    if (!env) {
      // No env vars and no Supabase — show setup instructions.
      throw new Error(
        "Missing required environment variables. Visit /setup to discover your Octopus account details."
      );
    }
    creds = envToCredentials(env);
  }

  const dailySummary = await buildDailySummary({ creds, date });
  const dateLabel = ukLocalDayLabel(ukDayStart(date));

  // Fetch agreement end date + tariff comparison in parallel.
  const [agreementEndDate, tariffComparison] = await Promise.all([
    getAgreementEndDate(creds).catch(() => null),
    calculateTariffComparison(
      creds,
      dailySummary.slots,
      dailySummary.standingChargePence
    ).catch(() => null),
  ]);

  return (
    <Dashboard
      dailySummary={dailySummary}
      dateLabel={dateLabel}
      currentDate={date}
      todayDate={today}
      initialRange={initialRange as "live" | "daily" | "weekly" | "monthly" | "yearly" | undefined}
      agreementEndDate={agreementEndDate}
      tariffComparison={tariffComparison}
    />
  );
}
