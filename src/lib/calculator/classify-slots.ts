import type { ConsumptionReading } from "@/lib/octopus/types";
import type { CostSlot } from "@/lib/mock-data";
import { isOffPeakWindow, ukLocalHHmm } from "./timezone";

export interface DispatchInterval {
  /** Inclusive UTC start. */
  start: Date;
  /** Exclusive UTC end. */
  end: Date;
  id?: string;
  /** Whether this dispatch was planned (scheduled) or completed (confirmed). */
  source?: "planned" | "completed";
}

interface ClassifyOpts {
  readings: ConsumptionReading[];
  dispatches: DispatchInterval[];
  /** Resolves the unit rate (p/kWh inc VAT) at a given UTC instant. */
  rateAt: (at: Date) => number | null;
  offPeakRate: number;
  peakRate: number;
}

/** True if [readingStart, readingEnd) overlaps [d.start, d.end). */
function overlapsDispatch(
  readingStart: Date,
  readingEnd: Date,
  dispatches: DispatchInterval[]
): DispatchInterval | undefined {
  const rs = readingStart.getTime();
  const re = readingEnd.getTime();
  for (const d of dispatches) {
    const ds = d.start.getTime();
    const de = d.end.getTime();
    if (rs < de && re > ds) return d;
  }
  return undefined;
}

/**
 * Turn a list of half-hourly consumption readings into priced + classified
 * slots. Classification priority (highest wins):
 *   1. dispatch — slot overlaps an IOG dispatch interval (charged at off-peak)
 *   2. off-peak — slot's local time falls inside the 23:30–05:30 window
 *   3. peak    — everything else
 *
 * Costs are returned in *pence* (not pounds). The Octopus API returns
 * value_inc_vat in pence/kWh already, so cost = kWh * rate.
 */
export function classifySlots(opts: ClassifyOpts): CostSlot[] {
  const { readings, dispatches, rateAt, offPeakRate, peakRate } = opts;
  return readings.map((r): CostSlot => {
    const start = new Date(r.interval_start);
    const end = new Date(r.interval_end);

    const dispatch = overlapsDispatch(start, end, dispatches);
    let classification: CostSlot["classification"];
    let rateApplied: number;

    if (dispatch) {
      classification = "dispatch";
      rateApplied = offPeakRate;
    } else if (isOffPeakWindow(start)) {
      classification = "off-peak";
      rateApplied = offPeakRate;
    } else {
      classification = "peak";
      // Prefer the time-bucketed rate from the API if available, otherwise
      // fall back to the "current" peak rate.
      rateApplied = rateAt(start) ?? peakRate;
    }

    return {
      intervalStart: r.interval_start,
      intervalEnd: r.interval_end,
      localStart: ukLocalHHmm(start),
      localEnd: ukLocalHHmm(end),
      consumptionKwh: r.consumption,
      classification,
      rateApplied,
      cost: r.consumption * rateApplied,
      ...(dispatch?.id ? { dispatchId: dispatch.id } : {}),
      ...(dispatch?.source ? { dispatchSource: dispatch.source } : {}),
    };
  });
}
