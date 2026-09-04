import { describe, expect, it } from "vitest";
import {
  addUkDays,
  isOffPeakWindow,
  todayUkDate,
  ukDayEnd,
  ukDayStart,
  ukLocalHHmm,
  ukLocalLongDate,
  ukSlotIndex,
} from "./timezone";

// The UK switches to BST on the last Sunday in March and back on the last
// Sunday in October. In 2026 that's 29 March and 25 October. Every assertion
// below is anchored to those dates, because getting them wrong silently
// misprices a day's worth of half-hourly slots.

describe("ukDayStart / ukDayEnd", () => {
  it("treats a GMT winter day as starting at midnight UTC", () => {
    expect(ukDayStart("2026-01-15").toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(ukDayEnd("2026-01-15").toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("shifts a BST summer day back an hour", () => {
    expect(ukDayStart("2026-06-15").toISOString()).toBe("2026-06-14T23:00:00.000Z");
    expect(ukDayEnd("2026-06-15").toISOString()).toBe("2026-06-15T23:00:00.000Z");
  });

  it("gives the spring-forward day 23 hours", () => {
    const start = ukDayStart("2026-03-29");
    const end = ukDayEnd("2026-03-29");
    expect(start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it("gives the autumn fall-back day 25 hours", () => {
    const start = ukDayStart("2026-10-25");
    const end = ukDayEnd("2026-10-25");
    expect(start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });
});

describe("addUkDays", () => {
  it("steps across a DST boundary without drifting", () => {
    expect(addUkDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addUkDays("2026-10-24", 1)).toBe("2026-10-25");
  });

  it("handles month, year and leap-year rollovers", () => {
    expect(addUkDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addUkDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addUkDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addUkDays("2026-01-01", -29)).toBe("2025-12-03");
  });
});

describe("todayUkDate", () => {
  it("uses the UK calendar day, not the UTC one", () => {
    // 23:30 UTC in June is 00:30 the next day in London.
    expect(todayUkDate(new Date("2026-06-14T23:30:00Z"))).toBe("2026-06-15");
    // The same clock time in January is still the same UTC day.
    expect(todayUkDate(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-14");
  });
});

describe("isOffPeakWindow", () => {
  it("covers 23:30 to 05:30 UK local in winter", () => {
    expect(isOffPeakWindow(new Date("2026-01-15T23:29:00Z"))).toBe(false);
    expect(isOffPeakWindow(new Date("2026-01-15T23:30:00Z"))).toBe(true);
    expect(isOffPeakWindow(new Date("2026-01-15T05:29:00Z"))).toBe(true);
    expect(isOffPeakWindow(new Date("2026-01-15T05:30:00Z"))).toBe(false);
    expect(isOffPeakWindow(new Date("2026-01-15T12:00:00Z"))).toBe(false);
  });

  it("tracks the same local window in summer, an hour off UTC", () => {
    expect(isOffPeakWindow(new Date("2026-06-15T22:30:00Z"))).toBe(true); // 23:30 BST
    expect(isOffPeakWindow(new Date("2026-06-15T22:29:00Z"))).toBe(false); // 23:29 BST
    expect(isOffPeakWindow(new Date("2026-06-15T04:29:00Z"))).toBe(true); // 05:29 BST
    expect(isOffPeakWindow(new Date("2026-06-15T04:30:00Z"))).toBe(false); // 05:30 BST
  });
});

describe("UK formatting helpers", () => {
  it("formats times and dates in UK local, not the server's zone", () => {
    expect(ukLocalHHmm(new Date("2026-06-15T22:30:00Z"))).toBe("23:30");
    expect(ukLocalHHmm(new Date("2026-01-15T22:30:00Z"))).toBe("22:30");
    expect(ukLocalLongDate(new Date("2026-06-15T22:30:00Z"))).toBe("15 June 2026");
    // 23:30 UTC on 30 June is already 1 July in London.
    expect(ukLocalLongDate(new Date("2026-06-30T23:30:00Z"))).toBe("1 July 2026");
  });
});

describe("ukSlotIndex", () => {
  it("maps UK local half-hours onto 0-47", () => {
    expect(ukSlotIndex(new Date("2026-01-15T00:00:00Z"))).toBe(0);
    expect(ukSlotIndex(new Date("2026-01-15T00:29:59Z"))).toBe(0);
    expect(ukSlotIndex(new Date("2026-01-15T00:30:00Z"))).toBe(1);
    expect(ukSlotIndex(new Date("2026-01-15T12:00:00Z"))).toBe(24);
    expect(ukSlotIndex(new Date("2026-01-15T23:30:00Z"))).toBe(47);
  });

  it("follows UK local time through BST, not UTC", () => {
    // 00:00 UTC in June is 01:00 BST -> slot 2, not slot 0.
    expect(ukSlotIndex(new Date("2026-06-15T00:00:00Z"))).toBe(2);
    expect(ukSlotIndex(new Date("2026-06-15T22:30:00Z"))).toBe(47); // 23:30 BST
    expect(ukSlotIndex(new Date("2026-06-15T23:00:00Z"))).toBe(0); // 00:00 BST next day
  });
});
