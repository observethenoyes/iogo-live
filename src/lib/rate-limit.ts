import "server-only";

// Per-process sliding-window rate limiter. On Vercel each serverless instance
// holds its own counter so the effective limit is per-instance — still
// meaningful protection against scripted enumeration. For a stricter limit
// across a fleet, swap this for @upstash/ratelimit backed by Redis.

type Bucket = { hits: number[]; lastTouched: number };

const buckets = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  const cutoff = now - Math.max(windowMs, 5 * 60_000);
  for (const [key, bucket] of buckets) {
    if (bucket.lastTouched < cutoff) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [], lastTouched: now };
  bucket.hits = bucket.hits.filter((t) => t > now - windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000)
    );
    bucket.lastTouched = now;
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec };
  }

  bucket.hits.push(now);
  bucket.lastTouched = now;
  buckets.set(key, bucket);
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
