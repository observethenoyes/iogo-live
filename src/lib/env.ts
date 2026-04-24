// Server-only env validation for Octopus credentials.
// Importing this from a Client Component will throw at build time, which is what we want.
import "server-only";

import type { OctopusCredentials } from "@/lib/octopus/types";

const REQUIRED = [
  "OCTOPUS_API_KEY",
  "OCTOPUS_ACCOUNT_NUMBER",
  "OCTOPUS_MPAN",
  "OCTOPUS_METER_SERIAL",
  "OCTOPUS_PRODUCT_CODE",
  "OCTOPUS_TARIFF_CODE",
] as const;

type RequiredKey = (typeof REQUIRED)[number];

/**
 * Read Octopus credentials from environment variables. Returns `null` if any
 * are missing — callers must handle the missing-credentials case (e.g. redirect
 * to /setup). This replaces the old throwing behaviour so the app can run in
 * multi-user Supabase mode where env vars are intentionally absent.
 */
function read(): Record<RequiredKey, string> | null {
  const out = {} as Record<RequiredKey, string>;
  for (const key of REQUIRED) {
    const v = process.env[key];
    if (!v) return null;
    out[key] = v;
  }
  return out;
}

let cached: Record<RequiredKey, string> | null | undefined;

/**
 * Returns Octopus credentials from env vars, or `null` if they are not
 * configured. In self-hosted (single-user) mode the env vars are set; in
 * multi-user Supabase mode they are intentionally absent and credentials come
 * from the database instead.
 */
export function octopusEnv(): Record<RequiredKey, string> | null {
  if (cached === undefined) cached = read();
  return cached;
}

/** Parse a numeric env var. Returns `null` if absent or not a number. */
function numericEnv(key: string): number | null {
  const v = process.env[key];
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Build an `OctopusCredentials` from the env-var record. */
export function envToCredentials(
  env: Record<RequiredKey, string>
): OctopusCredentials {
  return {
    apiKey: env.OCTOPUS_API_KEY,
    accountNumber: env.OCTOPUS_ACCOUNT_NUMBER,
    mpan: env.OCTOPUS_MPAN,
    meterSerial: env.OCTOPUS_METER_SERIAL,
    productCode: env.OCTOPUS_PRODUCT_CODE,
    tariffCode: env.OCTOPUS_TARIFF_CODE,
    peakRateOverride: numericEnv("OCTOPUS_PEAK_RATE_OVERRIDE"),
    offPeakRateOverride: numericEnv("OCTOPUS_OFF_PEAK_RATE_OVERRIDE"),
    standingChargeOverride: numericEnv("OCTOPUS_STANDING_CHARGE_OVERRIDE"),
  };
}

/** True if Supabase env vars are set (multi-user mode). */
export function supabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
