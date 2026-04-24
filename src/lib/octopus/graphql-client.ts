import "server-only";
import type { DispatchInterval } from "@/lib/calculator/classify-slots";
import type { ConsumptionReading, OctopusCredentials } from "./types";

const GRAPHQL_URL = "https://api.octopus.energy/v1/graphql/";

// Kraken JWTs last ~1 hour. Refresh proactively at 55 min so we never serve
// a request with a token that expires mid-flight.
const TOKEN_TTL_MS = 55 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Per-user token cache, keyed by API key.
const tokenCache = new Map<string, CachedToken>();
const inflightTokens = new Map<string, Promise<string>>();

class KrakenAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KrakenAuthError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

async function gqlFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = token;

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Kraken GraphQL HTTP ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Kraken GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  if (!body.data) {
    throw new Error("Kraken GraphQL returned no data");
  }
  return body.data;
}

interface ObtainTokenData {
  obtainKrakenToken: { token: string };
}

async function fetchToken(creds: OctopusCredentials): Promise<string> {
  const data = await gqlFetch<ObtainTokenData>(
    `mutation Auth($input: ObtainJSONWebTokenInput!) {
       obtainKrakenToken(input: $input) { token }
     }`,
    { input: { APIKey: creds.apiKey } },
    null
  );
  return data.obtainKrakenToken.token;
}

async function getToken(creds: OctopusCredentials): Promise<string> {
  const cacheKey = creds.apiKey;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.token;

  // Coalesce concurrent token refreshes per user.
  const existing = inflightTokens.get(cacheKey);
  if (existing) return existing;

  const promise = fetchToken(creds)
    .then((token) => {
      tokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
      return token;
    })
    .catch((err) => {
      tokenCache.delete(cacheKey);
      throw new KrakenAuthError(`Kraken auth failed: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      inflightTokens.delete(cacheKey);
    });
  inflightTokens.set(cacheKey, promise);
  return promise;
}

interface DispatchNode {
  start: string;
  end: string;
}

interface DispatchesData {
  plannedDispatches: DispatchNode[];
  completedDispatches: DispatchNode[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Charging-session envelopes (the only historical IOG dispatch source)
// ──────────────────────────────────────────────────────────────────────────────

interface DeviceListNode {
  __typename: string;
  id: string;
}

interface DevicesListData {
  devices: DeviceListNode[] | null;
}

interface ChargePointDeviceIdCacheEntry {
  deviceId: string | null;
  expiresAt: number;
}

const chargePointIdCache = new Map<string, ChargePointDeviceIdCacheEntry>();

const HOUR_MS = 60 * 60 * 1000;
const DEVICE_ID_TTL_MS = 55 * 60 * 1000;

async function getChargePointDeviceId(
  creds: OctopusCredentials
): Promise<string | null> {
  const now = Date.now();
  const cached = chargePointIdCache.get(creds.accountNumber);
  if (cached && cached.expiresAt > now) return cached.deviceId;

  const token = await getToken(creds);
  const data = await gqlFetch<DevicesListData>(
    `query Devices($accountNumber: String!) {
       devices(accountNumber: $accountNumber) {
         __typename
         id
       }
     }`,
    { accountNumber: creds.accountNumber },
    token
  );

  const chargePoint =
    data.devices?.find((d) => d.__typename === "SmartFlexChargePoint") ?? null;
  const deviceId = chargePoint?.id ?? null;
  chargePointIdCache.set(creds.accountNumber, {
    deviceId,
    expiresAt: Date.now() + DEVICE_ID_TTL_MS,
  });
  return deviceId;
}

interface ChargingSessionNode {
  start: string;
  end: string;
  type?: "PUBLIC" | "SMART" | "BOOST";
  energyAdded?: { value: string; unit: string } | null;
}

interface ChargingSessionEdge {
  node: ChargingSessionNode;
}

interface ChargingSessionsData {
  devices: Array<{
    chargingSessions: { edges: ChargingSessionEdge[] } | null;
  }> | null;
}

/** EV charging session with charger-reported energy (from Ohme integration). */
export interface ChargingSessionInfo {
  start: Date;
  end: Date;
  /** kWh added by the charger (EV only, not whole house). */
  energyAddedKwh: number;
}

async function getChargingSessionEnvelopes(
  creds: OctopusCredentials,
  rangeStart: Date,
  rangeEnd: Date
): Promise<{
  dispatches: DispatchInterval[];
  chargingSessions: ChargingSessionInfo[];
  error: string | null;
}> {
  try {
    const deviceId = await getChargePointDeviceId(creds);
    if (!deviceId) return { dispatches: [], chargingSessions: [], error: null };

    const token = await getToken(creds);

    const before = new Date(rangeEnd.getTime() + 24 * HOUR_MS).toISOString();
    const after = new Date(rangeStart.getTime() - 24 * HOUR_MS).toISOString();

    const data = await gqlFetch<ChargingSessionsData>(
      `query ChargingSessions($accountNumber: String!, $deviceId: String!, $after: DateTime!, $before: DateTime!) {
         devices(accountNumber: $accountNumber, deviceId: $deviceId) {
           ... on SmartFlexChargePoint {
             chargingSessions(after: $after, before: $before, last: 100) {
               edges { node { start end ... on SmartFlexChargingSession {
                 type
                 energyAdded { value unit }
               } } }
             }
           }
         }
       }`,
      {
        accountNumber: creds.accountNumber,
        deviceId,
        after,
        before,
      },
      token
    );

    const edges = data.devices?.[0]?.chargingSessions?.edges ?? [];
    const rs = rangeStart.getTime();
    const re = rangeEnd.getTime();
    const dispatches: DispatchInterval[] = [];
    const chargingSessions: ChargingSessionInfo[] = [];
    for (const e of edges) {
      if (e.node.type && e.node.type !== "SMART") continue;
      const start = new Date(e.node.start);
      const end = new Date(e.node.end);
      if (end.getTime() <= rs || start.getTime() >= re) continue;
      dispatches.push({ start, end, source: "completed" as const });

      // Extract charger-reported energy (from Ohme integration).
      const rawKwh = e.node.energyAdded?.value;
      if (rawKwh != null) {
        const kwh = parseFloat(rawKwh);
        if (Number.isFinite(kwh) && kwh > 0) {
          chargingSessions.push({ start, end, energyAddedKwh: kwh });
        }
      }
    }
    return { dispatches, chargingSessions, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[octopus] charging-session fetch failed:", message);
    return { dispatches: [], chargingSessions: [], error: message };
  }
}

async function getLiveDispatches(
  creds: OctopusCredentials,
  rangeStart: Date,
  rangeEnd: Date
): Promise<{ dispatches: DispatchInterval[]; error: string | null }> {
  try {
    const token = await getToken(creds);
    const data = await gqlFetch<DispatchesData>(
      `query Dispatches($accountNumber: String!) {
         plannedDispatches(accountNumber: $accountNumber)  { start end }
         completedDispatches(accountNumber: $accountNumber) { start end }
       }`,
      { accountNumber: creds.accountNumber },
      token
    );

    const rs = rangeStart.getTime();
    const re = rangeEnd.getTime();
    const dispatches: DispatchInterval[] = [
      ...data.completedDispatches.map((d) => ({
        start: new Date(d.start),
        end: new Date(d.end),
        source: "completed" as const,
      })),
      ...data.plannedDispatches.map((d) => ({
        start: new Date(d.start),
        end: new Date(d.end),
        source: "planned" as const,
      })),
    ].filter((d) => d.start.getTime() < re && d.end.getTime() > rs);

    return { dispatches, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[octopus] live dispatch fetch failed:", message);
    return { dispatches: [], error: message };
  }
}

/** Merge and coalesce overlapping/contiguous dispatch intervals.
 *  When merging, 'completed' source wins over 'planned'. */
function mergeIntervals(intervals: DispatchInterval[]): DispatchInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const out: DispatchInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
      if (cur.source === "completed") last.source = "completed";
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export async function getDispatches(
  creds: OctopusCredentials,
  rangeStart: Date,
  rangeEnd: Date
): Promise<{
  dispatches: DispatchInterval[];
  chargingSessions: ChargingSessionInfo[];
  error: string | null;
}> {
  const [live, envelopes] = await Promise.all([
    getLiveDispatches(creds, rangeStart, rangeEnd),
    getChargingSessionEnvelopes(creds, rangeStart, rangeEnd),
  ]);

  const merged = mergeIntervals([...live.dispatches, ...envelopes.dispatches]);
  const error =
    live.dispatches.length === 0 && envelopes.dispatches.length === 0
      ? live.error ?? envelopes.error
      : null;

  return {
    dispatches: merged,
    chargingSessions: envelopes.chargingSessions,
    error,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Smart meter telemetry (live half-hourly consumption)
// ──────────────────────────────────────────────────────────────────────────────

interface AccountDevicesData {
  account: {
    properties: Array<{
      electricityMeterPoints: Array<{
        mpan: string;
        meters: Array<{
          serialNumber: string;
          smartDevices: Array<{
            deviceId: string;
            type: string;
          }>;
        }>;
      }>;
    }> | null;
  } | null;
}

interface DeviceIdCacheEntry {
  deviceId: string;
  expiresAt: number;
}

const deviceIdCache = new Map<string, DeviceIdCacheEntry>();

async function getSmartMeterDeviceId(
  creds: OctopusCredentials
): Promise<string> {
  const now = Date.now();
  const cached = deviceIdCache.get(creds.accountNumber);
  if (cached && cached.expiresAt > now) return cached.deviceId;

  const token = await getToken(creds);
  const data = await gqlFetch<AccountDevicesData>(
    `query AccountDevices($accountNumber: String!) {
       account(accountNumber: $accountNumber) {
         properties {
           electricityMeterPoints {
             mpan
             meters {
               serialNumber
               smartDevices { deviceId type }
             }
           }
         }
       }
     }`,
    { accountNumber: creds.accountNumber },
    token
  );

  for (const p of data.account?.properties ?? []) {
    for (const emp of p.electricityMeterPoints ?? []) {
      for (const m of emp.meters ?? []) {
        for (const d of m.smartDevices ?? []) {
          if (d.type === "ESME") {
            deviceIdCache.set(creds.accountNumber, {
              deviceId: d.deviceId,
              expiresAt: Date.now() + DEVICE_ID_TTL_MS,
            });
            return d.deviceId;
          }
        }
      }
    }
  }
  throw new Error(
    `No ESME smart device found on account ${creds.accountNumber}. ` +
      `The meter may not be a smart meter, or not yet linked to Kraken.`
  );
}

interface SmartTelemetryNode {
  readAt: string;
  consumptionDelta: string | number | null;
}

interface SmartTelemetryData {
  smartMeterTelemetry: SmartTelemetryNode[] | null;
}

const HALF_HOUR_MS = 30 * 60 * 1000;

export async function getTodayTelemetry(
  creds: OctopusCredentials,
  rangeStart: Date,
  rangeEnd: Date
): Promise<{ readings: ConsumptionReading[]; error: string | null }> {
  try {
    const deviceId = await getSmartMeterDeviceId(creds);
    const token = await getToken(creds);
    const data = await gqlFetch<SmartTelemetryData>(
      `query Telemetry($deviceId: String!, $start: DateTime!, $end: DateTime!) {
         smartMeterTelemetry(deviceId: $deviceId, start: $start, end: $end, grouping: HALF_HOURLY) {
           readAt
           consumptionDelta
         }
       }`,
      {
        deviceId,
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
      token
    );

    const nodes = data.smartMeterTelemetry ?? [];
    const readings: ConsumptionReading[] = [];
    for (const n of nodes) {
      if (n.consumptionDelta == null) continue;
      const wh = typeof n.consumptionDelta === "string"
        ? parseFloat(n.consumptionDelta)
        : n.consumptionDelta;
      if (!Number.isFinite(wh)) continue;
      const start = new Date(n.readAt);
      const end = new Date(start.getTime() + HALF_HOUR_MS);
      readings.push({
        consumption: wh / 1000,
        interval_start: start.toISOString(),
        interval_end: end.toISOString(),
      });
    }
    return { readings, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[octopus] smart telemetry fetch failed:", message);
    return { readings: [], error: message };
  }
}

export { KrakenAuthError };
