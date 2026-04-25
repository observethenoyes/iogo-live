"use client";

import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import type { TariffComparisonData } from "./Dashboard";

function pctDiff(base: number, other: number): number {
  if (base === 0) return 0;
  return ((other - base) / base) * 100;
}

function Badge({
  pct,
  label,
}: {
  pct: number;
  label: "cheaper" | "more";
}) {
  const isSaving = pct < 0;
  const absPct = Math.abs(pct);
  if (absPct < 0.5) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        isSaving
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {isSaving ? (
        <ArrowDownRight size={10} />
      ) : (
        <ArrowUpRight size={10} />
      )}
      {absPct.toFixed(0)}% {isSaving ? label : label}
    </span>
  );
}

export default function TariffComparison({
  data,
}: {
  data: TariffComparisonData;
}) {
  const iogTotal = data.iogCostPence + data.standingChargePence;

  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "350ms" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Scale size={14} className="text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Tariff Comparison
        </h2>
      </div>

      <div className="space-y-2.5">
        {/* IOG (current) */}
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-primary">
              Intelligent Octopus Go
            </p>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Your tariff
            </span>
          </div>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
            £{(iogTotal / 100).toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            £{(data.iogCostPence / 100).toFixed(2)} consumption + £{(data.standingChargePence / 100).toFixed(2)} standing
          </p>
        </div>

        {/* Flexible */}
        {data.flexible && (() => {
          const flexTotal = data.flexible.costPence + data.standingChargePence;
          const pct = pctDiff(iogTotal, flexTotal);
          return (
            <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground/80">
                  {data.flexible.name}
                </p>
                <Badge pct={pct} label={pct < 0 ? "cheaper" : "more"} />
              </div>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                £{(flexTotal / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Flat rate: {data.flexible.ratePence.toFixed(2)}p/kWh
              </p>
            </div>
          );
        })()}

        {/* Agile */}
        {data.agile ? (() => {
          const agileTotal = data.agile.costPence + data.standingChargePence;
          const pct = pctDiff(iogTotal, agileTotal);
          return (
            <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground/80">
                  {data.agile.name}
                </p>
                <Badge pct={pct} label={pct < 0 ? "cheaper" : "more"} />
              </div>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                £{(agileTotal / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Half-hourly variable rates
              </p>
            </div>
          );
        })() : (
          <div className="rounded-lg border border-dashed border-white/[0.06] bg-black/10 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              Agile Octopus
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Not available — Octopus hasn&apos;t published Agile rates for
              your region on this date, or coverage was incomplete.
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/60">
        What this day would have cost on other tariffs, using your actual consumption.
      </p>
    </div>
  );
}
