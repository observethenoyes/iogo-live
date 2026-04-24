import "server-only";
import type {
  DailySummaryCompact,
  MonthlySummaryCompact,
  RangeSummary,
  YearlySummary,
  DispatchEvent,
} from "@/lib/mock-data";
import type { OctopusCredentials } from "@/lib/octopus/types";
import {
  getConsumption,
  getStandardUnitRates,
  getStandingCharges,
  rateAt as rateAtRates,
} from "@/lib/octopus/rest-client";
import {
  getDispatches,
  getTodayTelemetry,
  type ChargingSessionInfo,
} from "@/lib/octopus/graphql-client";
import { classifySlots, type DispatchInterval } from "./classify-slots";
import { ukDayStart, ukDayEnd, addUkDays, ukLocalDayLabel, toUkLocal, todayUkDate } from "./timezone";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Compute charger-reported EV kWh that falls within a single day.
 * Sessions spanning midnight are proportionally split by duration overlap.
 */
function evKwhForDay(
  sessions: ChargingSessionInfo[],
  dayStart: Date,
  dayEnd: Date
): number | null {
  if (sessions.length === 0) return null;
  let total = 0;
  let hasAny = false;
  for (const s of sessions) {
    const sessStart = Math.max(s.start.getTime(), dayStart.getTime());
    const sessEnd = Math.min(s.end.getTime(), dayEnd.getTime());
    if (sessEnd <= sessStart) continue;
    const overlapMs = sessEnd - sessStart;
    const totalMs = s.end.getTime() - s.start.getTime();
    if (totalMs <= 0) continue;
    total += s.energyAddedKwh * (overlapMs / totalMs);
    hasAny = true;
  }
  return hasAny ? Math.round(total * 100) / 100 : null;
}

// ── Fallback rates (same as calculate-daily.ts) ──

const FALLBACK_OFF_PEAK_PENCE = 7.5;
const FALLBACK_PEAK_PENCE = 27;

// ── Helpers ──

/** Monday of the ISO week containing `date`. */
function mondayOfWeek(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().split("T")[0];
}

/** Format a YYYY-MM-DD as a short label. `format` controls verbosity:
 *  - "short" → "Mon 13"  (for weekly: 7 ticks, plenty of space)
 *  - "medium" → "13 Apr" (for monthly: shows month to avoid ambiguity)
 */
function shortDayLabel(date: string, format: "short" | "medium" = "short"): string {
  const full = ukLocalDayLabel(ukDayStart(date)); // "Mon, 13 Apr 2026"
  const parts = full.split(" "); // ["Mon,", "13", "Apr", "2026"]
  if (format === "medium") return `${parts[1]} ${parts[2]}`; // "13 Apr"
  return `${parts[0].replace(",", "")} ${parts[1]}`; // "Mon 13"
}

/** Format a YYYY-MM-DD as a label like "Mon, 14 Apr 2026". */
function fullDayLabel(date: string): string {
  return ukLocalDayLabel(ukDayStart(date));
}

/** Group an array by a key fn. Preserves insertion order. */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(item);
  }
  return map;
}

// ── Core: build daily compacts from a date range ──

interface RangeOpts {
  /** Per-user Octopus credentials. */
  creds: OctopusCredentials;
  /** Inclusive start (YYYY-MM-DD UK local). */
  from: string;
  /** Inclusive end (YYYY-MM-DD UK local). */
  to: string;
  /** Day label format: "short" for weekly, "medium" for monthly. */
  labelFormat?: "short" | "medium";
}

/**
 * Fetch, classify, and aggregate all half-hourly slots across a UK-local date
 * range into per-day compact summaries.
 */
async function buildDayCompacts(
  opts: RangeOpts
): Promise<{
  days: DailySummaryCompact[];
  dispatches: DispatchEvent[];
  standingChargePencePerDay: number;
  peakRate: number;
  offPeakRate: number;
}> {
  const periodFrom = ukDayStart(opts.from);
  const periodTo = ukDayEnd(opts.to);

  // The REST consumption pipeline lags 24-48h, so recent days may have
  // incomplete data. If the range includes any day within the last 2 days,
  // also fetch telemetry for that portion and merge it in.
  const today = todayUkDate();
  const recentCutoff = addUkDays(today, -2);
  const rangeIncludesRecent = opts.to >= recentCutoff;
  const recentFrom = rangeIncludesRecent
    ? ukDayStart(opts.from > recentCutoff ? opts.from : recentCutoff)
    : periodFrom; // unused when !rangeIncludesRecent

  const { creds } = opts;
  const [readings, unitRates, standingCharges, dispatchResult, telemetryResult] =
    await Promise.all([
      getConsumption(creds, periodFrom, periodTo, false),
      getStandardUnitRates(creds),
      getStandingCharges(creds),
      getDispatches(creds, periodFrom, periodTo),
      rangeIncludesRecent
        ? getTodayTelemetry(creds, recentFrom, periodTo)
        : Promise.resolve({ readings: [], error: null as string | null }),
    ]);

  // For recent days, group both REST and telemetry readings by day and
  // prefer whichever source has more readings for each day.
  let mergedReadings = readings;
  if (rangeIncludesRecent && telemetryResult.readings.length > 0) {
    const restByDay = groupBy(readings, (r) => {
      const uk = toUkLocal(new Date(r.interval_start));
      return uk.yyyyMmDd;
    });
    const telByDay = groupBy(telemetryResult.readings, (r) => {
      const uk = toUkLocal(new Date(r.interval_start));
      return uk.yyyyMmDd;
    });
    // Replace REST readings with telemetry for any recent day where
    // telemetry has more readings (i.e. REST is still incomplete).
    const replaced = new Set<string>();
    for (const [day, telReadings] of telByDay) {
      const restReadings = restByDay.get(day) ?? [];
      if (telReadings.length > restReadings.length) {
        restByDay.set(day, telReadings);
        replaced.add(day);
      }
    }
    if (replaced.size > 0) {
      // Rebuild merged readings: non-recent days keep REST, recent days
      // use whichever source won per-day.
      mergedReadings = [];
      // Add all REST readings for days that weren't replaced.
      for (const r of readings) {
        const day = toUkLocal(new Date(r.interval_start)).yyyyMmDd;
        if (!replaced.has(day)) {
          mergedReadings.push(r);
        }
      }
      // Add the winning telemetry readings for replaced days.
      for (const day of replaced) {
        mergedReadings.push(...(restByDay.get(day) ?? []));
      }
      // Re-sort by interval_start to maintain chronological order.
      mergedReadings.sort(
        (a, b) =>
          new Date(a.interval_start).getTime() -
          new Date(b.interval_start).getTime()
      );
    }
  }

  const dispatchIntervals = dispatchResult.dispatches;
  const chargingSessions = dispatchResult.chargingSessions;

  // Resolve rates the same way as calculate-daily.ts, respecting user overrides.
  const offPeakLookupAt = periodFrom;
  const peakLookupAt = new Date(periodFrom.getTime() + 12 * HOUR_MS);
  const offPeakRate =
    creds.offPeakRateOverride ?? rateAtRates(unitRates, offPeakLookupAt) ?? FALLBACK_OFF_PEAK_PENCE;
  const peakRate =
    creds.peakRateOverride ?? rateAtRates(unitRates, peakLookupAt) ?? FALLBACK_PEAK_PENCE;
  const standingChargePencePerDay =
    creds.standingChargeOverride ?? rateAtRates(standingCharges, periodFrom) ?? 0;

  // Classify every reading.
  const allSlots = classifySlots({
    readings: mergedReadings,
    dispatches: dispatchIntervals,
    rateAt: creds.peakRateOverride != null
      ? () => creds.peakRateOverride!
      : (at) => rateAtRates(unitRates, at),
    offPeakRate,
    peakRate,
  });

  // Group slots by UK-local day.
  const byDay = groupBy(allSlots, (s) => {
    const uk = toUkLocal(new Date(s.intervalStart));
    return uk.yyyyMmDd;
  });

  // Build an ordered list of day compacts for every calendar day in the range,
  // even those with no readings (e.g. future days in the current week).
  const days: DailySummaryCompact[] = [];
  const allDispatchEvents: DispatchEvent[] = [];
  let cursor = opts.from;
  while (cursor <= opts.to) {
    const slots = byDay.get(cursor) ?? [];
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
    const offPeakPercentage =
      totalKwh > 0
        ? Math.round(((offPeakKwh + dispatchKwh) / totalKwh) * 100)
        : 0;
    const allPeakCost = totalKwh * peakRate;
    const savingsPence = Math.max(0, allPeakCost - totalCostPence);

    const cursorDayStart = ukDayStart(cursor);
    const cursorDayEnd = ukDayEnd(cursor);

    days.push({
      date: cursor,
      label: shortDayLabel(cursor, opts.labelFormat ?? "short"),
      totalCostPence: totalCostPence + standingChargePencePerDay,
      totalKwh,
      offPeakKwh,
      peakKwh,
      dispatchKwh,
      evChargingKwh: evKwhForDay(chargingSessions, cursorDayStart, cursorDayEnd),
      offPeakPercentage,
      savingsPence,
    });

    // Collapse dispatch-classified slot runs into timeline events for this day.
    if (dispatchKwh > 0) {
      let i = 0;
      while (i < slots.length) {
        if (slots[i].classification !== "dispatch") {
          i++;
          continue;
        }
        const startSlot = slots[i];
        let endSlot = slots[i];
        let kwh = 0;
        while (i < slots.length && slots[i].classification === "dispatch") {
          kwh += slots[i].consumptionKwh;
          endSlot = slots[i];
          i++;
        }
        allDispatchEvents.push({
          id: `dispatch-${startSlot.intervalStart}`,
          start: startSlot.localStart,
          end: endSlot.localEnd,
          durationMinutes: Math.round(
            (new Date(endSlot.intervalEnd).getTime() -
              new Date(startSlot.intervalStart).getTime()) /
              60000
          ),
          estimatedKwh: Math.round(kwh * 10) / 10,
        });
      }
    }

    cursor = addUkDays(cursor, 1);
  }

  return {
    days,
    dispatches: allDispatchEvents,
    standingChargePencePerDay,
    peakRate,
    offPeakRate,
  };
}

function aggregateRangeSummary(
  rangeName: "weekly" | "monthly",
  label: string,
  days: DailySummaryCompact[],
  dispatches: DispatchEvent[],
  standingChargePencePerDay: number
): RangeSummary {
  const numDays = days.length;
  const totalCost = days.reduce((s, d) => s + d.totalCostPence, 0);
  const totalKwh = days.reduce((s, d) => s + d.totalKwh, 0);
  const totalOffPeak = days.reduce(
    (s, d) => s + d.offPeakKwh + d.dispatchKwh,
    0
  );
  const totalSavings = days.reduce((s, d) => s + d.savingsPence, 0);

  return {
    range: rangeName,
    label,
    totalCostPence: Math.round(totalCost),
    avgDailyCostPence: numDays > 0 ? Math.round(totalCost / numDays) : 0,
    totalKwh: Math.round(totalKwh * 10) / 10,
    avgDailyKwh:
      numDays > 0 ? Math.round((totalKwh / numDays) * 10) / 10 : 0,
    offPeakPercentage:
      totalKwh > 0 ? Math.round((totalOffPeak / totalKwh) * 100) : 0,
    totalSavingsPence: Math.round(totalSavings),
    standingChargePence: Math.round(standingChargePencePerDay * numDays),
    days,
    dispatches,
  };
}

// ── Public builders ──

export async function buildWeeklySummary(opts: {
  creds: OctopusCredentials;
  date: string;
}): Promise<RangeSummary> {
  const monday = mondayOfWeek(opts.date);
  const sunday = addUkDays(monday, 6);
  const { days, dispatches, standingChargePencePerDay } =
    await buildDayCompacts({ creds: opts.creds, from: monday, to: sunday });
  const label = `${fullDayLabel(monday)} – ${fullDayLabel(sunday)}`;
  return aggregateRangeSummary(
    "weekly",
    label,
    days,
    dispatches,
    standingChargePencePerDay
  );
}

export async function buildMonthlySummary(opts: {
  creds: OctopusCredentials;
  date: string;
}): Promise<RangeSummary> {
  const to = opts.date;
  const from = addUkDays(to, -29); // 30 days inclusive
  const { days, dispatches, standingChargePencePerDay } =
    await buildDayCompacts({ creds: opts.creds, from, to, labelFormat: "medium" });
  const label = `${fullDayLabel(from)} – ${fullDayLabel(to)}`;
  return aggregateRangeSummary(
    "monthly",
    label,
    days,
    dispatches,
    standingChargePencePerDay
  );
}

export async function buildYearlySummary(opts: {
  creds: OctopusCredentials;
  date: string;
}): Promise<YearlySummary> {
  // Last 12 calendar months, ending with the current month.
  const [curYear, curMonth] = opts.date.split("-").map(Number);

  const months: MonthlySummaryCompact[] = [];
  let grandTotalCost = 0;
  let grandTotalKwh = 0;
  let grandTotalOffPeak = 0;
  let grandTotalSavings = 0;

  // We fetch the entire 12-month range in one go for efficiency.
  const startMonth = new Date(Date.UTC(curYear, curMonth - 12, 1));
  const endMonth = new Date(Date.UTC(curYear, curMonth, 0)); // last day of current month
  const fromStr = `${startMonth.getUTCFullYear()}-${String(startMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const toStr = `${endMonth.getUTCFullYear()}-${String(endMonth.getUTCMonth() + 1).padStart(2, "0")}-${String(endMonth.getUTCDate()).padStart(2, "0")}`;

  const { days } = await buildDayCompacts({
    creds: opts.creds,
    from: fromStr,
    to: toStr,
  });

  // Group day compacts by YYYY-MM.
  const byMonth = groupBy(days, (d) => d.date.slice(0, 7));

  // Walk months in order.
  for (let i = 0; i < 12; i++) {
    const md = new Date(Date.UTC(curYear, curMonth - 12 + i, 1));
    const key = `${md.getUTCFullYear()}-${String(md.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthDays = byMonth.get(key) ?? [];
    const daysInMonth = monthDays.length || 1;

    const totalCost = monthDays.reduce((s, d) => s + d.totalCostPence, 0);
    const totalKwh = monthDays.reduce((s, d) => s + d.totalKwh, 0);
    const totalOffPeak = monthDays.reduce(
      (s, d) => s + d.offPeakKwh + d.dispatchKwh,
      0
    );
    const totalSavings = monthDays.reduce((s, d) => s + d.savingsPence, 0);
    const offPeakPercentage =
      totalKwh > 0 ? Math.round((totalOffPeak / totalKwh) * 100) : 0;

    // Month label like "Apr"
    const monthLabel = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), 15))
      .toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

    months.push({
      month: key,
      label: monthLabel,
      totalCostPence: Math.round(totalCost),
      totalKwh: Math.round(totalKwh * 10) / 10,
      offPeakPercentage,
      avgDailyCostPence:
        monthDays.length > 0 ? Math.round(totalCost / daysInMonth) : 0,
      savingsPence: Math.round(totalSavings),
      daysInMonth: monthDays.length,
    });

    grandTotalCost += totalCost;
    grandTotalKwh += totalKwh;
    grandTotalOffPeak += totalOffPeak;
    grandTotalSavings += totalSavings;
  }

  const monthLabel = new Date(
    Date.UTC(curYear, curMonth - 1, 15)
  ).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const label = `${monthLabel} ${curYear - 1} – ${monthLabel} ${curYear}`;

  return {
    range: "yearly",
    label,
    totalCostPence: Math.round(grandTotalCost),
    avgMonthlyCostPence: Math.round(grandTotalCost / 12),
    totalKwh: Math.round(grandTotalKwh * 10) / 10,
    avgMonthlyKwh: Math.round((grandTotalKwh / 12) * 10) / 10,
    offPeakPercentage:
      grandTotalKwh > 0
        ? Math.round((grandTotalOffPeak / grandTotalKwh) * 100)
        : 0,
    totalSavingsPence: Math.round(grandTotalSavings),
    months,
  };
}
