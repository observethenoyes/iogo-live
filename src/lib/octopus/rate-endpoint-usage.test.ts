import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture guard.
 *
 * `getStandardUnitRates()` reads one endpoint. The current Intelligent Octopus
 * Go products (IOG-*) publish nothing there and use flat day/night rates
 * instead, so any direct caller silently resolves no rates and falls back to
 * hardcoded constants — mispricing everything, with no error. That regressed
 * twice: once in the calculators, once in the settings page, where it showed
 * "—p/kWh" while the standing charge resolved fine.
 *
 * `getTariffRates()` handles both shapes. Everything outside rest-client.ts
 * must go through it.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("unit-rate endpoint usage", () => {
  it("only rest-client.ts calls getStandardUnitRates directly", () => {
    const offenders = walk("src")
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => !f.endsWith(join("octopus", "rest-client.ts")))
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => /getStandardUnitRates\s*\(/.test(readFileSync(f, "utf8")));

    expect(offenders).toEqual([]);
  });
});
