import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { octopusEnv, envToCredentials, supabaseConfigured } from "@/lib/env";
import type { OctopusCredentials } from "@/lib/octopus/types";

export type Session = { userId: string; email: string | null };

/**
 * Read the current session without redirecting on failure. Use from API
 * routes so they can return a 401 JSON response instead of a 307.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!supabaseConfigured()) {
    return { userId: "self-hosted", email: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { userId: user.id, email: user.email ?? null };
});

/**
 * Verify the current user session. Redirects to /login if invalid — use from
 * Server Components and page routes, never from API routes.
 */
export async function verifySession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Fetch and decrypt the Octopus credentials for a given user. Returns `null` if
 * no credentials are stored yet. In self-hosted mode, returns credentials from
 * environment variables.
 */
export const getUserCredentials = cache(
  async (userId: string): Promise<OctopusCredentials | null> => {
    if (!supabaseConfigured()) {
      const env = octopusEnv();
      return env ? envToCredentials(env) : null;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("user_credentials")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;

    const apiKey = decrypt(
      data.api_key_encrypted,
      data.api_key_iv,
      data.api_key_tag
    );

    return {
      apiKey,
      accountNumber: data.account_number,
      mpan: data.mpan,
      meterSerial: data.meter_serial,
      productCode: data.product_code,
      tariffCode: data.tariff_code,
      peakRateOverride: data.peak_rate_override ?? null,
      offPeakRateOverride: data.off_peak_rate_override ?? null,
      standingChargeOverride: data.standing_charge_override ?? null,
    };
  }
);

/**
 * Like `getUserCredentials` but redirects to /setup if no credentials exist.
 */
export async function requireCredentials(
  userId: string
): Promise<OctopusCredentials> {
  const creds = await getUserCredentials(userId);
  if (!creds) redirect("/setup");
  return creds;
}

/**
 * Resolve credentials for the current request. Combines session verification
 * and credential lookup in one call — the common pattern for pages and API
 * routes.
 */
export async function resolveCredentials(): Promise<{
  userId: string;
  creds: OctopusCredentials;
}> {
  const { userId } = await verifySession();
  const creds = await requireCredentials(userId);
  return { userId, creds };
}
