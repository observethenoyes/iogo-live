"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, Battery, Leaf, TrendingDown } from "lucide-react";
import type { DailySummary } from "@/lib/mock-data";

function formatPenceToPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out expo
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  animatedValue?: number;
  format?: (n: number) => string;
  gradientClass?: string;
  glowColor?: string;
  subtitle?: string;
  delay?: number;
}

function KpiCard({
  icon,
  label,
  value,
  animatedValue,
  format,
  gradientClass,
  glowColor,
  subtitle,
  delay = 0,
}: KpiCardProps) {
  const animated = useAnimatedNumber(animatedValue ?? 0);
  const displayValue =
    animatedValue !== undefined && format ? format(animated) : value;

  return (
    <div
      className="glass-card glow-hover animate-fade-up group relative flex flex-col gap-2.5 rounded-2xl p-4 md:p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle colour glow behind card */}
      {glowColor && (
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${glowColor}, transparent 70%)`,
          }}
        />
      )}

      <div className="relative flex items-center gap-2 text-muted-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04]">
          {icon}
        </div>
        <span className="text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p
        className={`relative tabular-nums text-2xl font-semibold font-mono md:text-3xl ${
          gradientClass ?? "text-foreground"
        }`}
      >
        {displayValue}
      </p>
      {subtitle && (
        <p className="relative text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export default function KpiCards({ summary }: { summary: DailySummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <KpiCard
        icon={<Zap size={16} />}
        label="Total Cost"
        value={formatPenceToPounds(summary.totalCostPence)}
        animatedValue={summary.totalCostPence}
        format={(n) => formatPenceToPounds(n)}
        subtitle={`inc. ${formatPenceToPounds(summary.standingChargePence)} standing`}
        delay={0}
      />
      <KpiCard
        icon={<Battery size={16} />}
        label="Total Usage"
        value={`${summary.totalKwh.toFixed(1)} kWh`}
        animatedValue={summary.totalKwh}
        format={(n) => `${n.toFixed(1)} kWh`}
        subtitle={`${summary.peakKwh.toFixed(1)} peak / ${summary.offPeakKwh.toFixed(1)} off-peak`}
        delay={60}
      />
      <KpiCard
        icon={<Leaf size={16} />}
        label="Off-Peak"
        value={`${summary.offPeakPercentage}%`}
        animatedValue={summary.offPeakPercentage}
        format={(n) => `${Math.round(n)}%`}
        gradientClass="gradient-text-green"
        glowColor="rgba(34, 197, 94, 0.08)"
        subtitle={`${summary.dispatchKwh.toFixed(1)} kWh from dispatches`}
        delay={120}
      />
      <KpiCard
        icon={<TrendingDown size={16} />}
        label="Savings"
        value={formatPenceToPounds(summary.savingsVsAllPeakPence)}
        animatedValue={summary.savingsVsAllPeakPence}
        format={(n) => formatPenceToPounds(n)}
        gradientClass="gradient-text-green"
        glowColor="rgba(34, 197, 94, 0.08)"
        subtitle="vs. all-peak pricing"
        delay={180}
      />
    </div>
  );
}
