import { verifySession, getUserCredentials } from "@/lib/dal";
import { supabaseConfigured, octopusEnv, envToCredentials } from "@/lib/env";
import {
  getStandingCharges,
  getTariffRates,
  rateAt,
} from "@/lib/octopus/rest-client";
import { todayUkDate, ukDayStart, ukDayEnd } from "@/lib/calculator/timezone";
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
      const today = todayUkDate();
      const midnight = ukDayStart(today);
      const dayEnd = ukDayEnd(today);
      const noon = new Date(midnight.getTime() + 12 * 60 * 60 * 1000);

      // getTariffRates, not getStandardUnitRates: the current IOG-* products
      // publish flat day/night rates and return nothing from the standard
      // endpoint, which showed "—" for both rates here while the standing
      // charge resolved normally.
      const [rates, standingCharges] = await Promise.all([
        getTariffRates(creds, midnight, dayEnd),
        getStandingCharges(creds, midnight, dayEnd),
      ]);

      liveRates = {
        peakPence: rates.peakAt(noon),
        offPeakPence: rates.offPeakAt(midnight),
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
