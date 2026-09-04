"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, Battery, Leaf, TrendingDown, Clock, CalendarDays } from "lucide-react";
import type { TimeRange } from "@/lib/types";

function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from = prevTarget.current;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

function formatPenceToPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  animatedValue: number;
  format: (n: number) => string;
  gradientClass?: string;
  glowColor?: string;
  subtitle: string;
  delay?: number;
}

function KpiCard({ icon, label, animatedValue, format, gradientClass, glowColor, subtitle, delay = 0 }: KpiCardProps) {
  const animated = useAnimatedNumber(animatedValue);

  return (
    <div className="glass-card glow-hover animate-fade-up group relative flex flex-col gap-2.5 rounded-2xl p-4 md:p-5" style={{ animationDelay: `${delay}ms` }}>
      {glowColor && (
        <div className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `radial-gradient(circle at 50% 0%, ${glowColor}, transparent 70%)` }} />
      )}
      <div className="relative flex items-center gap-2 text-muted-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04]">{icon}</div>
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`relative tabular-nums text-2xl font-semibold font-mono md:text-3xl ${gradientClass ?? "text-foreground"}`}>
        {format(animated)}
      </p>
      <p className="relative text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

interface RangeKpiCardsProps {
  range: TimeRange;
  totalCostPence: number;
  avgCostPence: number;
  totalKwh: number;
  avgKwh: number;
  offPeakPercentage: number;
  totalSavingsPence: number;
  periodLabel: string;
}

export default function RangeKpiCards({
  range,
  totalCostPence,
  avgCostPence,
  totalKwh,
  avgKwh,
  offPeakPercentage,
  totalSavingsPence,
  periodLabel,
}: RangeKpiCardsProps) {
  const isDaily = range === "daily" || range === "live";
  const costLabel = isDaily ? "Total Cost" : "Total Cost";
  const costSubtitle = isDaily
    ? `for ${periodLabel}`
    : `avg ${formatPenceToPounds(avgCostPence)}/day`;
  const usageSubtitle = isDaily
    ? `for ${periodLabel}`
    : `avg ${avgKwh.toFixed(1)} kWh/day`;
  const periodIcon = isDaily ? <Zap size={16} /> : range === "weekly" ? <CalendarDays size={16} /> : <Clock size={16} />;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <KpiCard
        icon={periodIcon}
        label={costLabel}
        animatedValue={totalCostPence}
        format={formatPenceToPounds}
        subtitle={costSubtitle}
        delay={0}
      />
      <KpiCard
        icon={<Battery size={16} />}
        label="Total Usage"
        animatedValue={totalKwh}
        format={(n) => `${n.toFixed(1)} kWh`}
        subtitle={usageSubtitle}
        delay={60}
      />
      <KpiCard
        icon={<Leaf size={16} />}
        label="Off-Peak"
        animatedValue={offPeakPercentage}
        format={(n) => `${Math.round(n)}%`}
        gradientClass="gradient-text-green"
        glowColor="rgba(34, 197, 94, 0.08)"
        subtitle="of total consumption"
        delay={120}
      />
      <KpiCard
        icon={<TrendingDown size={16} />}
        label="Savings"
        animatedValue={totalSavingsPence}
        format={formatPenceToPounds}
        gradientClass="gradient-text-green"
        glowColor="rgba(34, 197, 94, 0.08)"
        subtitle="vs. all-peak pricing"
        delay={180}
      />
    </div>
  );
}
