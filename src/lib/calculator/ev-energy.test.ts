import { describe, expect, it } from "vitest";
import { evKwhForDay } from "./ev-energy";

const DAY_START = new Date("2026-01-15T00:00:00Z");
const DAY_END = new Date("2026-01-16T00:00:00Z");

describe("evKwhForDay", () => {
  it("returns null when there are no sessions at all", () => {
    expect(evKwhForDay([], DAY_START, DAY_END)).toBeNull();
  });

  it("returns null when no session overlaps the day", () => {
    const sessions = [
      {
        start: new Date("2026-01-20T01:00:00Z"),
        end: new Date("2026-01-20T03:00:00Z"),
        energyAddedKwh: 12,
      },
    ];
    expect(evKwhForDay(sessions, DAY_START, DAY_END)).toBeNull();
  });

  it("counts a session wholly inside the day in full", () => {
    const sessions = [
      {
        start: new Date("2026-01-15T01:00:00Z"),
        end: new Date("2026-01-15T05:00:00Z"),
        energyAddedKwh: 22.5,
      },
    ];
    expect(evKwhForDay(sessions, DAY_START, DAY_END)).toBe(22.5);
  });

  it("splits a session spanning midnight in proportion to overlap", () => {
    // 22:00 -> 02:00 is four hours, of which two fall in the day.
    const sessions = [
      {
        start: new Date("2026-01-14T22:00:00Z"),
        end: new Date("2026-01-15T02:00:00Z"),
        energyAddedKwh: 10,
      },
    ];
    expect(evKwhForDay(sessions, DAY_START, DAY_END)).toBe(5);
  });

  it("sums several sessions and rounds to two decimals", () => {
    const sessions = [
      {
        start: new Date("2026-01-15T01:00:00Z"),
        end: new Date("2026-01-15T02:00:00Z"),
        energyAddedKwh: 3.333,
      },
      {
        start: new Date("2026-01-15T03:00:00Z"),
        end: new Date("2026-01-15T04:00:00Z"),
        energyAddedKwh: 3.333,
      },
    ];
    expect(evKwhForDay(sessions, DAY_START, DAY_END)).toBe(6.67);
  });

  it("ignores a zero-length session rather than dividing by zero", () => {
    const sessions = [
      {
        start: new Date("2026-01-15T01:00:00Z"),
        end: new Date("2026-01-15T01:00:00Z"),
        energyAddedKwh: 5,
      },
    ];
    expect(evKwhForDay(sessions, DAY_START, DAY_END)).toBeNull();
  });
});
