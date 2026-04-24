"use client";

import { BatteryCharging, Home } from "lucide-react";

interface EvChargingSplitProps {
  /** Total smart-meter kWh during dispatch windows (whole house). */
  dispatchKwh: number;
  /** Charger-reported EV kWh (from Ohme/SmartFlex). */
  evChargingKwh: number;
  /** Off-peak rate applied to dispatch slots (p/kWh). */
  offPeakRate: number;
}

export default function EvChargingSplit({
  dispatchKwh,
  evChargingKwh,
  offPeakRate,
}: EvChargingSplitProps) {
  // Clamp EV kWh to dispatch total — charger measurement can slightly exceed
  // smart meter due to timing differences.
  const evKwh = Math.min(evChargingKwh, dispatchKwh);
  const householdKwh = Math.max(0, dispatchKwh - evKwh);
  const evPct = dispatchKwh > 0 ? (evKwh / dispatchKwh) * 100 : 0;
  const householdPct = 100 - evPct;

  const evCost = evKwh * offPeakRate;
  const householdCost = householdKwh * offPeakRate;

  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "250ms" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
          <BatteryCharging size={14} className="text-emerald-400" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Dispatch Breakdown
        </h2>
      </div>

      {/* Stacked bar */}
      <div className="mb-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {evPct > 0 && (
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${evPct}%` }}
            />
          )}
          {householdPct > 0 && (
            <div
              className="h-full bg-amber-500/60 transition-all duration-500"
              style={{ width: `${householdPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Legend / details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BatteryCharging size={11} />
              EV Charging
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {evKwh.toFixed(1)} kWh
            </span>
            <span className="w-16 text-right font-mono text-xs tabular-nums text-muted-foreground">
              £{(evCost / 100).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Home size={11} />
              Household
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {householdKwh.toFixed(1)} kWh
            </span>
            <span className="w-16 text-right font-mono text-xs tabular-nums text-muted-foreground">
              £{(householdCost / 100).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/60">
        EV energy reported by charger (Ohme) during dispatch windows. Household
        is the remaining smart meter usage.
      </p>
    </div>
  );
}
