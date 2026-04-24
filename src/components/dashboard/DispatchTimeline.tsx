"use client";

import { PlugZap, Clock, Check, CalendarClock } from "lucide-react";
import type { DispatchEvent } from "@/lib/mock-data";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function DispatchTimeline({
  dispatches,
}: {
  dispatches: DispatchEvent[];
}) {
  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "360ms" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dispatch/10">
          <PlugZap size={14} className="text-dispatch" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Smart Charge
        </h2>
      </div>
      {dispatches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No dispatch slots scheduled for this day.
        </p>
      ) : (
        <div className="space-y-3">
          {dispatches.map((d, i) => {
            const isPlanned = d.status === "planned";
            return (
              <div
                key={d.id}
                className={`animate-fade-up group relative rounded-xl border p-3.5 transition-all duration-200 ${
                  isPlanned
                    ? "border-dashed border-dispatch/20 bg-dispatch/[0.02] hover:border-dispatch/30 hover:bg-dispatch/[0.04]"
                    : "border-dispatch/10 bg-dispatch/[0.04] hover:border-dispatch/20 hover:bg-dispatch/[0.07]"
                }`}
                style={{ animationDelay: `${400 + i * 50}ms` }}
              >
                {/* Glow accent line */}
                <div
                  className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-full ${
                    isPlanned
                      ? "bg-dispatch/40"
                      : "bg-dispatch shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                  }`}
                />

                <div className="pl-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                      {d.start} – {d.end}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">
                      <Clock size={10} />
                      {formatDuration(d.durationMinutes)}
                    </span>
                    {d.status && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                          isPlanned
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {isPlanned ? (
                          <CalendarClock size={10} />
                        ) : (
                          <Check size={10} />
                        )}
                        {isPlanned ? "Scheduled" : "Completed"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    <span className="tabular-nums font-mono gradient-text-violet font-medium">
                      {d.estimatedKwh} kWh
                    </span>{" "}
                    charged at off-peak rate
                  </p>
                </div>
              </div>
            );
          })}

          {/* Total summary */}
          <div className="mt-1 flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
            <span className="text-muted-foreground">Total dispatched</span>
            <span className="tabular-nums font-mono font-medium gradient-text-violet">
              {dispatches.reduce((s, d) => s + d.estimatedKwh, 0).toFixed(1)}{" "}
              kWh
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
