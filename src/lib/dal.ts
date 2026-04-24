import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { octopusEnv, envToCredentials, supabaseConfigured } from "@/lib/env";
import type { OctopusCredentials } from "@/lib/octopus/types";

/**
 * Verify the current user session. In self-hosted mode (no Supabase) this is a
 * no-op that returns a synthetic session. In multi-user mode it validates the
 * Supabase JWT and redirects to /login if invalid.
 *
 * Memoized with React `cache()` so repeated calls in the same request are free.
 */
export const verifySession = cache(
  async (): Promise<{ userId: string; email: string | null }> => {
    if (!supabaseConfigured()) {
      // Self-hosted mode — no auth, single implicit user.
      return { userId: "self-hosted", email: null };
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      redirect("/login");
    }

    return { userId: user.id, email: user.email ?? null };
  }
);

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
