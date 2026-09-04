import "server-only";
import type {
  ConsumptionReading,
  ConsumptionResponse,
  OctopusCredentials,
  StandingCharge,
  StandingChargeResponse,
  UnitRate,
  UnitRateResponse,
} from "./types";

const BASE = "https://api.octopus.energy/v1";

// Cache lifetimes (seconds). Tariff rates change at most a few times a year
// so we cache them for a day. Consumption data for a *past* day is immutable
// and cached for a day; consumption for *today* is best-effort and cached
// for an hour.
const TARIFF_TTL = 60 * 60 * 24; // 24h
const PAST_CONSUMPTION_TTL = 60 * 60 * 24; // 24h
const TODAY_CONSUMPTION_TTL = 60 * 60; // 1h

class OctopusError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string
  ) {
    super(message);
    this.name = "OctopusError";
  }
}

function authHeader(creds: OctopusCredentials): string {
  // Basic auth: API key as username, empty password.
  const token = Buffer.from(`${creds.apiKey}:`).toString("base64");
  return `Basic ${token}`;
}

interface FetchOpts {
  revalidate: number;
  tags?: string[];
}

async function octopusFetch<T>(
  url: string,
  opts: FetchOpts,
  creds: OctopusCredentials
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(creds),
      Accept: "application/json",
    },
    next: {
      revalidate: opts.revalidate,
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OctopusError(
      `Octopus API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
      res.status,
      url
    );
  }

  return (await res.json()) as T;
}

// Walks paginated `next` URLs until exhausted.
async function fetchAllPages<TItem, TResp extends { next: string | null; results: TItem[] }>(
  firstUrl: string,
  opts: FetchOpts,
  creds: OctopusCredentials
): Promise<TItem[]> {
  const items: TItem[] = [];
  let url: string | null = firstUrl;
  // Safety cap — a single day is 48 slots, fits in one page; week ~336.
  let pages = 0;
  while (url && pages < 20) {
    const page: TResp = await octopusFetch<TResp>(url, opts, creds);
    items.push(...page.results);
    url = page.next;
    pages++;
  }
  return items;
}

/**
 * Fetch half-hourly consumption between `periodFrom` (inclusive) and `periodTo`
 * (exclusive). Both are JS Dates. The Octopus API expects ISO 8601 strings.
 *
 * `isToday` controls cache TTL — pass true when the range includes the current
 * UK day so we don't serve stale data while readings are still arriving.
 */
export async function getConsumption(
  creds: OctopusCredentials,
  periodFrom: Date,
  periodTo: Date,
  isToday: boolean
): Promise<ConsumptionReading[]> {
  const params = new URLSearchParams({
    period_from: periodFrom.toISOString(),
    period_to: periodTo.toISOString(),
    page_size: "2500",
    order_by: "period",
  });
  const url = `${BASE}/electricity-meter-points/${creds.mpan}/meters/${creds.meterSerial}/consumption/?${params}`;
  const all = await fetchAllPages<ConsumptionReading, ConsumptionResponse>(url, {
    revalidate: isToday ? TODAY_CONSUMPTION_TTL : PAST_CONSUMPTION_TTL,
    tags: ["octopus-consumption"],
  }, creds);

  // Octopus treats `period_to` as *inclusive* on the `interval_start` field —
  // querying for a 24h window reliably returns 49 slots, the last of which
  // starts exactly at `period_to` and therefore belongs to the *next* day.
  // Filter client-side so our callers see the 48 slots they asked for.
  const cutoff = periodTo.getTime();
  return all.filter((r) => new Date(r.interval_start).getTime() < cutoff);
}

// The rates endpoints publish time-of-use buckets — for IOG, two or three
// entries per day going back to the product's launch. Always ask for the
// window we actually need. An unfiltered query pulls the lot (~2000 entries,
// 20 sequential pages at page_size=100) and, worse, `fetchAllPages` caps at
// 20 pages: once a tariff crosses that, the *oldest* entries are silently
// dropped (results come back newest-first) and history quietly reprices at
// the FALLBACK_* rates.
const RATE_PAGE_SIZE = "1500";

/**
 * Build the query string for a rates request. Octopus returns every bucket
 * *overlapping* the window, including one that started before `period_from`,
 * so a midnight-UK lookup still finds the off-peak bucket that began at 23:30
 * the previous day. No margin needed.
 */
function rateParams(periodFrom?: Date, periodTo?: Date): URLSearchParams {
  const params = new URLSearchParams({ page_size: RATE_PAGE_SIZE });
  if (periodFrom) params.set("period_from", periodFrom.toISOString());
  if (periodTo) params.set("period_to", periodTo.toISOString());
  return params;
}

/**
 * Fetch standard unit rates (p/kWh inc VAT) covering [periodFrom, periodTo).
 *
 * Prefer `getTariffRates()` unless you specifically want this one endpoint:
 * the current IOG-* products return nothing here and publish flat day/night
 * rates instead, so calling this directly silently yields no rates for them.
 * For IOG these are daily time-of-use buckets: the cheap 23:30–05:30 window
 * and the expensive remainder of the day. Omit both bounds to fetch the
 * tariff's entire published history.
 */
export async function getStandardUnitRates(
  creds: OctopusCredentials,
  periodFrom?: Date,
  periodTo?: Date
): Promise<UnitRate[]> {
  const url = `${BASE}/products/${creds.productCode}/electricity-tariffs/${creds.tariffCode}/standard-unit-rates/?${rateParams(periodFrom, periodTo)}`;
  return fetchAllPages<UnitRate, UnitRateResponse>(url, {
    revalidate: TARIFF_TTL,
    tags: ["octopus-rates"],
  }, creds);
}

/**
 * Day or night unit rates, used by tariffs that publish two flat rates instead
 * of half-hourly buckets. Returns `[]` rather than throwing when the tariff
 * isn't of that kind: standard-rate tariffs reject these endpoints outright
 * with "This tariff has standard rates, not day and night."
 *
 * Deliberately unfiltered by period — these are a handful of open-ended
 * entries, so fetching the lot keeps historical days priceable for the cost of
 * one small request.
 */
async function getSplitUnitRates(
  creds: OctopusCredentials,
  segment: "day" | "night"
): Promise<UnitRate[]> {
  const url = `${BASE}/products/${creds.productCode}/electricity-tariffs/${creds.tariffCode}/${segment}-unit-rates/?page_size=100`;
  try {
    return await fetchAllPages<UnitRate, UnitRateResponse>(url, {
      revalidate: TARIFF_TTL,
      tags: ["octopus-rates"],
    }, creds);
  } catch {
    return [];
  }
}

/** Which endpoint family a tariff publishes its unit rates on. */
export type TariffRateKind = "standard" | "day-night";

export interface TariffRates {
  kind: TariffRateKind;
  /** Rate (p/kWh inc VAT) during the expensive part of the day. */
  peakAt: RateLookup;
  /** Rate (p/kWh inc VAT) inside the cheap overnight window. */
  offPeakAt: RateLookup;
}

/**
 * Resolve a tariff's unit rates whichever way it publishes them.
 *
 * The original IOG product (`INTELLI-VAR-*`) publishes half-hourly time-of-use
 * buckets on `standard-unit-rates`. The renamed family (`IOG-*`, still
 * "Intelligent Octopus Go") returns *nothing* from that endpoint and instead
 * publishes one flat `day-unit-rates` and one flat `night-unit-rates` value.
 * Asking only the old endpoint yields zero rates and silently falls through to
 * the FALLBACK_* constants, mispricing every slot by ~10%.
 *
 * The two forms are mutually exclusive, so "standard first, day/night if
 * empty" can't pick the wrong one.
 */
export async function getTariffRates(
  creds: OctopusCredentials,
  periodFrom?: Date,
  periodTo?: Date
): Promise<TariffRates> {
  const standard = await getStandardUnitRates(creds, periodFrom, periodTo);
  if (standard.length > 0) {
    // One array covers both: a midnight lookup lands in the off-peak bucket,
    // a noon lookup in the peak one.
    const lookup = buildRateLookup(standard);
    return { kind: "standard", peakAt: lookup, offPeakAt: lookup };
  }

  const [day, night] = await Promise.all([
    getSplitUnitRates(creds, "day"),
    getSplitUnitRates(creds, "night"),
  ]);
  return {
    kind: "day-night",
    peakAt: buildRateLookup(day),
    offPeakAt: buildRateLookup(night),
  };
}

/** Standing charges (p/day inc VAT) covering [periodFrom, periodTo). */
export async function getStandingCharges(
  creds: OctopusCredentials,
  periodFrom?: Date,
  periodTo?: Date
): Promise<StandingCharge[]> {
  const url = `${BASE}/products/${creds.productCode}/electricity-tariffs/${creds.tariffCode}/standing-charges/?${rateParams(periodFrom, periodTo)}`;
  return fetchAllPages<StandingCharge, StandingChargeResponse>(url, {
    revalidate: TARIFF_TTL,
    tags: ["octopus-rates"],
  }, creds);
}

/** The fields `buildRateLookup` needs — satisfied by both `UnitRate` and
 *  `StandingCharge`. */
interface RateWindowSource {
  valid_from: string;
  valid_to: string | null;
  value_inc_vat: number;
}

/** Resolves the rate (p/kWh or p/day, inc VAT) applicable at a UTC instant. */
export type RateLookup = (at: Date) => number | null;

/**
 * Pre-parse rate windows into epoch millis once, then resolve instants against
 * them. The lookup picks the entry whose [valid_from, valid_to) interval
 * contains `at`; a null `valid_to` means open-ended (current).
 *
 * Build this once per range and reuse it for every slot. The previous
 * per-call version re-parsed both bounds of every entry on every lookup,
 * which made the yearly view (17.5k slots) CPU-bound.
 *
 * Entries are scanned in the order the API returned them, so where two windows
 * cover the same instant (payment-method variants) the first still wins.
 */
export function buildRateLookup(rates: RateWindowSource[]): RateLookup {
  const windows = rates.map((r) => ({
    from: Date.parse(r.valid_from),
    to: r.valid_to ? Date.parse(r.valid_to) : Infinity,
    value: r.value_inc_vat,
  }));
  return (at: Date) => {
    const t = at.getTime();
    for (const w of windows) {
      if (t >= w.from && t < w.to) return w.value;
    }
    return null;
  };
}

/**
 * One-shot lookup, for callers resolving a couple of instants against a small
 * array. Inside a loop, build the lookup once with `buildRateLookup` instead.
 */
export function rateAt(rates: RateWindowSource[], at: Date): number | null {
  return buildRateLookup(rates)(at);
}

// ── Account / agreement helpers ──────────────────────────────────────────────

interface AccountAgreement {
  tariff_code: string;
  valid_from: string;
  valid_to: string | null;
}

interface AccountEmp {
  mpan: string;
  agreements: AccountAgreement[];
}

interface AccountProperty {
  electricity_meter_points: AccountEmp[];
}

interface AccountResp {
  properties: AccountProperty[];
}

/**
 * Fetch the agreement end date for the user's active tariff. Returns the
 * `valid_to` ISO string, or `null` if the agreement is open-ended (no fixed
 * expiry). Cached for 24 hours — this changes only when the user renews.
 */
export async function getAgreementEndDate(
  creds: OctopusCredentials
): Promise<string | null> {
  const url = `${BASE}/accounts/${encodeURIComponent(creds.accountNumber)}/`;
  try {
    const data = await octopusFetch<AccountResp>(
      url,
      { revalidate: TARIFF_TTL },
      creds
    );
    const now = Date.now();
    for (const prop of data.properties ?? []) {
      for (const emp of prop.electricity_meter_points ?? []) {
        if (emp.mpan !== creds.mpan) continue;
        for (const agr of emp.agreements ?? []) {
          const from = new Date(agr.valid_from).getTime();
          const to = agr.valid_to
            ? new Date(agr.valid_to).getTime()
            : Infinity;
          if (now >= from && now < to) return agr.valid_to ?? null;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export { OctopusError };
