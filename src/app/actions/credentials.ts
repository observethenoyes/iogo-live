"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

const SaveCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().min(1).max(64),
  mpan: z.string().trim().min(1).max(32),
  meterSerial: z.string().trim().min(1).max(64),
  productCode: z.string().trim().min(1).max(128),
  tariffCode: z.string().trim().min(1).max(128),
});

export type SaveCredentialsInput = z.input<typeof SaveCredentialsSchema>;

export async function saveCredentials(input: SaveCredentialsInput) {
  const parsed = SaveCredentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid credentials input." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { ciphertext, iv, tag } = encrypt(parsed.data.apiKey);

  const { error: dbError } = await supabase.from("user_credentials").upsert(
    {
      user_id: user.id,
      api_key_encrypted: ciphertext,
      api_key_iv: iv,
      api_key_tag: tag,
      account_number: parsed.data.accountNumber,
      mpan: parsed.data.mpan,
      meter_serial: parsed.data.meterSerial,
      product_code: parsed.data.productCode,
      tariff_code: parsed.data.tariffCode,
    },
    { onConflict: "user_id" }
  );

  if (dbError) {
    console.error("[saveCredentials] DB error code:", dbError.code);
    return { error: "Failed to save credentials. Please try again." };
  }

  redirect("/");
}

// Rate values are in pence including VAT. Clamp server-side — a domestic
// electricity rate will never exceed a few pounds per unit.
const RateValue = z
  .number()
  .finite()
  .min(0)
  .max(1000)
  .nullable();

const SaveRateOverridesSchema = z.object({
  peakRateOverride: RateValue,
  offPeakRateOverride: RateValue,
  standingChargeOverride: RateValue,
});

export type SaveRateOverridesInput = z.input<typeof SaveRateOverridesSchema>;

export async function saveRateOverrides(input: SaveRateOverridesInput) {
  const parsed = SaveRateOverridesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Override values must be between 0 and 1000 pence." };
  }

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
      peak_rate_override: parsed.data.peakRateOverride,
      off_peak_rate_override: parsed.data.offPeakRateOverride,
      standing_charge_override: parsed.data.standingChargeOverride,
    })
    .eq("user_id", user.id);

  if (dbError) {
    console.error("[saveRateOverrides] DB error code:", dbError.code);
    return { error: "Failed to save rate overrides. Please try again." };
  }

  return { success: true };
}
