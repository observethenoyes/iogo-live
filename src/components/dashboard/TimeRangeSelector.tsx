"use client";

import { useRef, useState, useEffect } from "react";
import { Radio, CalendarDays, CalendarRange, Calendar, CalendarClock } from "lucide-react";
import type { TimeRange } from "@/lib/mock-data";

const RANGES: { value: TimeRange; label: string; icon: React.ReactNode }[] = [
  { value: "live", label: "Live", icon: <Radio size={13} /> },
  { value: "daily", label: "Day", icon: <CalendarClock size={13} /> },
  { value: "weekly", label: "Week", icon: <CalendarDays size={13} /> },
  { value: "monthly", label: "Month", icon: <CalendarRange size={13} /> },
  { value: "yearly", label: "Year", icon: <Calendar size={13} /> },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export default function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const idx = RANGES.findIndex((r) => r.value === value);
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-range]");
    const btn = buttons[idx];
    if (btn) {
      setIndicator({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 backdrop-blur-sm"
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-1 bottom-1 rounded-lg bg-white/[0.08] transition-all duration-300"
        style={{
          left: indicator.left,
          width: indicator.width,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {RANGES.map((range) => {
        const isActive = value === range.value;
        const isLive = range.value === "live";
        return (
          <button
            key={range.value}
            data-range={range.value}
            onClick={() => onChange(range.value)}
            className={`relative z-10 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            {isLive && isActive ? (
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
                <span className="relative inline-block h-2 w-2 rounded-full bg-green-400" />
              </span>
            ) : (
              range.icon
            )}
            {range.label}
          </button>
        );
      })}
    </div>
  );
}
