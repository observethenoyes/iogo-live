import { NextResponse } from "next/server";
import { z } from "zod";
import { DiscoveryError, discoverAccount } from "@/lib/octopus/account-discovery";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Never cache — this endpoint is specifically for onboarding and
// reconfiguration, where the caller expects a fresh read every time.
export const dynamic = "force-dynamic";

const DiscoverBodySchema = z.object({
  apiKey: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const { ok, retryAfterSec } = rateLimit(`discover:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 }
    );
  }

  const parsed = DiscoverBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "`apiKey` and `accountNumber` are required." },
      { status: 400 }
    );
  }

  try {
    const result = await discoverAccount({
      apiKey: parsed.data.apiKey,
      accountNumber: parsed.data.accountNumber.toUpperCase(),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DiscoveryError) {
      // All client-fixable discovery failures share a single 422 so response
      // status can't be used to enumerate which of {bad-credentials,
      // not-found, not-iog, no-electricity, ...} applies. The message still
      // reflects the specific problem so the legitimate user can correct it.
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      );
    }
    console.error("[api/setup/discover] unhandled error:", err);
    return NextResponse.json(
      { error: "Discovery failed. Please try again." },
      { status: 500 }
    );
  }
}
