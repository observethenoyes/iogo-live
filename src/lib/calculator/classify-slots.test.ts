import { describe, expect, it } from "vitest";
import { classifySlots, type DispatchInterval } from "./classify-slots";
import type { ConsumptionReading } from "@/lib/octopus/types";

function reading(startIso: string, kwh: number): ConsumptionReading {
  const start = new Date(startIso);
  return {
    consumption: kwh,
    interval_start: start.toISOString(),
    interval_end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  };
}

const OFF_PEAK = 7;
const PEAK = 30;

describe("classifySlots", () => {
  it("ranks dispatch above the off-peak window, and both above peak", () => {
    const readings = [
      reading("2026-01-15T00:00:00Z", 2), // inside 23:30-05:30
      reading("2026-01-15T12:00:00Z", 1), // ordinary peak
      reading("2026-01-15T13:00:00Z", 3), // peak clock time, but dispatched
    ];
    const dispatches: DispatchInterval[] = [
      {
        start: new Date("2026-01-15T13:00:00Z"),
        end: new Date("2026-01-15T13:30:00Z"),
        source: "completed",
      },
    ];

    const slots = classifySlots({
      readings,
      dispatches,
      rateAt: () => 25,
      offPeakRate: OFF_PEAK,
      peakRate: PEAK,
    });

    expect(slots.map((s) => s.classification)).toEqual([
      "off-peak",
      "peak",
      "dispatch",
    ]);
    expect(slots[2].dispatchSource).toBe("completed");
  });

  it("prices each slot with the rate its classification implies", () => {
    const slots = classifySlots({
      readings: [
        reading("2026-01-15T00:00:00Z", 2),
        reading("2026-01-15T12:00:00Z", 1),
      ],
      dispatches: [],
      rateAt: () => 25,
      offPeakRate: OFF_PEAK,
      peakRate: PEAK,
    });

    // Off-peak uses the flat off-peak rate; peak prefers the time-bucketed one.
    expect(slots[0].rateApplied).toBe(OFF_PEAK);
    expect(slots[0].cost).toBeCloseTo(14, 10);
    expect(slots[1].rateApplied).toBe(25);
    expect(slots[1].cost).toBeCloseTo(25, 10);
  });

  it("falls back to the peak rate when no bucketed rate covers the slot", () => {
    const slots = classifySlots({
      readings: [reading("2026-01-15T12:00:00Z", 2)],
      dispatches: [],
      rateAt: () => null,
      offPeakRate: OFF_PEAK,
      peakRate: PEAK,
    });
    expect(slots[0].rateApplied).toBe(PEAK);
    expect(slots[0].cost).toBeCloseTo(60, 10);
  });

  it("counts a dispatch that only partially overlaps the slot", () => {
    const slots = classifySlots({
      readings: [reading("2026-01-15T12:00:00Z", 1)],
      dispatches: [
        {
          start: new Date("2026-01-15T12:20:00Z"),
          end: new Date("2026-01-15T12:25:00Z"),
        },
      ],
      rateAt: () => 25,
      offPeakRate: OFF_PEAK,
      peakRate: PEAK,
    });
    expect(slots[0].classification).toBe("dispatch");
    expect(slots[0].rateApplied).toBe(OFF_PEAK);
  });

  it("does not treat a dispatch that merely abuts the slot as overlapping", () => {
    const slots = classifySlots({
      readings: [reading("2026-01-15T12:00:00Z", 1)],
      dispatches: [
        {
          start: new Date("2026-01-15T12:30:00Z"),
          end: new Date("2026-01-15T13:00:00Z"),
        },
      ],
      rateAt: () => 25,
      offPeakRate: OFF_PEAK,
      peakRate: PEAK,
    });
    expect(slots[0].classification).toBe("peak");
  });

  it("labels slots in UK local time, so BST is not off by an hour", () => {
    const slots = classifySlots({
      readings: [reading("2026-06-15T22:30:00Z", 1)],
      dispatches: [],
      rateAt: () => 25,
      offPeakRate: OFF_PEAK,
      peakRate: PEAK,
    });
    expect(slots[0].localStart).toBe("23:30");
    expect(slots[0].classification).toBe("off-peak");
  });
});
