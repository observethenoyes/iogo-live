// Shared shapes for the summaries the calculators produce and the dashboard
// renders. These used to live in `mock-data.ts` alongside a set of fixture
// generators; the generators were dead code and are gone, but every component
// still imports the types, so they moved here under an honest name.

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
