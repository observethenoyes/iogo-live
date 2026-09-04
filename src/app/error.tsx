"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Wand2 } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // This page can't branch on *what* went wrong: Next redacts Server Component
  // error messages in production and sends the client only `digest`, so the
  // old `error.message.includes("Missing required environment")` check never
  // matched outside dev. Missing self-hosted env vars now redirect straight to
  // /setup from the page itself, and /setup stays linked from here because
  // credential and tariff problems are the likeliest cause of a failed render.
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="glass-card max-w-lg rounded-2xl p-6 md:p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            Something went wrong
          </h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          The dashboard couldn&rsquo;t load your data.
        </p>
        {error.digest && (
          <p className="mb-5 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={reset}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
          >
            <RefreshCw size={14} />
            Try again
          </button>
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06]"
          >
            <Wand2 size={14} />
            Check setup
          </Link>
        </div>
      </div>
    </div>
  );
}
