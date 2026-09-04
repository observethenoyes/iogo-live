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

// Per-user token cache, keyed by API key. LRU-capped so a long-running
// process with many distinct users can't grow it without bound.
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map<string, CachedToken>();
const inflightTokens = new Map<string, Promise<string>>();

function setWithLru<V>(map: Map<string, V>, key: string, value: V, max: number) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function invalidateToken(apiKey: string) {
  tokenCache.delete(apiKey);
}

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

class KrakenTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KrakenTokenExpiredError";
  }
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
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new KrakenTokenExpiredError(`Kraken GraphQL HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`Kraken GraphQL HTTP ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors && body.errors.length > 0) {
    const msg = body.errors.map((e) => e.message).join("; ");
    if (/auth|token|unauthori[sz]ed|jwt/i.test(msg)) {
      throw new KrakenTokenExpiredError(`Kraken GraphQL auth error: ${msg}`);
    }
    throw new Error(`Kraken GraphQL error: ${msg}`);
  }
  if (!body.data) {
    throw new Error("Kraken GraphQL returned no data");
  }
  return body.data;
}

/**
 * Run a GraphQL query with automatic one-shot retry on token expiry. Handles
 * the common case where a cached JWT has been revoked or expired before our
 * TTL estimate.
 */
async function gqlWithRetry<T>(
  creds: OctopusCredentials,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const token = await getToken(creds);
  try {
    return await gqlFetch<T>(query, variables, token);
  } catch (err) {
    if (err instanceof KrakenTokenExpiredError) {
      invalidateToken(creds.apiKey);
      const fresh = await getToken(creds);
      return await gqlFetch<T>(query, variables, fresh);
    }
    throw err;
  }
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
      setWithLru(
        tokenCache,
        cacheKey,
        { token, expiresAt: Date.now() + TOKEN_TTL_MS },
        TOKEN_CACHE_MAX
      );
      return token;
    })
    .catch((err) => {
      tokenCache.delete(cacheKey);
      throw new KrakenAuthError(
        `Kraken auth failed: ${err instanceof Error ? err.message : String(err)}`
      );
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

  const data = await gqlWithRetry<DevicesListData>(
    creds,
    `query Devices($accountNumber: String!) {
       devices(accountNumber: $accountNumber) {
         __typename
         id
       }
     }`,
    { accountNumber: creds.accountNumber }
  );

  const chargePoint =
    data.devices?.find((d) => d.__typename === "SmartFlexChargePoint") ?? null;
  const deviceId = chargePoint?.id ?? null;
  setWithLru(
    chargePointIdCache,
    creds.accountNumber,
    { deviceId, expiresAt: Date.now() + DEVICE_ID_TTL_MS },
    TOKEN_CACHE_MAX
  );
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

// The connection returns at most this many edges per query, and `after` /
// `before` are DateTimes rather than Relay cursors, so there is no way to page
// *within* a window. Long ranges are therefore sliced into windows short
// enough that even a heavy charger (three sessions a day) stays under the cap
// — otherwise a yearly view silently lost every session before the most
// recent hundred, and those days showed no EV split at all.
const SESSION_PAGE_SIZE = 100;
const SESSION_WINDOW_DAYS = 28;

const CHARGING_SESSIONS_QUERY = `query ChargingSessions($accountNumber: String!, $deviceId: String!, $after: DateTime!, $before: DateTime!) {
         devices(accountNumber: $accountNumber, deviceId: $deviceId) {
           ... on SmartFlexChargePoint {
             chargingSessions(after: $after, before: $before, last: ${SESSION_PAGE_SIZE}) {
               edges { node { start end ... on SmartFlexChargingSession {
                 type
                 energyAdded { value unit }
               } } }
             }
           }
         }
       }`;

/** Split [from, to) into windows of at most SESSION_WINDOW_DAYS. */
function sessionWindows(from: Date, to: Date): Array<{ after: string; before: string }> {
  const spanMs = SESSION_WINDOW_DAYS * 24 * HOUR_MS;
  const windows: Array<{ after: string; before: string }> = [];
  for (let start = from.getTime(); start < to.getTime(); start += spanMs) {
    const end = Math.min(start + spanMs, to.getTime());
    windows.push({
      after: new Date(start).toISOString(),
      before: new Date(end).toISOString(),
    });
  }
  return windows;
}

async function fetchSessionEdges(
  creds: OctopusCredentials,
  deviceId: string,
  after: string,
  before: string
): Promise<ChargingSessionEdge[]> {
  const data = await gqlWithRetry<ChargingSessionsData>(
    creds,
    CHARGING_SESSIONS_QUERY,
    { accountNumber: creds.accountNumber, deviceId, after, before }
  );
  const edges = data.devices?.[0]?.chargingSessions?.edges ?? [];
  if (edges.length >= SESSION_PAGE_SIZE) {
    // Shouldn't happen at 28-day windows, but say so rather than under-report.
    console.warn(
      `[octopus] chargingSessions ${after}..${before} hit the ${SESSION_PAGE_SIZE}-edge cap; some sessions in that window were dropped.`
    );
  }
  return edges;
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

    const windows = sessionWindows(
      new Date(rangeStart.getTime() - 24 * HOUR_MS),
      new Date(rangeEnd.getTime() + 24 * HOUR_MS)
    );
    const edgeLists = await Promise.all(
      windows.map((w) => fetchSessionEdges(creds, deviceId, w.after, w.before))
    );

    // A session straddling a window boundary comes back in both, so dedupe on
    // the interval before it gets counted twice.
    const seen = new Set<string>();
    const edges: ChargingSessionEdge[] = [];
    for (const list of edgeLists) {
      for (const e of list) {
        const key = `${e.node.start}|${e.node.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(e);
      }
    }

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
    const data = await gqlWithRetry<DispatchesData>(
      creds,
      `query Dispatches($accountNumber: String!) {
         plannedDispatches(accountNumber: $accountNumber)  { start end }
         completedDispatches(accountNumber: $accountNumber) { start end }
       }`,
      { accountNumber: creds.accountNumber }
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

  const data = await gqlWithRetry<AccountDevicesData>(
    creds,
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
    { accountNumber: creds.accountNumber }
  );

  for (const p of data.account?.properties ?? []) {
    for (const emp of p.electricityMeterPoints ?? []) {
      for (const m of emp.meters ?? []) {
        for (const d of m.smartDevices ?? []) {
          if (d.type === "ESME") {
            setWithLru(
              deviceIdCache,
              creds.accountNumber,
              {
                deviceId: d.deviceId,
                expiresAt: Date.now() + DEVICE_ID_TTL_MS,
              },
              TOKEN_CACHE_MAX
            );
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
    const data = await gqlWithRetry<SmartTelemetryData>(
      creds,
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
      }
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
