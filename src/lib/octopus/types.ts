// Raw shapes returned by the Octopus REST API.
// All timestamps are ISO 8601 strings in UTC.

/** Per-user Octopus Energy credentials, decrypted and ready to use. */
export interface OctopusCredentials {
  apiKey: string;
  accountNumber: string;
  mpan: string;
  meterSerial: string;
  productCode: string;
  tariffCode: string;
  /** Custom peak rate in p/kWh (inc VAT). When set, overrides the API rate. */
  peakRateOverride?: number | null;
  /** Custom off-peak rate in p/kWh (inc VAT). When set, overrides the API rate. */
  offPeakRateOverride?: number | null;
  /** Custom standing charge in p/day (inc VAT). When set, overrides the API rate. */
  standingChargeOverride?: number | null;
}

export interface ConsumptionReading {
  consumption: number; // kWh
  interval_start: string; // ISO 8601, UTC
  interval_end: string; // ISO 8601, UTC
}

export interface ConsumptionResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ConsumptionReading[];
}

export interface UnitRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string; // ISO 8601, UTC
  valid_to: string | null; // null = open-ended (current rate)
  payment_method: string | null;
}

export interface UnitRateResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: UnitRate[];
}

export interface StandingCharge {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string | null;
  payment_method: string | null;
}

export interface StandingChargeResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: StandingCharge[];
}
