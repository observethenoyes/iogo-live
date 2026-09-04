"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
import type { DailySummary } from "@/lib/types";

const GRADIENT_MAP: Record<string, string> = {
  "off-peak": "url(#grad-off-peak)",
  peak: "url(#grad-peak)",
  dispatch: "url(#grad-dispatch)",
};

const COLORS: Record<string, string> = {
  "off-peak": "#22C55E",
  peak: "#F97316",
  dispatch: "#8B5CF6",
};

const GLOW: Record<string, string> = {
  "off-peak": "rgba(34,197,94,0.4)",
  peak: "rgba(249,115,22,0.4)",
  dispatch: "rgba(139,92,246,0.4)",
};

interface LiveChartProps {
  summary: DailySummary & { liveSlotIndex: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border px-4 py-3 text-sm shadow-2xl" style={{ background: "rgba(14,16,25,0.95)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
      <p className="font-mono text-sm font-semibold text-foreground">{d.fullTime as string}</p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-6"><span>Usage</span><span className="tabular-nums font-mono text-foreground">{(d.kwh as number).toFixed(2)} kWh</span></div>
        <div className="flex justify-between gap-6"><span>Cost</span><span className="tabular-nums font-mono text-foreground">{(d.cost as number).toFixed(1)}p</span></div>
      </div>
    </div>
  );
}

export default function LiveChart({ summary }: LiveChartProps) {
  const nowTime = summary.slots[summary.liveSlotIndex]?.localStart ?? "14:00";

  const chartData = summary.slots.map((slot, i) => ({
    time: slot.localStart,
    kwh: slot.consumptionKwh,
    classification: slot.classification,
    cost: slot.cost,
    fullTime: `${slot.localStart} – ${slot.localEnd}`,
    isFuture: i > summary.liveSlotIndex,
  }));

  return (
    <div className="glass-card animate-fade-up rounded-2xl p-4 md:p-6" style={{ animationDelay: "240ms" }}>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Live Consumption</h2>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
            <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
          </span>
        </div>
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
          Updated just now
        </span>
      </div>
      <div className="h-[300px] md:h-[380px]" role="img" aria-label="Live consumption bar chart showing today's usage so far">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-off-peak" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ADE80" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="grad-peak" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FB923C" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#F97316" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="grad-dispatch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: "#8A8F9E", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} interval={3} />
            <YAxis tick={{ fill: "#8A8F9E", fontSize: 10 }} tickLine={false} axisLine={false} />
            <ReferenceLine x={nowTime} stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 2" label={{ value: "NOW", position: "top", fill: "#3B82F6", fontSize: 10, fontWeight: 600 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
            <Legend content={() => (
              <div className="flex items-center justify-center gap-5 pt-3 text-sm">
                {(["off-peak", "peak", "dispatch"] as const).map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[c], boxShadow: `0 0 8px ${GLOW[c]}` }} />
                    <span className="text-muted-foreground capitalize">{c.replace("-", "-")}</span>
                  </div>
                ))}
              </div>
            )} />
            <Bar dataKey="kwh" radius={[4, 4, 0, 0]} maxBarSize={12} animationDuration={800}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isFuture ? "rgba(255,255,255,0.03)" : GRADIENT_MAP[entry.classification]}
                  opacity={entry.isFuture ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
