"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
} from "recharts";
import type { MonthlySummaryCompact } from "@/lib/types";

function formatPounds(p: number): string {
  return `£${(p / 100).toFixed(0)}`;
}

interface YearlyChartProps {
  months: MonthlySummaryCompact[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border px-4 py-3 text-sm shadow-2xl" style={{ background: "rgba(14,16,25,0.95)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
      <p className="font-mono text-sm font-semibold text-foreground">{d.label as string} 2026</p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-6"><span>Total Cost</span><span className="tabular-nums font-mono text-foreground">£{((d.totalCostPence as number) / 100).toFixed(2)}</span></div>
        <div className="flex justify-between gap-6"><span>Total Usage</span><span className="tabular-nums font-mono text-foreground">{(d.totalKwh as number).toFixed(0)} kWh</span></div>
        <div className="flex justify-between gap-6"><span>Off-Peak</span><span className="tabular-nums font-mono text-off-peak">{d.offPeakPercentage as number}%</span></div>
        <div className="flex justify-between gap-6"><span>Avg Daily</span><span className="tabular-nums font-mono text-foreground">£{((d.avgDailyCostPence as number) / 100).toFixed(2)}</span></div>
        <div className="flex justify-between gap-6"><span>Saved</span><span className="tabular-nums font-mono gradient-text-green">{formatPounds(d.savingsPence as number)}</span></div>
      </div>
    </div>
  );
}

function CustomLegend() {
  return (
    <div className="flex items-center justify-center gap-5 pt-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "linear-gradient(135deg, #60A5FA, #3B82F6)" }} />
        <span className="text-muted-foreground">Monthly Cost</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 rounded-full bg-green-400" />
        <span className="text-muted-foreground">kWh</span>
      </div>
    </div>
  );
}

export default function YearlyChart({ months }: YearlyChartProps) {
  const chartData = months.map((m) => ({
    ...m,
    costPounds: m.totalCostPence / 100,
  }));

  return (
    <div className="glass-card animate-fade-up rounded-2xl p-4 md:p-6" style={{ animationDelay: "240ms" }}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Yearly Overview</h2>
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
          12 months
        </span>
      </div>
      <div className="h-[300px] md:h-[380px]" role="img" aria-label="Yearly electricity cost overview by month">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-yearly-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="grad-yearly-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#8A8F9E", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
            <YAxis yAxisId="cost" tick={{ fill: "#8A8F9E", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `£${v.toFixed(0)}`} width={44} />
            <YAxis yAxisId="kwh" orientation="right" tick={{ fill: "#8A8F9E", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}`} width={40} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
            <Legend content={<CustomLegend />} />
            <Area yAxisId="kwh" type="monotone" dataKey="totalKwh" fill="url(#grad-yearly-area)" stroke="none" />
            <Bar yAxisId="cost" dataKey="costPounds" fill="url(#grad-yearly-bar)" radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={800} />
            <Line yAxisId="kwh" type="monotone" dataKey="totalKwh" stroke="#4ADE80" strokeWidth={2} dot={{ r: 3, fill: "#4ADE80", stroke: "#050509", strokeWidth: 2 }} activeDot={{ r: 5, fill: "#4ADE80", stroke: "#050509", strokeWidth: 2 }} animationDuration={1000} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
