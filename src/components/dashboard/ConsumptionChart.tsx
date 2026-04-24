"use client";

import { useState } from "react";
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
import type { CostSlot } from "@/lib/mock-data";

type Metric = "kwh" | "cost";

const COLORS: Record<CostSlot["classification"], string> = {
  "off-peak": "#22C55E",
  peak: "#F97316",
  dispatch: "#8B5CF6",
};

const GLOW_COLORS: Record<CostSlot["classification"], string> = {
  "off-peak": "rgba(34, 197, 94, 0.4)",
  peak: "rgba(249, 115, 22, 0.4)",
  dispatch: "rgba(139, 92, 246, 0.4)",
};

// The exact rate is shown on its own row in the tooltip body (`d.rate`), so
// the classification pill just names the bucket — keeps it accurate without
// having to thread per-day rates into this component.
const LABELS: Record<CostSlot["classification"], string> = {
  "off-peak": "Off-Peak",
  peak: "Peak",
  dispatch: "Dispatch",
};

interface ChartDataPoint {
  time: string;
  kwh: number;
  classification: CostSlot["classification"];
  cost: number;
  rate: number;
  fullTime: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm shadow-2xl"
      style={{
        background: "rgba(14, 16, 25, 0.95)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="font-mono text-sm font-semibold text-foreground">
        {d.fullTime}
      </p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <div className="flex items-center justify-between gap-6">
          <span>Usage</span>
          <span className="tabular-nums font-mono text-foreground">
            {d.kwh.toFixed(2)} kWh
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Rate</span>
          <span className="tabular-nums font-mono text-foreground">
            {d.rate}p/kWh
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Cost</span>
          <span className="tabular-nums font-mono text-foreground">
            {d.cost.toFixed(1)}p
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 border-t border-white/5 pt-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: COLORS[d.classification],
              boxShadow: `0 0 6px ${GLOW_COLORS[d.classification]}`,
            }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: COLORS[d.classification] }}
          >
            {LABELS[d.classification]}
          </span>
        </div>
      </div>
    </div>
  );
}

function CustomLegend() {
  const items: { classification: CostSlot["classification"]; label: string }[] =
    [
      { classification: "off-peak", label: "Off-Peak" },
      { classification: "peak", label: "Peak" },
      { classification: "dispatch", label: "Dispatch" },
    ];

  return (
    <div className="flex items-center justify-center gap-5 pt-3 text-sm">
      {items.map((item) => (
        <div key={item.classification} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: COLORS[item.classification],
              boxShadow: `0 0 8px ${GLOW_COLORS[item.classification]}`,
            }}
          />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

interface ConsumptionChartProps {
  slots: CostSlot[];
  /** Daily standing charge in pence to spread across 48 slots (0 = not included). */
  standingChargePence?: number;
}

export default function ConsumptionChart({
  slots,
  standingChargePence = 0,
}: ConsumptionChartProps) {
  const [metric, setMetric] = useState<Metric>("kwh");

  // Spread standing charge evenly across all 48 half-hour slots when showing cost.
  const scPerSlot = standingChargePence / 48;

  const chartData: ChartDataPoint[] = slots.map((slot) => ({
    time: slot.localStart,
    kwh: slot.consumptionKwh,
    classification: slot.classification,
    cost: slot.cost + scPerSlot,
    rate: slot.rateApplied,
    fullTime: `${slot.localStart} – ${slot.localEnd}`,
  }));

  const isCost = metric === "cost";
  // Bars that show cost look flat in pounds (each slot is typically a few
  // pence), so keep cost in pence and label the axis accordingly.
  const yAxisLabel = isCost ? "pence" : "kWh";
  const yTickFormatter = isCost
    ? (v: number) => `${Math.round(v)}p`
    : (v: number) => `${v}`;

  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "240ms" }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Half-Hourly {isCost ? "Cost" : "Consumption"}
        </h2>
        <div
          role="tablist"
          aria-label="Chart metric"
          className="flex items-center rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5 text-xs"
        >
          {(["kwh", "cost"] as const).map((m) => {
            const active = metric === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetric(m)}
                className={`rounded-full px-3 py-1 font-medium transition-colors duration-150 ${
                  active
                    ? "bg-white/[0.08] text-foreground shadow-[0_0_12px_rgba(255,255,255,0.04)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "kwh" ? "kWh" : "Cost"}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="h-[300px] md:h-[380px]"
        role="img"
        aria-label={`Bar chart showing electricity ${
          isCost ? "cost in pence" : "consumption in kWh"
        } across 48 half-hour slots. ${slots.length} slots displayed with peak, off-peak, and dispatch rate colouring.`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
          >
            <defs>
              {/* Gradient fills for each bar type */}
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
              {/* Glow filters */}
              <filter id="glow-green">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feFlood floodColor="#22C55E" floodOpacity="0.3" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.03)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "#8A8F9E", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              interval={3}
            />
            <YAxis
              tick={{ fill: "#8A8F9E", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yTickFormatter}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                offset: 24,
                fill: "#8A8F9E",
                fontSize: 11,
              }}
            />
            {/* Off-peak window markers */}
            <ReferenceLine
              x="23:30"
              stroke="rgba(34, 197, 94, 0.15)"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              x="05:30"
              stroke="rgba(34, 197, 94, 0.15)"
              strokeDasharray="4 4"
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.02)" }}
            />
            <Legend content={<CustomLegend />} />
            <Bar
              dataKey={metric}
              radius={[4, 4, 0, 0]}
              maxBarSize={12}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => {
                const gradientMap: Record<string, string> = {
                  "off-peak": "url(#grad-off-peak)",
                  peak: "url(#grad-peak)",
                  dispatch: "url(#grad-dispatch)",
                };
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={gradientMap[entry.classification]}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
