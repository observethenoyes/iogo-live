import type { ChargingSessionInfo } from "@/lib/octopus/graphql-client";

/**
 * Compute charger-reported EV kWh that falls within a single day.
 * Sessions spanning midnight are proportionally split by duration overlap.
 *
 * Returns `null` when no session touches the day at all, which the UI reads as
 * "no EV data" rather than "zero kWh".
 */
export function evKwhForDay(
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
