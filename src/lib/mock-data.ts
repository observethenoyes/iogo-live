// ── Types ──

export type TimeRange = "live" | "daily" | "weekly" | "monthly" | "yearly";

export interface CostSlot {
  intervalStart: string;
  intervalEnd: string;
  localStart: string;
  localEnd: string;
  consumptionKwh: number;
  classification: "off-peak" | "peak" | "dispatch";
  rateApplied: number;
  cost: number;
  dispatchId?: string;
  dispatchSource?: "planned" | "completed";
}

export interface DailySummary {
  date: string;
  slots: CostSlot[];
  totalCostPence: number;
  standingChargePence: number;
  totalKwh: number;
  offPeakKwh: number;
  peakKwh: number;
  dispatchKwh: number;
  /** EV charger-reported kWh (from Ohme/SmartFlex). Null if unavailable. */
  evChargingKwh: number | null;
  offPeakPercentage: number;
  savingsVsAllPeakPence: number;
  /** Peak unit rate in p/kWh inc VAT, as charged on this day. */
  peakRatePence: number;
  /** Off-peak unit rate in p/kWh inc VAT, as charged on this day. */
  offPeakRatePence: number;
}

export interface DispatchEvent {
  id: string;
  start: string;
  end: string;
  durationMinutes: number;
  estimatedKwh: number;
  status?: "planned" | "completed";
}

export interface RangeSummary {
  range: TimeRange;
  label: string;
  totalCostPence: number;
  avgDailyCostPence: number;
  totalKwh: number;
  avgDailyKwh: number;
  offPeakPercentage: number;
  totalSavingsPence: number;
  standingChargePence: number;
  days: DailySummaryCompact[];
  dispatches: DispatchEvent[];
}

export interface DailySummaryCompact {
  date: string;
  label: string;
  totalCostPence: number;
  totalKwh: number;
  offPeakKwh: number;
  peakKwh: number;
  dispatchKwh: number;
  evChargingKwh: number | null;
  offPeakPercentage: number;
  savingsPence: number;
}

export interface MonthlySummaryCompact {
  month: string;
  label: string;
  totalCostPence: number;
  totalKwh: number;
  offPeakPercentage: number;
  avgDailyCostPence: number;
  savingsPence: number;
  daysInMonth: number;
}

export interface YearlySummary {
  range: "yearly";
  label: string;
  totalCostPence: number;
  avgMonthlyCostPence: number;
  totalKwh: number;
  avgMonthlyKwh: number;
  offPeakPercentage: number;
  totalSavingsPence: number;
  months: MonthlySummaryCompact[];
}

export const mockRates = {
  offPeakPencePerKwh: 7.5,
  peakPencePerKwh: 24.5,
  standingChargePence: 46.36,
};

// ── Seeded random for deterministic mock data ──

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Daily slot generator ──

function generateSlots(dateSeed: number, includeDispatches: boolean): CostSlot[] {
  const rand = seededRandom(dateSeed);
  const slots: CostSlot[] = [];
  const offPeakRate = mockRates.offPeakPencePerKwh;
  const peakRate = mockRates.peakPencePerKwh;

  for (let i = 0; i < 48; i++) {
    const hour = Math.floor(i / 2);
    const minute = (i % 2) * 30;
    const startTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const endHour = minute === 30 ? hour + 1 : hour;
    const endMinute = minute === 30 ? 0 : 30;
    const endTime = `${String(endHour % 24).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;

    const isOffPeak =
      (hour === 23 && minute === 30) ||
      hour < 5 ||
      (hour === 5 && minute === 0);

    const isDispatch =
      includeDispatches &&
      ((hour === 1) ||
        (hour === 2 && minute === 0) ||
        (hour === 3 && minute === 0) ||
        (hour === 3 && minute === 30));

    let classification: CostSlot["classification"];
    if (isDispatch) {
      classification = "dispatch";
    } else if (isOffPeak) {
      classification = "off-peak";
    } else {
      classification = "peak";
    }

    const rate = classification === "peak" ? peakRate : offPeakRate;

    let kwh: number;
    if (hour >= 0 && hour < 6) {
      kwh = isDispatch ? 1.8 + rand() * 1.2 : 0.1 + rand() * 0.15;
    } else if (hour >= 6 && hour < 9) {
      kwh = 0.3 + rand() * 0.4;
    } else if (hour >= 9 && hour < 16) {
      kwh = 0.15 + rand() * 0.2;
    } else if (hour >= 16 && hour < 21) {
      kwh = 0.5 + rand() * 0.8;
    } else {
      kwh = 0.2 + rand() * 0.3;
    }

    kwh = Math.round(kwh * 100) / 100;
    const cost = Math.round(kwh * rate * 100) / 100;

    slots.push({
      intervalStart: `2026-04-11T${startTime}:00Z`,
      intervalEnd: `2026-04-11T${endTime}:00Z`,
      localStart: startTime,
      localEnd: endTime,
      consumptionKwh: kwh,
      classification,
      rateApplied: rate,
      cost,
      ...(isDispatch && { dispatchId: hour < 3 ? "dispatch-1" : "dispatch-2" }),
    });
  }

  return slots;
}

function buildDailySummary(date: string, slots: CostSlot[]): DailySummary {
  const standingChargePence = mockRates.standingChargePence;
  const peakRate = mockRates.peakPencePerKwh;

  const totalKwh = slots.reduce((sum, s) => sum + s.consumptionKwh, 0);
  const offPeakKwh = slots
    .filter((s) => s.classification === "off-peak")
    .reduce((sum, s) => sum + s.consumptionKwh, 0);
  const peakKwh = slots
    .filter((s) => s.classification === "peak")
    .reduce((sum, s) => sum + s.consumptionKwh, 0);
  const dispatchKwh = slots
    .filter((s) => s.classification === "dispatch")
    .reduce((sum, s) => sum + s.consumptionKwh, 0);
  const totalSlotCost = slots.reduce((sum, s) => sum + s.cost, 0);
  const totalCostPence = totalSlotCost + standingChargePence;
  const allPeakCost = totalKwh * peakRate + standingChargePence;

  return {
    date,
    slots,
    totalCostPence: Math.round(totalCostPence * 100) / 100,
    standingChargePence,
    totalKwh: Math.round(totalKwh * 100) / 100,
    offPeakKwh: Math.round(offPeakKwh * 100) / 100,
    peakKwh: Math.round(peakKwh * 100) / 100,
    dispatchKwh: Math.round(dispatchKwh * 100) / 100,
    offPeakPercentage:
      totalKwh > 0
        ? Math.round(((offPeakKwh + dispatchKwh) / totalKwh) * 100)
        : 0,
    evChargingKwh: null,
    savingsVsAllPeakPence: Math.round((allPeakCost - totalCostPence) * 100) / 100,
    peakRatePence: mockRates.peakPencePerKwh,
    offPeakRatePence: mockRates.offPeakPencePerKwh,
  };
}

function dailyToCompact(ds: DailySummary, label: string): DailySummaryCompact {
  return {
    date: ds.date,
    label,
    totalCostPence: ds.totalCostPence,
    totalKwh: ds.totalKwh,
    offPeakKwh: ds.offPeakKwh,
    peakKwh: ds.peakKwh,
    dispatchKwh: ds.dispatchKwh,
    evChargingKwh: ds.evChargingKwh,
    offPeakPercentage: ds.offPeakPercentage,
    savingsPence: ds.savingsVsAllPeakPence,
  };
}

// ── Date helpers ──

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Return the YYYY-MM-DD of the Monday of the (UK) calendar week containing
 * `dateStr`. JS `getUTCDay()` returns 0 for Sunday, 1 for Monday … 6 for
 * Saturday — for an ISO week (Mon-first) we offset Sunday to 6 and shift
 * back by `(day-1)`.
 */
function mondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().split("T")[0];
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function formatDayOfMonth(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ── Mock data for each range ──

// Single day — the "daily" view
const todayDate = "2026-04-11";
const todaySlots = generateSlots(20260411, true);
export const mockDailySummary: DailySummary = buildDailySummary(todayDate, todaySlots);

export const mockDispatches: DispatchEvent[] = [
  {
    id: "dispatch-1",
    start: "01:00",
    end: "02:30",
    durationMinutes: 90,
    estimatedKwh: 5.8,
  },
  {
    id: "dispatch-2",
    start: "03:00",
    end: "04:00",
    durationMinutes: 60,
    estimatedKwh: 3.9,
  },
];

// "Live" view — same as daily but we mark how far through the day we are
export function generateLiveSummary(): DailySummary & { liveSlotIndex: number } {
  // Simulate being at 2:30 PM (slot index 29)
  const liveSlotIndex = 29;
  const liveSlots = todaySlots.map((slot, i) => ({
    ...slot,
    // Future slots have zero consumption
    consumptionKwh: i > liveSlotIndex ? 0 : slot.consumptionKwh,
    cost: i > liveSlotIndex ? 0 : slot.cost,
  }));
  return {
    ...buildDailySummary(todayDate, liveSlots),
    liveSlotIndex,
  };
}

/**
 * Weekly — Mon-Sun calendar week containing `referenceDate` (defaults to
 * today). UK weeks start on Monday, so we anchor the chart on the Monday of
 * the relevant week regardless of which day the user happens to load it.
 */
export function generateWeeklySummary(referenceDate: string = todayDate): RangeSummary {
  const monday = mondayOfWeek(referenceDate);
  const days: DailySummaryCompact[] = [];
  const allDispatches: DispatchEvent[] = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const seed = parseInt(date.replace(/-/g, ""), 10);
    const hasDispatches = i % 2 === 0; // dispatches every other day
    const slots = generateSlots(seed, hasDispatches);
    const ds = buildDailySummary(date, slots);
    days.push(dailyToCompact(ds, formatDayLabel(date)));

    if (hasDispatches) {
      allDispatches.push({
        id: `dispatch-${date}-1`,
        start: "01:00",
        end: "02:30",
        durationMinutes: 90,
        estimatedKwh: 4.5 + (seed % 30) / 10,
      });
    }
  }

  const totalCost = days.reduce((s, d) => s + d.totalCostPence, 0);
  const totalKwh = days.reduce((s, d) => s + d.totalKwh, 0);
  const totalOffPeak = days.reduce((s, d) => s + d.offPeakKwh + d.dispatchKwh, 0);
  const totalSavings = days.reduce((s, d) => s + d.savingsPence, 0);

  return {
    range: "weekly",
    label: `${formatDayLabel(monday)} – ${formatDayLabel(addDays(monday, 6))}`,
    totalCostPence: Math.round(totalCost),
    avgDailyCostPence: Math.round(totalCost / 7),
    totalKwh: Math.round(totalKwh * 10) / 10,
    avgDailyKwh: Math.round((totalKwh / 7) * 10) / 10,
    offPeakPercentage: totalKwh > 0 ? Math.round((totalOffPeak / totalKwh) * 100) : 0,
    totalSavingsPence: Math.round(totalSavings),
    standingChargePence: Math.round(mockRates.standingChargePence * 7),
    days,
    dispatches: allDispatches,
  };
}

// Monthly — 30 days ending today
export function generateMonthlySummary(): RangeSummary {
  const numDays = 30;
  const days: DailySummaryCompact[] = [];
  const allDispatches: DispatchEvent[] = [];

  for (let i = numDays - 1; i >= 0; i--) {
    const date = addDays(todayDate, -i);
    const seed = parseInt(date.replace(/-/g, ""), 10);
    const hasDispatches = seed % 3 !== 0;
    const slots = generateSlots(seed, hasDispatches);
    const ds = buildDailySummary(date, slots);
    days.push(dailyToCompact(ds, formatDayOfMonth(date)));

    if (hasDispatches && i < 7) {
      allDispatches.push({
        id: `dispatch-${date}-1`,
        start: "01:00",
        end: "03:00",
        durationMinutes: 120,
        estimatedKwh: 5.0 + (seed % 40) / 10,
      });
    }
  }

  const totalCost = days.reduce((s, d) => s + d.totalCostPence, 0);
  const totalKwh = days.reduce((s, d) => s + d.totalKwh, 0);
  const totalOffPeak = days.reduce((s, d) => s + d.offPeakKwh + d.dispatchKwh, 0);
  const totalSavings = days.reduce((s, d) => s + d.savingsPence, 0);

  return {
    range: "monthly",
    label: "March – April 2026",
    totalCostPence: Math.round(totalCost),
    avgDailyCostPence: Math.round(totalCost / numDays),
    totalKwh: Math.round(totalKwh * 10) / 10,
    avgDailyKwh: Math.round((totalKwh / numDays) * 10) / 10,
    offPeakPercentage: totalKwh > 0 ? Math.round((totalOffPeak / totalKwh) * 100) : 0,
    totalSavingsPence: Math.round(totalSavings),
    standingChargePence: Math.round(mockRates.standingChargePence * numDays),
    days,
    dispatches: allDispatches,
  };
}

// Yearly — 12 months
export function generateYearlySummary(): YearlySummary {
  const months: MonthlySummaryCompact[] = [];

  for (let m = 0; m < 12; m++) {
    const daysCount = DAYS_IN_MONTH[m];
    const seed = 20260000 + (m + 1) * 100;
    const rand = seededRandom(seed);

    // Seasonal variation: more usage in winter, less in summer
    const seasonalFactor = m >= 4 && m <= 8 ? 0.7 : m >= 10 || m <= 1 ? 1.3 : 1.0;
    const baseKwh = (10 + rand() * 6) * seasonalFactor;
    const totalKwh = Math.round(baseKwh * daysCount * 10) / 10;
    const offPeakPct = 55 + Math.round(rand() * 25);
    const offPeakKwh = totalKwh * (offPeakPct / 100);
    const peakKwh = totalKwh - offPeakKwh;

    const totalCost =
      offPeakKwh * mockRates.offPeakPencePerKwh +
      peakKwh * mockRates.peakPencePerKwh +
      mockRates.standingChargePence * daysCount;

    const allPeakCost =
      totalKwh * mockRates.peakPencePerKwh +
      mockRates.standingChargePence * daysCount;

    months.push({
      month: `2026-${String(m + 1).padStart(2, "0")}`,
      label: MONTH_NAMES[m],
      totalCostPence: Math.round(totalCost),
      totalKwh,
      offPeakPercentage: offPeakPct,
      avgDailyCostPence: Math.round(totalCost / daysCount),
      savingsPence: Math.round(allPeakCost - totalCost),
      daysInMonth: daysCount,
    });
  }

  const totalCost = months.reduce((s, m) => s + m.totalCostPence, 0);
  const totalKwh = months.reduce((s, m) => s + m.totalKwh, 0);
  const totalSavings = months.reduce((s, m) => s + m.savingsPence, 0);
  const weightedOffPeak =
    months.reduce((s, m) => s + m.offPeakPercentage * m.totalKwh, 0) / totalKwh;

  return {
    range: "yearly",
    label: "2026",
    totalCostPence: Math.round(totalCost),
    avgMonthlyCostPence: Math.round(totalCost / 12),
    totalKwh: Math.round(totalKwh * 10) / 10,
    avgMonthlyKwh: Math.round((totalKwh / 12) * 10) / 10,
    offPeakPercentage: Math.round(weightedOffPeak),
    totalSavingsPence: Math.round(totalSavings),
    months,
  };
}

// Legacy exports for backward compat
export const mockSummary = mockDailySummary;
