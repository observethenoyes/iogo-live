import "server-only";

import type { CostSlot } from "@/lib/mock-data";
import type { OctopusCredentials } from "./types";

const BASE = "https://api.octopus.energy/v1";
const PRODUCT_CACHE_TTL = 60 * 60 * 24; // 24h
const RATE_CACHE_TTL = 60 * 60 * 24; // 24h

// ── Region extraction ────────────────────────────────────────────────────────

/** Extract the GSP region letter (A–P) from a tariff code like E-1R-INTELLI-VAR-22-10-14-A */
export function regionFromTariff(tariffCode: string): string | null {
  const m = tariffCode.match(/-([A-P])$/);
  return m ? m[1] : null;
}

// ── Product discovery ────────────────────────────────────────────────────────

interface ProductEntry {
  code: string;
  display_name: string;
  brand: string;
  direction: string;
  is_variable: boolean;
  is_business: boolean;
  available_from: string | null;
  available_to: string | null;
}

interface ProductsResponse {
  count: number;
  results: ProductEntry[];
}

interface ComparisonProducts {
  flexible: { code: string; name: string } | null;
  agile: { code: string; name: string } | null;
}

/**
 * Find the current Flexible and Agile Octopus product codes from the public
 * products API. Results are cached for 24 hours.
 */
async function findComparisonProducts(): Promise<ComparisonProducts> {
  try {
    const res = await fetch(
      `${BASE}/products/?brand=OCTOPUS_ENERGY&is_variable=true&is_business=false`,
      {
        next: { revalidate: PRODUCT_CACHE_TTL },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return { flexible: null, agile: null };
    const data = (await res.json()) as ProductsResponse;
    const products = data.results ?? [];

    // Find the latest available Flexible product (code starts with VAR-)
    const flexibles = products
      .filter(
        (p) =>
          p.direction === "IMPORT" &&
          p.code.startsWith("VAR-") &&
          !p.is_business
      )
      .sort((a, b) => (b.available_from ?? "").localeCompare(a.available_from ?? ""));

    // Find the latest available Agile product (code starts with AGILE-)
    const agiles = products
      .filter(
        (p) =>
          p.direction === "IMPORT" &&
          p.code.startsWith("AGILE-") &&
          !p.is_business
      )
      .sort((a, b) => (b.available_from ?? "").localeCompare(a.available_from ?? ""));

    return {
      flexible: flexibles[0]
        ? { code: flexibles[0].code, name: flexibles[0].display_name }
        : null,
      agile: agiles[0]
        ? { code: agiles[0].code, name: agiles[0].display_name }
        : null,
    };
  } catch {
    return { flexible: null, agile: null };
  }
}

// ── Rate fetching ────────────────────────────────────────────────────────────

interface RateEntry {
  value_inc_vat: number;
  valid_from: string;
  valid_to: string | null;
}

interface RateResponse {
  count: number;
  next: string | null;
  results: RateEntry[];
}

/** Fetch all unit rates for a product/tariff, optionally filtered by date range. */
async function fetchRates(
  productCode: string,
  tariffCode: string,
  periodFrom?: Date,
  periodTo?: Date
): Promise<RateEntry[]> {
  const params = new URLSearchParams({ page_size: "1500" });
  if (periodFrom) params.set("period_from", periodFrom.toISOString());
  if (periodTo) params.set("period_to", periodTo.toISOString());

  const url = `${BASE}/products/${encodeURIComponent(productCode)}/electricity-tariffs/${encodeURIComponent(tariffCode)}/standard-unit-rates/?${params}`;

  try {
    const items: RateEntry[] = [];
    let fetchUrl: string | null = url;
    let pages = 0;
    while (fetchUrl && pages < 10) {
      const res = await fetch(fetchUrl, {
        next: { revalidate: RATE_CACHE_TTL },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as RateResponse;
      items.push(...(data.results ?? []));
      fetchUrl = data.next;
      pages++;
    }
    return items;
  } catch {
    return [];
  }
}

/** Find the rate applicable at a given instant. */
function rateAtInstant(rates: RateEntry[], at: Date): number | null {
  const t = at.getTime();
  for (const r of rates) {
    const from = new Date(r.valid_from).getTime();
    const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
    if (t >= from && t < to) return r.value_inc_vat;
  }
  return null;
}

// ── Comparison calculation ───────────────────────────────────────────────────

export interface TariffComparisonResult {
  /** User's actual IOG consumption cost (pence, no standing charge). */
  iogCostPence: number;
  flexible: { name: string; costPence: number; ratePence: number } | null;
  agile: { name: string; costPence: number } | null;
  standingChargePence: number;
}

/**
 * Calculate what the user would have paid on Flexible and Agile tariffs
 * for the same day's consumption. Uses the public Octopus API (no auth).
 */
export async function calculateTariffComparison(
  creds: OctopusCredentials,
  slots: CostSlot[],
  standingChargePence: number
): Promise<TariffComparisonResult | null> {
  const region = regionFromTariff(creds.tariffCode);
  if (!region) return null;

  const products = await findComparisonProducts();
  if (!products.flexible && !products.agile) return null;

  // IOG consumption cost (excluding standing charge).
  const iogCostPence = slots.reduce((sum, s) => sum + s.cost, 0);

  // Date range from the slots for Agile rate fetching.
  const firstSlot = slots[0];
  const lastSlot = slots[slots.length - 1];
  const periodFrom = firstSlot
    ? new Date(firstSlot.intervalStart)
    : undefined;
  const periodTo = lastSlot ? new Date(lastSlot.intervalEnd) : undefined;

  let flexible: TariffComparisonResult["flexible"] = null;
  let agile: TariffComparisonResult["agile"] = null;

  // ── Flexible: one flat rate for all consumption ──
  if (products.flexible) {
    const flexTariff = `E-1R-${products.flexible.code}-${region}`;
    const rates = await fetchRates(products.flexible.code, flexTariff);
    // Flexible has a single flat rate — find the current one.
    const midday = periodFrom
      ? new Date(periodFrom.getTime() + 12 * 60 * 60 * 1000)
      : new Date();
    const flatRate = rateAtInstant(rates, midday);
    if (flatRate != null) {
      const totalKwh = slots.reduce((sum, s) => sum + s.consumptionKwh, 0);
      flexible = {
        name: products.flexible.name || "Flexible Octopus",
        costPence: totalKwh * flatRate,
        ratePence: flatRate,
      };
    }
  }

  // ── Agile: half-hourly variable rates ──
  if (products.agile && periodFrom && periodTo) {
    const agileTariff = `E-1R-${products.agile.code}-${region}`;
    const rates = await fetchRates(
      products.agile.code,
      agileTariff,
      periodFrom,
      periodTo
    );
    if (rates.length > 0) {
      let agileCost = 0;
      let matched = 0;
      for (const slot of slots) {
        const slotStart = new Date(slot.intervalStart);
        const rate = rateAtInstant(rates, slotStart);
        if (rate != null) {
          agileCost += slot.consumptionKwh * rate;
          matched++;
        }
      }
      // Only show Agile if we matched most slots (>80%).
      if (matched > slots.length * 0.8) {
        agile = {
          name: products.agile.name || "Agile Octopus",
          costPence: agileCost,
        };
      }
    }
  }

  if (!flexible && !agile) return null;

  return { iogCostPence, flexible, agile, standingChargePence };
}
