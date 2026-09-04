import "server-only";
import type { CostSlot, DailySummary } from "@/lib/types";
import type { OctopusCredentials } from "@/lib/octopus/types";
import {
  buildRateLookup,
  getConsumption,
  getStandingCharges,
  getTariffRates,
} from "@/lib/octopus/rest-client";
import {
  getDispatches,
  getTodayTelemetry,
  type ChargingSessionInfo,
} from "@/lib/octopus/graphql-client";
import { classifySlots, type DispatchInterval } from "./classify-slots";
import { evKwhForDay } from "./ev-energy";
import { addUkDays, todayUkDate, ukDayEnd, ukDayStart } from "./timezone";

// Last-resort fallbacks if the standard-unit-rates endpoint somehow returns
// nothing usable. In practice these should never be hit — the IOG tariff
// publishes both rates with time-of-use buckets covering every day, and we
// look them up at instants known to be in the off-peak / peak windows.
const FALLBACK_OFF_PEAK_PENCE = 7.5;
const FALLBACK_PEAK_PENCE = 27;

const HOUR_MS = 60 * 60 * 1000;

function totals(slots: CostSlot[]) {
  let totalCostPence = 0;
  let totalKwh = 0;
  let offPeakKwh = 0;
  let peakKwh = 0;
  let dispatchKwh = 0;
  for (const s of slots) {
    totalCostPence += s.cost;
    totalKwh += s.consumptionKwh;
    if (s.classification === "off-peak") offPeakKwh += s.consumptionKwh;
    else if (s.classification === "dispatch") dispatchKwh += s.consumptionKwh;
    else peakKwh += s.consumptionKwh;
  }
  return { totalCostPence, totalKwh, offPeakKwh, peakKwh, dispatchKwh };
}

interface BuildOpts {
  /** Per-user Octopus credentials. */
  creds: OctopusCredentials;
  /** YYYY-MM-DD in UK local time. */
  date: string;
  /**
   * Dispatch intervals in UTC. If omitted, they are fetched from Kraken
   * GraphQL. Pass an explicit array (including `[]`) to skip the fetch — useful
   * for tests and for callers that already have dispatches in hand.
   */
  dispatches?: DispatchInterval[];
}

/**
 * Build a DailySummary for a single UK-local day, talking to the Octopus REST
 * API. Returns the shape the dashboard consumes (`DailySummary` from
 * `lib/types.ts`).
 */
export async function buildDailySummary({
  creds,
  date,
  dispatches: dispatchesOverride,
}: BuildOpts): Promise<DailySummary> {
  const periodFrom = ukDayStart(date);
  const periodTo = ukDayEnd(date);
  const today = todayUkDate();
  const isToday = date === today;

  // The REST consumption endpoint is fed by a batch pipeline that lags
  // 24-48 hours, so recent days often have incomplete data. Use Kraken
  // GraphQL `smartMeterTelemetry` (CAD-based, ~30 min lag) for any day
  // within the last 2 days. For older days REST is authoritative.
  const isRecent = date >= addUkDays(today, -2);

  // If the caller supplied dispatches, use them as-is; otherwise fetch from
  // Kraken in parallel with the REST calls. The GraphQL client swallows its
  // own errors and returns `{ dispatches: [], error }` so a Kraken outage
  // can't take the dashboard down.
  const dispatchesPromise =
    dispatchesOverride !== undefined
      ? Promise.resolve({
          dispatches: dispatchesOverride,
          chargingSessions: [] as ChargingSessionInfo[],
          error: null as string | null,
        })
      : getDispatches(creds, periodFrom, periodTo);

  // Kick off both sources in parallel for recent days so a telemetry
  // failure doesn't force a second round-trip. Use whichever source
  // returns more readings to get the most complete picture.
  const [restReadings, rates, standingCharges, dispatchResult, telemetryResult] =
    await Promise.all([
      getConsumption(creds, periodFrom, periodTo, isToday),
      getTariffRates(creds, periodFrom, periodTo),
      getStandingCharges(creds, periodFrom, periodTo),
      dispatchesPromise,
      isRecent
        ? getTodayTelemetry(creds, periodFrom, periodTo)
        : Promise.resolve({ readings: [], error: null as string | null }),
    ]);

  // For recent days, prefer whichever source returned more readings.
  const readings =
    isRecent && telemetryResult.readings.length > restReadings.length
      ? telemetryResult.readings
      : restReadings;
  const dispatches = dispatchResult.dispatches;
  const chargingSessions = dispatchResult.chargingSessions;

  // Probe each rate at an instant we know falls inside its window:
  //   - ukDayStart(date)       = midnight UK → inside the 23:30-05:30 off-peak
  //   - ukDayStart(date) + 12h = noon UK     → inside the peak window
  // Works across BST and GMT with no special-casing, and for a day/night
  // tariff (flat rates) the probe instant simply doesn't matter.
  const offPeakLookupAt = periodFrom; // midnight UK local
  const peakLookupAt = new Date(periodFrom.getTime() + 12 * HOUR_MS); // noon UK local
  const standingChargeAt = buildRateLookup(standingCharges);
  const offPeakRate =
    creds.offPeakRateOverride ?? rates.offPeakAt(offPeakLookupAt) ?? FALLBACK_OFF_PEAK_PENCE;
  const peakRate =
    creds.peakRateOverride ?? rates.peakAt(peakLookupAt) ?? FALLBACK_PEAK_PENCE;
  const standingChargePence =
    creds.standingChargeOverride ?? standingChargeAt(periodFrom) ?? 0;

  const slots = classifySlots({
    readings,
    dispatches,
    rateAt: creds.peakRateOverride != null
      ? () => creds.peakRateOverride!
      : rates.peakAt,
    offPeakRate,
    peakRate,
  });

  const t = totals(slots);

  // Savings vs all-peak: what would you have paid if every kWh was charged at
  // the peak rate? (Standing charge is unavoidable so we exclude it.)
  const allPeakCost = t.totalKwh * peakRate;
  const savingsVsAllPeakPence = Math.max(0, allPeakCost - t.totalCostPence);

  const offPeakPercentage =
    t.totalKwh > 0
      ? Math.round(((t.offPeakKwh + t.dispatchKwh) / t.totalKwh) * 100)
      : 0;

  // Compute EV charger-reported kWh for this day (from Ohme via SmartFlex).
  const evChargingKwh = evKwhForDay(chargingSessions, periodFrom, periodTo);

  return {
    date,
    slots,
    totalCostPence: t.totalCostPence + standingChargePence,
    standingChargePence,
    totalKwh: t.totalKwh,
    offPeakKwh: t.offPeakKwh,
    peakKwh: t.peakKwh,
    dispatchKwh: t.dispatchKwh,
    evChargingKwh,
    offPeakPercentage,
    savingsVsAllPeakPence,
    peakRatePence: peakRate,
    offPeakRatePence: offPeakRate,
  };
}
