import { NextResponse } from "next/server";
import { DiscoveryError, discoverAccount } from "@/lib/octopus/account-discovery";

// Never cache — this endpoint is specifically for onboarding and
// reconfiguration, where the caller expects a fresh read every time.
export const dynamic = "force-dynamic";

interface DiscoverBody {
  apiKey?: unknown;
  accountNumber?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: DiscoverBody;
  try {
    body = (await request.json()) as DiscoverBody;
  } catch {
    return badRequest("Request body must be JSON.");
  }

  if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    return badRequest("`apiKey` is required.");
  }
  if (typeof body.accountNumber !== "string" || !body.accountNumber.trim()) {
    return badRequest("`accountNumber` is required.");
  }

  try {
    const result = await discoverAccount({
      apiKey: body.apiKey.trim(),
      accountNumber: body.accountNumber.trim().toUpperCase(),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DiscoveryError) {
      // Map discovery failure codes to HTTP status codes. Bad credentials /
      // missing IOG are client-correctable (401/404), upstream/unexpected
      // are server/infra problems (502).
      const status =
        err.code === "bad-credentials"
          ? 401
          : err.code === "not-found"
          ? 404
          : err.code === "no-electricity" ||
            err.code === "no-active-agreement" ||
            err.code === "not-iog"
          ? 422
          : 502;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
