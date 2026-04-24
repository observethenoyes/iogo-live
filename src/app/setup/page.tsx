import { verifySession, getUserCredentials } from "@/lib/dal";
import { supabaseConfigured, octopusEnv, envToCredentials } from "@/lib/env";
import {
  getStandardUnitRates,
  getStandingCharges,
  rateAt,
} from "@/lib/octopus/rest-client";
import { todayUkDate, ukDayStart } from "@/lib/calculator/timezone";
import SetupClient from "./SetupClient";

export const dynamic = "force-dynamic";

function maskApiKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 4) + "••••••••";
  return key.slice(0, 8) + "••••" + key.slice(-4);
}

export default async function SetupPage() {
  const isSupabase = supabaseConfigured();
  let existingConfig: React.ComponentProps<typeof SetupClient>["existingConfig"] = null;
  let liveRates: React.ComponentProps<typeof SetupClient>["liveRates"] = null;

  // Resolve existing credentials if the user has already set up.
  let creds = null;
  if (isSupabase) {
    const { userId } = await verifySession();
    creds = await getUserCredentials(userId);
  } else {
    const env = octopusEnv();
    if (env) creds = envToCredentials(env);
  }

  if (creds) {
    existingConfig = {
      accountNumber: creds.accountNumber,
      apiKeyMasked: maskApiKey(creds.apiKey),
      mpan: creds.mpan,
      meterSerial: creds.meterSerial,
      productCode: creds.productCode,
      tariffCode: creds.tariffCode,
      peakRateOverride: creds.peakRateOverride ?? null,
      offPeakRateOverride: creds.offPeakRateOverride ?? null,
      standingChargeOverride: creds.standingChargeOverride ?? null,
    };

    // Fetch current live rates from the API.
    try {
      const [unitRates, standingCharges] = await Promise.all([
        getStandardUnitRates(creds),
        getStandingCharges(creds),
      ]);

      const today = todayUkDate();
      const midnight = ukDayStart(today);
      const noon = new Date(midnight.getTime() + 12 * 60 * 60 * 1000);

      liveRates = {
        peakPence: rateAt(unitRates, noon),
        offPeakPence: rateAt(unitRates, midnight),
        standingChargePence: rateAt(standingCharges, midnight),
      };
    } catch {
      // API call failed — show account overview without live rates.
      liveRates = null;
    }
  }

  return (
    <SetupClient
      existingConfig={existingConfig}
      liveRates={liveRates}
      isSupabase={isSupabase}
    />
  );
}
