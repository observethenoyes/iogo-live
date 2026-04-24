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

  const isMissingEnv =
    error.message.includes("Missing required environment") ||
    error.message.includes("Visit /setup");

  const heading = isMissingEnv
    ? "Configuration needed"
    : "Something went wrong";

  const description = isMissingEnv
    ? "Connect your Octopus Energy account to start viewing your energy data."
    : "The dashboard couldn't load your data.";

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="glass-card max-w-lg rounded-2xl p-6 md:p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">{heading}</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        {!isMissingEnv && (
          <pre className="mb-5 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-black/30 p-3 text-xs text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {isMissingEnv && (
            <Link
              href="/setup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
            >
              <Wand2 size={14} />
              Run setup
            </Link>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06] cursor-pointer"
          >
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
