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

/**
 * Best-effort client IP for rate-limit keying.
 *
 * `x-forwarded-for` is client-supplied unless a proxy you control overwrites
 * it, so a determined caller can rotate this value and sidestep a per-IP
 * limit. Treat IP keying as friction against casual scripting, not as a
 * security control — prefer `rateLimitKey()` wherever a real identity exists.
 * If you front this with nginx/Caddy/Traefik, make sure it *sets* rather than
 * appends the header.
 */
type HeaderLike = { get(name: string): string | null };

export function clientIp(headers: HeaderLike): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Prefer a stable authenticated identity over a spoofable IP. Falls back to
 * the IP when there's no session (self-hosted mode, or pre-login endpoints).
 */
export function rateLimitKey(
  headers: HeaderLike,
  userId: string | null
): string {
  return userId ? `user:${userId}` : `ip:${clientIp(headers)}`;
}
