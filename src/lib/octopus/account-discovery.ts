import "server-only";
import { todayUkDate, ukDayStart, ukDayEnd } from "@/lib/calculator/timezone";

/**
 * Given just an Octopus API key + account number, discover the meter and
 * tariff details the dashboard needs. This lets users onboard (and later
 * re-configure when they move house or change tariff) without ever having to
 * hand-edit `.env.local` / Vercel env vars.
 *
 * Auth: Basic auth, API key as username, empty password — same as the rest of
 * the REST client. We don't go through `authHeader()` / `octopusEnv()` because
 * this path runs *before* env vars exist (that's the whole point).
 */

const BASE = "https://api.octopus.energy/v1";

export class DiscoveryError extends Error {
  constructor(
    message: string,
    public code:
      | "bad-credentials" // 401/403
      | "not-found" // account doesn't exist
      | "no-electricity" // account has no electricity meter point
      | "no-active-agreement" // all agreements expired — unusual
      | "not-iog" // active tariff isn't an Intelligent Go product
      | "no-meters" // IOG tariff is active, but the MPAN lists no meters
      | "upstream" // any other HTTP failure
      | "unexpected-shape", // response JSON didn't match what we expected
    public status?: number
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

// ── Octopus account-endpoint shape (the bits we use) ─────────────────────────

interface Agreement {
  tariff_code: string;
  valid_from: string;
  valid_to: string | null;
}

interface Meter {
  serial_number: string;
}

interface ElectricityMeterPoint {
  mpan: string;
  is_export?: boolean;
  meters: Meter[];
  agreements: Agreement[];
}

interface Property {
  id: number;
  address_line_1?: string;
  address_line_2?: string;
  town?: string;
  postcode?: string;
  moved_in_at?: string;
  moved_out_at?: string | null;
  electricity_meter_points: ElectricityMeterPoint[];
}

interface AccountResponse {
  number: string;
  properties: Property[];
}

// ── Public result shape ──────────────────────────────────────────────────────

/**
 * Live rates for a discovered meter, pulled from the public product endpoint
 * using the discovered tariff + product code. These are purely informational
 * on the setup page — the dashboard re-fetches them at render time via
 * `getTariffRates()` / `getStandingCharges()` so they stay fresh.
 *
 * `null` on any field means the product endpoint responded but didn't publish
 * a rate for that slot right now (e.g. a brand-new tariff whose time-of-use
 * buckets haven't been populated yet). The page degrades to "unavailable"
 * rather than erroring the whole discovery.
 */
export interface DiscoveredRates {
  peakPence: number | null;
  offPeakPence: number | null;
  standingChargePence: number | null;
  /** ISO timestamp of the instant these rates were priced at (today UK noon). */
  pricedAt: string;
}

export interface DiscoveredMeter {
  mpan: string;
  meterSerial: string;
  tariffCode: string;
  productCode: string;
  agreementValidFrom: string;
  agreementValidTo: string | null;
  rates: DiscoveredRates | null;
}

export interface DiscoveredProperty {
  id: number;
  label: string; // human-readable address line for property picker
  movedOutAt: string | null;
  /** The active import meter on this property, if one exists. */
  meter: DiscoveredMeter | null;
}

export interface DiscoveryResult {
  accountNumber: string;
  properties: DiscoveredProperty[];
  /**
   * The meter we'd recommend using (first active, non-export, IOG-tariffed
   * meter found across properties). The caller can still override with a
   * property picker if `properties.length > 1`.
   */
  recommended: DiscoveredMeter | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the product code from a tariff code. Octopus tariff codes follow
 * `E-{rate-count}R-{PRODUCT-CODE}-{REGION-LETTER}`, e.g.:
 *   `E-1R-INTELLI-VAR-22-10-14-A` → `INTELLI-VAR-22-10-14`
 * The trailing letter is the DNO region (A–P), one per GB distribution area.
 */
export function productCodeFromTariff(tariffCode: string): string | null {
  const m = tariffCode.match(/^E-\d+R-(.+)-[A-P]$/);
  return m ? m[1] : null;
}

/**
 * True if a product code looks like any flavour of Intelligent Octopus Go.
 *
 * Octopus renamed the family: the original products are `INTELLI-*`
 * (INTELLI-VAR-22-10-14), the current ones are `IOG-*`
 * (IOG-SMB-VAR-24-10-29, whose display_name is literally "Intelligent Octopus
 * Go"). Both have to be accepted or existing customers on the newer code are
 * told they aren't on IOG.
 */
export function isIogProduct(productCode: string): boolean {
  const code = productCode.toUpperCase();
  return code.startsWith("INTELLI") || code.startsWith("IOG-");
}

/** Pick the agreement whose [valid_from, valid_to) interval contains `now`. */
function activeAgreement(agreements: Agreement[], now: Date): Agreement | null {
  const t = now.getTime();
  for (const a of agreements) {
    const from = new Date(a.valid_from).getTime();
    const to = a.valid_to ? new Date(a.valid_to).getTime() : Infinity;
    if (t >= from && t < to) return a;
  }
  return null;
}

function formatAddress(p: Property): string {
  const parts = [p.address_line_1, p.address_line_2, p.town, p.postcode].filter(
    (s): s is string => Boolean(s && s.trim())
  );
  return parts.length > 0 ? parts.join(", ") : `Property #${p.id}`;
}

/**
 * An MPAN can have several meter serials attached (every time a meter is
 * physically swapped, Octopus keeps the old serial in the account record for
 * history). Only the *current* meter reports data to the consumption endpoint
 * — any other serial returns `{count: 0}` and silently breaks the dashboard.
 *
 * Probe a single serial with a cheap 1-row query to see whether it has any
 * readings at all. We explicitly pass `cache: "no-store"` because this is a
 * correctness check, not a hot path.
 */
async function meterHasReadings(
  mpan: string,
  serial: string,
  authHeader: string
): Promise<boolean> {
  const url = `${BASE}/electricity-meter-points/${encodeURIComponent(mpan)}/meters/${encodeURIComponent(serial)}/consumption/?page_size=1&order_by=-period`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as
      | { count?: number }
      | null;
    return typeof data?.count === "number" && data.count > 0;
  } catch {
    return false;
  }
}

// ── Rate discovery ───────────────────────────────────────────────────────────
//
// IOG's standard-unit-rates endpoint publishes peak & off-peak as daily
// time-of-use buckets. We look up at midnight UK (always inside the
// 23:30–05:30 off-peak window) and noon UK (always inside the peak window)
// so one endpoint yields both numbers without any special-casing.

interface UnitRateEntry {
  value_inc_vat: number;
  valid_from: string;
  valid_to: string | null;
}

interface UnitRateResp {
  results: UnitRateEntry[];
}

function rateAtInstant(rates: UnitRateEntry[], at: Date): number | null {
  const t = at.getTime();
  for (const r of rates) {
    const from = new Date(r.valid_from).getTime();
    const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
    if (t >= from && t < to) return r.value_inc_vat;
  }
  return null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Fetch live peak/off-peak/standing-charge values for a discovered tariff.
 * Uses the public product endpoint — no auth needed, but we send the Basic
 * header anyway since it costs nothing and matches the rest of the flow.
 * Never throws: any upstream failure returns `null` for that field.
 */
async function fetchRatesFor(
  productCode: string,
  tariffCode: string,
  authHeader: string
): Promise<DiscoveredRates> {
  const today = todayUkDate();
  const todayStart = ukDayStart(today);
  const offPeakAt = todayStart; // midnight UK → off-peak window
  const peakAt = new Date(todayStart.getTime() + 12 * HOUR_MS); // noon UK → peak window

  // Scope the query to today. Unfiltered, these endpoints return the tariff's
  // whole history (~2000 entries) and we'd be relying on newest-first ordering
  // to land today's buckets on the single page we read. Filtered, the response
  // is the two or three buckets covering today, so one page is provably enough.
  const period = new URLSearchParams({
    page_size: "100",
    period_from: todayStart.toISOString(),
    period_to: ukDayEnd(today).toISOString(),
  });
  const base = `${BASE}/products/${encodeURIComponent(productCode)}/electricity-tariffs/${encodeURIComponent(tariffCode)}`;
  const ratesUrl = `${base}/standard-unit-rates/?${period}`;
  const standingUrl = `${base}/standing-charges/?${period}`;

  async function getJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as T | null;
    } catch {
      return null;
    }
  }

  const [unitRates, standingCharges] = await Promise.all([
    getJson<UnitRateResp>(ratesUrl),
    getJson<UnitRateResp>(standingUrl),
  ]);

  const standardResults = unitRates?.results ?? [];
  let peakPence = rateAtInstant(standardResults, peakAt);
  let offPeakPence = rateAtInstant(standardResults, offPeakAt);

  // The renamed IOG-* products publish nothing on standard-unit-rates and use
  // flat day/night endpoints instead. Without this the setup page shows
  // "unavailable" for both rates on every current IOG tariff. Unfiltered by
  // period because these are one or two open-ended entries.
  if (standardResults.length === 0) {
    const [day, night] = await Promise.all([
      getJson<UnitRateResp>(`${base}/day-unit-rates/?page_size=100`),
      getJson<UnitRateResp>(`${base}/night-unit-rates/?page_size=100`),
    ]);
    peakPence = rateAtInstant(day?.results ?? [], peakAt);
    offPeakPence = rateAtInstant(night?.results ?? [], offPeakAt);
  }

  return {
    peakPence,
    offPeakPence,
    standingChargePence: standingCharges
      ? rateAtInstant(standingCharges.results ?? [], peakAt)
      : null,
    pricedAt: peakAt.toISOString(),
  };
}

/**
 * Why a meter point couldn't be used. Collected so a failed discovery can say
 * which check actually failed: all five of these used to surface as "no
 * Intelligent Octopus Go tariff found", which is misleading for four of them.
 * Carries the tariff code (a public product identifier) but never the MPAN or
 * meter serial.
 */
export type MeterRejection =
  | { kind: "export" }
  | { kind: "no-active-agreement" }
  | { kind: "unparseable-tariff"; tariffCode: string }
  | { kind: "not-iog"; tariffCode: string; productCode: string }
  | { kind: "no-meters"; tariffCode: string; productCode: string };

/**
 * Pick the best electricity meter point on a property: active (non-export)
 * with a currently-valid IOG agreement, using the meter serial that actually
 * reports consumption. Returns null if the property has no usable meter.
 */
async function pickMeter(
  property: Property,
  now: Date,
  authHeader: string,
  rejections: MeterRejection[]
): Promise<DiscoveredMeter | null> {
  for (const emp of property.electricity_meter_points) {
    if (emp.is_export) {
      rejections.push({ kind: "export" });
      continue;
    }
    const agreement = activeAgreement(emp.agreements, now);
    if (!agreement) {
      rejections.push({ kind: "no-active-agreement" });
      continue;
    }
    const tariffCode = agreement.tariff_code;
    const productCode = productCodeFromTariff(tariffCode);
    if (!productCode) {
      rejections.push({ kind: "unparseable-tariff", tariffCode });
      continue;
    }
    if (!isIogProduct(productCode)) {
      rejections.push({ kind: "not-iog", tariffCode, productCode });
      continue;
    }
    if (!emp.meters?.length) {
      rejections.push({ kind: "no-meters", tariffCode, productCode });
      continue;
    }

    // Octopus typically lists meters in install order (oldest first), so the
    // last entry is usually the current one. Probe newest → oldest and pick
    // the first one with any readings. If *none* have readings (brand-new
    // install that hasn't reported yet), fall back to the newest serial so
    // the dashboard at least tries the right meter.
    const metersNewestFirst = [...emp.meters].reverse();
    let chosenSerial: string | null = null;
    for (const m of metersNewestFirst) {
      // Sequential on purpose — first match wins, so probing in parallel
      // would waste requests.
      if (await meterHasReadings(emp.mpan, m.serial_number, authHeader)) {
        chosenSerial = m.serial_number;
        break;
      }
    }
    if (!chosenSerial) chosenSerial = metersNewestFirst[0].serial_number;

    // Fetch current peak/off-peak/standing so the setup page can show the
    // user exactly what the dashboard will charge — confirming the tariff
    // codes map to real numbers before they commit.
    const rates = await fetchRatesFor(productCode, agreement.tariff_code, authHeader);

    return {
      mpan: emp.mpan,
      meterSerial: chosenSerial,
      tariffCode: agreement.tariff_code,
      productCode,
      agreementValidFrom: agreement.valid_from,
      agreementValidTo: agreement.valid_to,
      rates,
    };
  }
  return null;
}

// ── The entry point ──────────────────────────────────────────────────────────

export async function discoverAccount({
  apiKey,
  accountNumber,
  now = new Date(),
}: {
  apiKey: string;
  accountNumber: string;
  now?: Date;
}): Promise<DiscoveryResult> {
  if (!apiKey.trim()) {
    throw new DiscoveryError("API key is required", "bad-credentials");
  }
  if (!accountNumber.trim()) {
    throw new DiscoveryError("Account number is required", "bad-credentials");
  }

  const token = Buffer.from(`${apiKey}:`).toString("base64");
  const authHeader = `Basic ${token}`;
  const url = `${BASE}/accounts/${encodeURIComponent(accountNumber)}/`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      // This endpoint must never be cached — the whole point of the setup
      // flow is to see the current state of the account.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new DiscoveryError(
      `Network error contacting Octopus: ${err instanceof Error ? err.message : String(err)}`,
      "upstream"
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new DiscoveryError(
      "Octopus rejected those credentials. Check the API key and account number.",
      "bad-credentials",
      res.status
    );
  }
  if (res.status === 404) {
    throw new DiscoveryError(
      `Account "${accountNumber}" not found.`,
      "not-found",
      404
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DiscoveryError(
      `Octopus API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
      "upstream",
      res.status
    );
  }

  const data = (await res.json().catch(() => null)) as AccountResponse | null;
  if (!data || !Array.isArray(data.properties)) {
    throw new DiscoveryError(
      "Octopus returned an unexpected response shape.",
      "unexpected-shape"
    );
  }

  // Probe each property's meters in parallel — one network round-trip per
  // property, not per meter. Within a property pickMeter walks the meters
  // sequentially because a first-match-wins probe must be ordered.
  const rejections: MeterRejection[] = [];
  const properties: DiscoveredProperty[] = await Promise.all(
    data.properties.map(async (p) => ({
      id: p.id,
      label: formatAddress(p),
      movedOutAt: p.moved_out_at ?? null,
      meter: await pickMeter(p, now, authHeader, rejections),
    }))
  );

  // Prefer the first property the user currently lives at (no `moved_out_at`)
  // over any past ones — IOG customers moving house often have stale records.
  const live = properties.filter((p) => p.movedOutAt === null);
  const recommended =
    live.find((p) => p.meter !== null)?.meter ??
    properties.find((p) => p.meter !== null)?.meter ??
    null;

  if (properties.length === 0) {
    throw new DiscoveryError(
      `Account "${data.number}" has no properties on file.`,
      "no-electricity"
    );
  }
  if (!recommended) {
    // Distinguish "has electricity but not IOG" from "has no electricity at all"
    const anyElectricity = data.properties.some(
      (p) => p.electricity_meter_points.length > 0
    );
    if (!anyElectricity) {
      throw new DiscoveryError(
        "This account doesn't have any electricity meter points.",
        "no-electricity"
      );
    }
    // Report the most specific reason we recorded, most actionable first.
    // Naming the tariff code matters: without it, "not IOG" is a dead end for
    // anyone who believes they *are* on IOG.
    const noMeters = rejections.find((r) => r.kind === "no-meters");
    if (noMeters) {
      throw new DiscoveryError(
        `Found an active Intelligent Octopus Go agreement (${noMeters.tariffCode}), but ` +
          `Octopus didn't list any meters against that MPAN. That usually means a recent ` +
          `meter exchange or a new supply that hasn't finished registering. Try again in ` +
          `a day or two, or set OCTOPUS_MPAN and OCTOPUS_METER_SERIAL manually.`,
        "no-meters"
      );
    }

    const wrongTariff = rejections.find(
      (r) => r.kind === "not-iog" || r.kind === "unparseable-tariff"
    );
    if (wrongTariff && "tariffCode" in wrongTariff) {
      const code = wrongTariff.tariffCode;
      throw new DiscoveryError(
        wrongTariff.kind === "not-iog"
          ? `The active electricity tariff on this account is "${code}", which isn't an ` +
            `Intelligent Octopus Go product. This dashboard is built around IOG's dispatch ` +
            `and off-peak structure, so it can't price that tariff correctly.`
          : `Couldn't interpret the active tariff code "${code}" — it doesn't match the ` +
            `expected E-{n}R-{PRODUCT}-{REGION} shape. Please report this code so it can ` +
            `be supported.`,
        "not-iog"
      );
    }

    if (rejections.some((r) => r.kind === "no-active-agreement")) {
      throw new DiscoveryError(
        "No currently-active electricity agreement found on this account. If you've just " +
          "switched tariff or moved in, the new agreement may not have started yet.",
        "no-active-agreement"
      );
    }

    throw new DiscoveryError(
      "This account only has export meter points, so there's no consumption to show.",
      "no-electricity"
    );
  }

  return {
    accountNumber: data.number,
    properties,
    recommended,
  };
}
