import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRateLookup, getTariffRates, rateAt } from "./rest-client";
import type { OctopusCredentials } from "./types";

// Octopus returns rate windows newest-first as [valid_from, valid_to), with a
// null valid_to meaning "still current".
const RATES = [
  { valid_from: "2026-01-03T00:00:00Z", valid_to: null, value_inc_vat: 30 },
  { valid_from: "2026-01-02T00:00:00Z", valid_to: "2026-01-03T00:00:00Z", value_inc_vat: 20 },
  { valid_from: "2026-01-01T00:00:00Z", valid_to: "2026-01-02T00:00:00Z", value_inc_vat: 10 },
];

describe("buildRateLookup", () => {
  const lookup = buildRateLookup(RATES);

  it("resolves the window containing the instant", () => {
    expect(lookup(new Date("2026-01-01T12:00:00Z"))).toBe(10);
    expect(lookup(new Date("2026-01-02T12:00:00Z"))).toBe(20);
  });

  it("treats valid_from as inclusive and valid_to as exclusive", () => {
    expect(lookup(new Date("2026-01-02T00:00:00Z"))).toBe(20);
    expect(lookup(new Date("2026-01-01T23:59:59.999Z"))).toBe(10);
  });

  it("extends an open-ended window indefinitely", () => {
    expect(lookup(new Date("2030-06-01T00:00:00Z"))).toBe(30);
  });

  it("returns null before the earliest window", () => {
    expect(lookup(new Date("2025-12-31T23:59:59Z"))).toBeNull();
  });

  it("returns null for an empty rate list", () => {
    expect(buildRateLookup([])(new Date())).toBeNull();
  });

  it("keeps first-in-array-order wins when two windows overlap", () => {
    // Payment-method variants can produce two entries covering one instant.
    const overlapping = [
      { valid_from: "2026-01-01T00:00:00Z", valid_to: null, value_inc_vat: 111 },
      { valid_from: "2026-01-01T00:00:00Z", valid_to: null, value_inc_vat: 222 },
    ];
    expect(buildRateLookup(overlapping)(new Date("2026-06-01T00:00:00Z"))).toBe(111);
  });

  it("agrees with the one-shot rateAt helper", () => {
    const at = new Date("2026-01-02T06:00:00Z");
    expect(rateAt(RATES, at)).toBe(lookup(at));
  });
});

// ── Rate-shape resolution ───────────────────────────────────────────────────
//
// Octopus publishes IOG rates two different ways. The original INTELLI-*
// products use half-hourly buckets on `standard-unit-rates`. The renamed IOG-*
// products return nothing there and publish flat day/night rates instead;
// reading only the old endpoint silently reprices every slot at the FALLBACK_*
// constants.

const CREDS = {
  apiKey: "k",
  accountNumber: "A-1",
  mpan: "1",
  meterSerial: "1",
  productCode: "IOG-SMB-VAR-24-10-29",
  tariffCode: "E-1R-IOG-SMB-VAR-24-10-29-H",
} as OctopusCredentials;

function mockRateEndpoints(opts: {
  standard?: unknown[];
  day?: unknown[];
  night?: unknown[];
  splitRejects?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      const ok = (results: unknown[]) =>
        new Response(JSON.stringify({ count: results.length, next: null, results }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (u.includes("/standard-unit-rates/")) return ok(opts.standard ?? []);
      if (opts.splitRejects) {
        // What a standard-rate tariff really returns for these.
        return new Response(
          JSON.stringify({ detail: "This tariff has standard rates, not day and night." }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      if (u.includes("/day-unit-rates/")) return ok(opts.day ?? []);
      if (u.includes("/night-unit-rates/")) return ok(opts.night ?? []);
      throw new Error(`unexpected url ${u}`);
    })
  );
}

const NOON = new Date("2026-09-04T11:00:00Z");
const MIDNIGHT = new Date("2026-09-03T23:00:00Z");

afterEach(() => vi.unstubAllGlobals());

describe("getTariffRates", () => {
  it("uses standard-unit-rates buckets when the tariff has them", async () => {
    mockRateEndpoints({
      standard: [
        { valid_from: "2026-09-03T23:00:00Z", valid_to: "2026-09-04T04:30:00Z", value_inc_vat: 7 },
        { valid_from: "2026-09-04T04:30:00Z", valid_to: "2026-09-04T22:30:00Z", value_inc_vat: 28 },
      ],
    });
    const rates = await getTariffRates(CREDS);
    expect(rates.kind).toBe("standard");
    expect(rates.offPeakAt(MIDNIGHT)).toBe(7);
    expect(rates.peakAt(NOON)).toBe(28);
  });

  it("falls back to flat day/night rates when standard-unit-rates is empty", async () => {
    mockRateEndpoints({
      standard: [],
      day: [{ valid_from: "2026-07-05T23:00:00Z", valid_to: null, value_inc_vat: 30.371355 }],
      night: [{ valid_from: "2026-07-05T23:00:00Z", valid_to: null, value_inc_vat: 6.89997 }],
    });
    const rates = await getTariffRates(CREDS);
    expect(rates.kind).toBe("day-night");
    expect(rates.peakAt(NOON)).toBe(30.371355);
    expect(rates.offPeakAt(MIDNIGHT)).toBe(6.89997);
    // Flat rates apply at any instant, not just the probe times.
    expect(rates.peakAt(new Date("2027-01-01T09:00:00Z"))).toBe(30.371355);
  });

  it("does not throw when a standard tariff rejects the day/night endpoints", async () => {
    mockRateEndpoints({ standard: [], splitRejects: true });
    const rates = await getTariffRates(CREDS);
    expect(rates.kind).toBe("day-night");
    // No rates anywhere: callers fall through to their FALLBACK_* constants.
    expect(rates.peakAt(NOON)).toBeNull();
    expect(rates.offPeakAt(MIDNIGHT)).toBeNull();
  });
});
