"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DailySummary } from "@/lib/types";

function formatPenceToPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

interface SegmentData {
  name: string;
  value: number;
  color: string;
  glowColor: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SegmentData }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl border px-3 py-2.5 text-sm shadow-2xl"
      style={{
        background: "rgba(14, 16, 25, 0.95)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: d.color,
            boxShadow: `0 0 6px ${d.glowColor}`,
          }}
        />
        <span className="text-foreground">{d.name}</span>
        <span className="tabular-nums font-mono font-semibold text-foreground">
          {formatPenceToPounds(d.value)}
        </span>
      </div>
    </div>
  );
}

export default function CostBreakdown({
  summary,
}: {
  summary: DailySummary;
}) {
  const offPeakCost = summary.slots
    .filter((s) => s.classification === "off-peak")
    .reduce((sum, s) => sum + s.cost, 0);
  const peakCost = summary.slots
    .filter((s) => s.classification === "peak")
    .reduce((sum, s) => sum + s.cost, 0);
  const dispatchCost = summary.slots
    .filter((s) => s.classification === "dispatch")
    .reduce((sum, s) => sum + s.cost, 0);

  const data: SegmentData[] = [
    {
      name: "Peak",
      value: Math.round(peakCost * 100) / 100,
      color: "#F97316",
      glowColor: "rgba(249, 115, 22, 0.4)",
    },
    {
      name: "Off-Peak",
      value: Math.round(offPeakCost * 100) / 100,
      color: "#22C55E",
      glowColor: "rgba(34, 197, 94, 0.4)",
    },
    {
      name: "Dispatch",
      value: Math.round(dispatchCost * 100) / 100,
      color: "#8B5CF6",
      glowColor: "rgba(139, 92, 246, 0.4)",
    },
    {
      name: "Standing",
      value: summary.standingChargePence,
      color: "#64748B",
      glowColor: "rgba(100, 116, 139, 0.3)",
    },
  ];

  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "420ms" }}
    >
      <h2 className="mb-4 text-base font-semibold text-foreground">
        Cost Breakdown
      </h2>
      <div className="flex flex-col items-center">
        <div className="relative h-[200px] w-[200px]">
          {/* Ambient glow behind donut */}
          <div
            className="pointer-events-none absolute inset-4 rounded-full opacity-30 blur-2xl"
            style={{
              background:
                "conic-gradient(#F97316, #22C55E, #8B5CF6, #64748B, #F97316)",
            }}
          />
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
              <defs>
                <linearGradient id="donut-peak" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FB923C" />
                  <stop offset="100%" stopColor="#F97316" />
                </linearGradient>
                <linearGradient id="donut-offpeak" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4ADE80" />
                  <stop offset="100%" stopColor="#22C55E" />
                </linearGradient>
                <linearGradient id="donut-dispatch" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" />
                  <stop offset="100%" stopColor="#8B5CF6" />
                </linearGradient>
                <linearGradient id="donut-standing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#64748B" />
                </linearGradient>
              </defs>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                cornerRadius={4}
                animationDuration={1000}
                animationEasing="ease-out"
              >
                {data.map((_, index) => {
                  const gradients = [
                    "url(#donut-peak)",
                    "url(#donut-offpeak)",
                    "url(#donut-dispatch)",
                    "url(#donut-standing)",
                  ];
                  return <Cell key={`cell-${index}`} fill={gradients[index]} />;
                })}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Total
            </span>
            <span className="tabular-nums text-xl font-bold font-mono gradient-text-blue">
              {formatPenceToPounds(summary.totalCostPence)}
            </span>
          </div>
        </div>
        <div className="mt-5 grid w-full grid-cols-2 gap-2.5 text-sm">
          {data.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: item.color,
                  boxShadow: `0 0 6px ${item.glowColor}`,
                }}
              />
              <span className="text-xs text-muted-foreground">{item.name}</span>
              <span className="tabular-nums ml-auto font-mono text-xs font-medium text-foreground">
                {formatPenceToPounds(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
