"use client";

import { useState, useTransition } from "react";
import { Zap, Mail, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { signIn } from "@/app/actions/auth";

export default function LoginPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSent(true);
      }
    });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Zap size={24} className="text-primary" />
            <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-lg" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground">
              IOG Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to view your energy data
            </p>
          </div>
        </div>

        {sent ? (
          /* Success state */
          <div className="glass-card rounded-2xl p-6 text-center">
            <CheckCircle2
              size={32}
              className="mx-auto mb-3 text-emerald-400"
            />
            <h2 className="text-base font-semibold text-foreground">
              Check your email
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent you a magic link. Click it to sign in — no password
              needed.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setError(null);
              }}
              className="mt-4 text-xs text-primary underline underline-offset-2"
            >
              Try a different email
            </button>
          </div>
        ) : (
          /* Login form */
          <form
            onSubmit={handleSubmit}
            className="glass-card space-y-4 rounded-2xl p-6"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Sending link...
                </>
              ) : (
                <>
                  Send magic link
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-muted-foreground">
              No password needed — we&rsquo;ll email you a sign-in link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
