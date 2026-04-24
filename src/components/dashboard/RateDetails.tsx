"use client";

import { Info } from "lucide-react";

interface RateDetailsProps {
  offPeakRate: number;
  peakRate: number;
  standingCharge: number;
}

export default function RateDetails({
  offPeakRate,
  peakRate,
  standingCharge,
}: RateDetailsProps) {
  const rates = [
    {
      label: "Off-Peak Rate",
      value: `${offPeakRate}p/kWh`,
      time: "23:30 – 05:30",
      color: "#22C55E",
      glowColor: "rgba(34, 197, 94, 0.4)",
      gradientClass: "gradient-text-green",
    },
    {
      label: "Peak Rate",
      value: `${peakRate}p/kWh`,
      time: "05:30 – 23:30",
      color: "#F97316",
      glowColor: "rgba(249, 115, 22, 0.4)",
      gradientClass: "gradient-text-orange",
    },
    {
      label: "Standing Charge",
      value: `${standingCharge}p/day`,
      time: "Daily",
      color: "#64748B",
      glowColor: "rgba(100, 116, 139, 0.3)",
      gradientClass: "",
    },
  ];

  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "480ms" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">Rates</h2>
        <Info size={14} className="text-muted-foreground" />
      </div>
      <div className="space-y-2.5">
        {rates.map((rate) => (
          <div
            key={rate.label}
            className="group flex items-center justify-between rounded-xl bg-white/[0.02] px-3.5 py-3 transition-all duration-200 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-2 w-2 rounded-full pulse-dot"
                style={{
                  backgroundColor: rate.color,
                  boxShadow: `0 0 8px ${rate.glowColor}`,
                }}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {rate.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{rate.time}</p>
              </div>
            </div>
            <span
              className={`tabular-nums font-mono text-sm font-semibold ${
                rate.gradientClass || "text-foreground"
              }`}
            >
              {rate.value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-dispatch/10 bg-dispatch/[0.04] px-3.5 py-2.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium gradient-text-violet">
            Dispatch slots
          </span>{" "}
          override peak rates with the off-peak rate when Octopus schedules your
          EV charging outside the standard off-peak window.
        </p>
      </div>
    </div>
  );
}
