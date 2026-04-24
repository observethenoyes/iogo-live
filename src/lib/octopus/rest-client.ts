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

/**
 * Fetch standard unit rates (peak rate p/kWh inc VAT). For IOG this is the
 * "expensive" rate that applies outside the off-peak window and outside any
 * dispatch slot. The off-peak rate comes from a separate IOG-specific endpoint
 * — see `getOffPeakRate`.
 */
export async function getStandardUnitRates(
  creds: OctopusCredentials
): Promise<UnitRate[]> {
  const url = `${BASE}/products/${creds.productCode}/electricity-tariffs/${creds.tariffCode}/standard-unit-rates/?page_size=100`;
  return fetchAllPages<UnitRate, UnitRateResponse>(url, {
    revalidate: TARIFF_TTL,
    tags: ["octopus-rates"],
  }, creds);
}

export async function getStandingCharges(
  creds: OctopusCredentials
): Promise<StandingCharge[]> {
  const url = `${BASE}/products/${creds.productCode}/electricity-tariffs/${creds.tariffCode}/standing-charges/?page_size=100`;
  return fetchAllPages<StandingCharge, StandingChargeResponse>(url, {
    revalidate: TARIFF_TTL,
    tags: ["octopus-rates"],
  }, creds);
}

/**
 * Returns the rate (p/kWh inc VAT) applicable at the given UTC instant.
 * Picks the entry whose [valid_from, valid_to) interval contains `at`. If
 * `valid_to` is null the entry is open-ended (current).
 */
export function rateAt(rates: { valid_from: string; valid_to: string | null; value_inc_vat: number }[], at: Date): number | null {
  const t = at.getTime();
  for (const r of rates) {
    const from = new Date(r.valid_from).getTime();
    const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
    if (t >= from && t < to) return r.value_inc_vat;
  }
  return null;
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
