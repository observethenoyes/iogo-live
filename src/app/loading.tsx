import { Zap } from "lucide-react";

/**
 * Route-level loading UI. Streams in while the Server Component on `/` is
 * fetching consumption + rates + dispatches from Octopus. The header is fully
 * rendered (so the brand/title don't pop in) and the body shows shimmer
 * placeholders matching the real layout to avoid CLS when the data arrives.
 */
export default function Loading() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* ── Header (matches Dashboard) ── */}
      <header
        className="relative z-10 border-b border-white/[0.06]"
        style={{
          background: "rgba(5, 5, 9, 0.6)",
          backdropFilter: "blur(20px) saturate(1.3)",
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
              <Zap size={16} className="text-primary" />
              <div className="absolute inset-0 rounded-xl bg-primary/10 blur-md" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                IOG Dashboard
              </h1>
              <p className="text-[10px] text-muted-foreground">
                Octopus Intelligent Go
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {/* Range selector + date navigator placeholders */}
            <div className="skeleton h-9 w-[260px] rounded-xl" />
            <div className="skeleton h-9 w-[220px] rounded-xl" />
          </div>
        </div>
      </header>

      <main
        className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="space-y-5">
          {/* ── KPI grid: 2 cols mobile, 4 cols desktop (matches RangeKpiCards) ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl p-4 md:p-5">
                <div className="skeleton mb-3 h-4 w-20 rounded" />
                <div className="skeleton mb-2 h-7 w-28 rounded" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
            ))}
          </div>

          {/* ── Chart ── */}
          <div className="glass-card rounded-2xl p-4 md:p-6">
            <div className="skeleton mb-4 h-5 w-48" />
            <div className="skeleton h-[300px] md:h-[380px] rounded-xl" />
          </div>

          {/* ── Three side-by-side cards (timeline / breakdown / rates) ── */}
          <div className="grid gap-5 md:grid-cols-3">
            <div className="glass-card rounded-2xl p-4 md:p-6">
              <div className="skeleton mb-4 h-5 w-32" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton h-12 rounded-xl" />
                ))}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4 md:p-6">
              <div className="skeleton mb-4 h-5 w-36" />
              <div className="skeleton mx-auto h-[200px] w-[200px] rounded-full" />
            </div>
            <div className="glass-card rounded-2xl p-4 md:p-6">
              <div className="skeleton mb-4 h-5 w-28" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton h-8 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
