import { describe, expect, it } from "vitest";
import { isIogProduct, productCodeFromTariff } from "./account-discovery";
import { regionFromTariff } from "./tariff-comparison";

describe("productCodeFromTariff", () => {
  it("strips the rate count and the DNO region letter", () => {
    expect(productCodeFromTariff("E-1R-INTELLI-VAR-22-10-14-A")).toBe(
      "INTELLI-VAR-22-10-14"
    );
    expect(productCodeFromTariff("E-2R-VAR-22-11-01-C")).toBe("VAR-22-11-01");
    expect(productCodeFromTariff("E-1R-IOG-SMB-VAR-24-10-29-H")).toBe(
      "IOG-SMB-VAR-24-10-29"
    );
  });

  it("returns null for codes that don't match the expected shape", () => {
    expect(productCodeFromTariff("nonsense")).toBeNull();
    expect(productCodeFromTariff("G-1R-INTELLI-VAR-22-10-14-A")).toBeNull();
    // Q is outside the A-P range of GB distribution areas.
    expect(productCodeFromTariff("E-1R-INTELLI-VAR-22-10-14-Q")).toBeNull();
  });
});

describe("isIogProduct", () => {
  it("recognises the original INTELLI-* products", () => {
    expect(isIogProduct("INTELLI-VAR-22-10-14")).toBe(true);
    expect(isIogProduct("intelli-var-22-10-14")).toBe(true);
  });

  it("recognises the renamed IOG-* products", () => {
    // Octopus renamed the family; IOG-SMB-VAR-24-10-29 reports
    // display_name "Intelligent Octopus Go".
    expect(isIogProduct("IOG-SMB-VAR-24-10-29")).toBe(true);
    expect(isIogProduct("iog-smb-var-24-10-29")).toBe(true);
    expect(isIogProduct("IOG-SMB-FIX-12M-26-09-02")).toBe(true);
  });

  it("rejects other tariffs", () => {
    expect(isIogProduct("VAR-22-11-01")).toBe(false);
    expect(isIogProduct("AGILE-24-10-01")).toBe(false);
    expect(isIogProduct("IOGX-SOMETHING")).toBe(false);
  });
});

describe("regionFromTariff", () => {
  it("extracts the trailing region letter", () => {
    expect(regionFromTariff("E-1R-INTELLI-VAR-22-10-14-A")).toBe("A");
    expect(regionFromTariff("E-1R-AGILE-24-10-01-P")).toBe("P");
  });

  it("returns null when there is no valid region letter", () => {
    expect(regionFromTariff("E-1R-INTELLI-VAR-22-10-14-Z")).toBeNull();
    expect(regionFromTariff("INTELLI-VAR-22-10-14")).toBeNull();
  });
});
