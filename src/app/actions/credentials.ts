"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

interface SaveCredentialsInput {
  apiKey: string;
  accountNumber: string;
  mpan: string;
  meterSerial: string;
  productCode: string;
  tariffCode: string;
}

export async function saveCredentials(input: SaveCredentialsInput) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Encrypt the API key before storing.
  const { ciphertext, iv, tag } = encrypt(input.apiKey);

  const { error: dbError } = await supabase.from("user_credentials").upsert(
    {
      user_id: user.id,
      api_key_encrypted: ciphertext,
      api_key_iv: iv,
      api_key_tag: tag,
      account_number: input.accountNumber,
      mpan: input.mpan,
      meter_serial: input.meterSerial,
      product_code: input.productCode,
      tariff_code: input.tariffCode,
    },
    { onConflict: "user_id" }
  );

  if (dbError) {
    console.error("[saveCredentials] DB error:", dbError);
    return { error: "Failed to save credentials. Please try again." };
  }

  redirect("/");
}

interface SaveRateOverridesInput {
  peakRateOverride: number | null;
  offPeakRateOverride: number | null;
  standingChargeOverride: number | null;
}

export async function saveRateOverrides(input: SaveRateOverridesInput) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { error: dbError } = await supabase
    .from("user_credentials")
    .update({
      peak_rate_override: input.peakRateOverride,
      off_peak_rate_override: input.offPeakRateOverride,
      standing_charge_override: input.standingChargeOverride,
    })
    .eq("user_id", user.id);

  if (dbError) {
    console.error("[saveRateOverrides] DB error:", dbError);
    return { error: "Failed to save rate overrides. Please try again." };
  }

  return { success: true };
}
