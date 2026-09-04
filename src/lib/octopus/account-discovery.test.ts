import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryError, discoverAccount } from "./account-discovery";

const NOW = new Date("2026-09-04T12:00:00Z");
const ACTIVE = { valid_from: "2025-01-01T00:00:00Z", valid_to: null };
const EXPIRED = { valid_from: "2020-01-01T00:00:00Z", valid_to: "2021-01-01T00:00:00Z" };

/** Route mocked responses by URL so the success path can span several calls. */
function mockApi(account: unknown, opts: { hasReadings?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (u.includes("/accounts/")) return json(account);
      if (u.includes("/consumption/")) return json({ count: opts.hasReadings ? 42 : 0 });
      return json({ results: [] }); // rates + standing charges
    })
  );
}

function property(meterPoints: unknown[]) {
  return {
    number: "A-TEST1234",
    properties: [
      { id: 1, address_line_1: "1 Test Street", postcode: "AB1 2CD", moved_out_at: null, electricity_meter_points: meterPoints },
    ],
  };
}

async function discoverError(account: unknown) {
  mockApi(account);
  try {
    await discoverAccount({ apiKey: "k", accountNumber: "A-TEST1234", now: NOW });
  } catch (err) {
    if (err instanceof DiscoveryError) return err;
    throw err;
  }
  throw new Error("expected discovery to fail");
}

afterEach(() => vi.unstubAllGlobals());

describe("discoverAccount failure reporting", () => {
  it("names the tariff when the active agreement isn't IOG", async () => {
    const err = await discoverError(
      property([
        {
          mpan: "1234567890123",
          meters: [{ serial_number: "S1" }],
          agreements: [{ ...ACTIVE, tariff_code: "E-1R-VAR-22-11-01-A" }],
        },
      ])
    );
    expect(err.code).toBe("not-iog");
    // The whole point: the message has to say *which* tariff it found.
    expect(err.message).toContain("E-1R-VAR-22-11-01-A");
  });

  it("does not blame the tariff when IOG is active but no meters are listed", async () => {
    const err = await discoverError(
      property([
        {
          mpan: "1234567890123",
          meters: [],
          agreements: [{ ...ACTIVE, tariff_code: "E-1R-INTELLI-VAR-22-10-14-A" }],
        },
      ])
    );
    expect(err.code).toBe("no-meters");
    expect(err.message).toContain("E-1R-INTELLI-VAR-22-10-14-A");
    expect(err.message).not.toMatch(/isn't an Intelligent Octopus Go product/);
  });

  it("reports an unrecognised tariff-code shape distinctly", async () => {
    const err = await discoverError(
      property([
        {
          mpan: "1234567890123",
          meters: [{ serial_number: "S1" }],
          agreements: [{ ...ACTIVE, tariff_code: "WEIRD-CODE" }],
        },
      ])
    );
    expect(err.code).toBe("not-iog");
    expect(err.message).toContain("WEIRD-CODE");
    expect(err.message).toMatch(/doesn't match the expected/);
  });

  it("reports an expired agreement as such, not as a tariff problem", async () => {
    const err = await discoverError(
      property([
        {
          mpan: "1234567890123",
          meters: [{ serial_number: "S1" }],
          agreements: [{ ...EXPIRED, tariff_code: "E-1R-INTELLI-VAR-22-10-14-A" }],
        },
      ])
    );
    expect(err.code).toBe("no-active-agreement");
  });

  it("reports an export-only account as having no consumption", async () => {
    const err = await discoverError(
      property([
        {
          mpan: "1234567890123",
          is_export: true,
          meters: [{ serial_number: "S1" }],
          agreements: [{ ...ACTIVE, tariff_code: "E-1R-OUTGOING-VAR-24-10-26-A" }],
        },
      ])
    );
    expect(err.code).toBe("no-electricity");
  });

  it("still reports an account with no electricity meter points", async () => {
    const err = await discoverError(property([]));
    expect(err.code).toBe("no-electricity");
  });
});

describe("discoverAccount success", () => {
  it("picks the newest serial that actually reports readings", async () => {
    mockApi(
      property([
        {
          mpan: "1234567890123",
          meters: [{ serial_number: "OLD" }, { serial_number: "NEW" }],
          agreements: [{ ...ACTIVE, tariff_code: "E-1R-INTELLI-VAR-22-10-14-A" }],
        },
      ]),
      { hasReadings: true }
    );

    const result = await discoverAccount({ apiKey: "k", accountNumber: "A-TEST1234", now: NOW });
    expect(result.recommended).not.toBeNull();
    expect(result.recommended?.productCode).toBe("INTELLI-VAR-22-10-14");
    expect(result.recommended?.meterSerial).toBe("NEW");
    expect(result.properties[0].label).toContain("1 Test Street");
  });
});
