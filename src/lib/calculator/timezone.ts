import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const UK_TZ = "Europe/London";

/**
 * Returns the UTC instant corresponding to the *start of the given UK local day*
 * (midnight 00:00 Europe/London). Handles BST/GMT automatically.
 *
 * Example: ukDayStart("2026-04-13") on a BST day → 2026-04-12T23:00:00.000Z
 */
export function ukDayStart(yyyyMmDd: string): Date {
  // fromZonedTime takes a wall-clock-in-zone string and returns the UTC Date.
  return fromZonedTime(`${yyyyMmDd}T00:00:00`, UK_TZ);
}

/** Same as ukDayStart but for end-of-day (start of the *next* UK day). */
export function ukDayEnd(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  // Add a day in JS UTC then re-anchor through the timezone to be DST-safe.
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return ukDayStart(`${yyyy}-${mm}-${dd}`);
}

/**
 * Add `n` whole days (positive or negative) to a YYYY-MM-DD UK local date and
 * return the resulting YYYY-MM-DD. Pure calendar arithmetic — DST-safe because
 * we never construct an intermediate clock time.
 */
export function addUkDays(yyyyMmDd: string, n: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** True if `a` (YYYY-MM-DD) is the same day as or after `b`. */
export function isSameOrAfterUkDay(a: string, b: string): boolean {
  return a >= b;
}

/** Today's UK local date as YYYY-MM-DD. */
export function todayUkDate(now: Date = new Date()): string {
  return formatInTimeZone(now, UK_TZ, "yyyy-MM-dd");
}

/** Format a UTC Date as "HH:mm" in UK local time. */
export function ukLocalHHmm(at: Date): string {
  return formatInTimeZone(at, UK_TZ, "HH:mm");
}

/** Format a UTC Date as a long human label like "Sat, 11 Apr 2026" in UK local. */
export function ukLocalDayLabel(at: Date): string {
  return formatInTimeZone(at, UK_TZ, "EEE, d MMM yyyy");
}

/** Convert a UTC Date to UK-local components for boundary checks. */
export function toUkLocal(at: Date) {
  const zoned = toZonedTime(at, UK_TZ);
  return {
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    weekday: zoned.getDay(),
    yyyyMmDd: formatInTimeZone(at, UK_TZ, "yyyy-MM-dd"),
  };
}

/**
 * Is the given UTC instant inside the IOG off-peak window (23:30–05:30 UK local)?
 * The window straddles midnight so we test the local hour/minute, not a date range.
 */
export function isOffPeakWindow(at: Date): boolean {
  const { hour, minute } = toUkLocal(at);
  const minutesIntoDay = hour * 60 + minute;
  // 23:30 = 1410, 05:30 = 330
  return minutesIntoDay >= 1410 || minutesIntoDay < 330;
}
