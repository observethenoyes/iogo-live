"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import type { TimeRange } from "@/lib/types";
import { addUkDays } from "@/lib/calculator/timezone";

interface DateNavigatorProps {
  range: TimeRange;
  label: string;
  /** YYYY-MM-DD currently being viewed. */
  currentDate: string;
  /** YYYY-MM-DD for "today" — forward arrow is disabled at or past this. */
  todayDate: string;
}

export default function DateNavigator({
  range,
  label,
  currentDate,
  todayDate,
}: DateNavigatorProps) {
  if (range === "live") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 backdrop-blur-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
          <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
        </span>
        <span className="text-sm font-medium text-foreground">Today — Live</span>
      </div>
    );
  }

  // Only the daily view has real navigation wired today — weekly/monthly/yearly
  // still show a static label (their data is mock). Render their buttons as
  // disabled stubs so it's obvious the controls aren't interactive yet.
  const isDaily = range === "daily";
  const prevDate = isDaily ? addUkDays(currentDate, -1) : null;
  const nextDate = isDaily ? addUkDays(currentDate, 1) : null;
  const atToday = currentDate >= todayDate;

  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground active:scale-95 cursor-pointer";
  const disabledClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02] text-muted-foreground/40 cursor-not-allowed";

  return (
    <div className="flex items-center gap-1.5">
      {isDaily && prevDate ? (
        <Link
          href={`/?date=${prevDate}`}
          scroll={false}
          className={buttonClass}
          aria-label="Previous day"
        >
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className={disabledClass}
          aria-label={`Previous ${range}`}
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 backdrop-blur-sm">
        <Calendar size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium tabular-nums text-foreground">
          {label}
        </span>
      </div>

      {isDaily && nextDate && !atToday ? (
        <Link
          href={`/?date=${nextDate}`}
          scroll={false}
          className={buttonClass}
          aria-label="Next day"
        >
          <ChevronRight size={16} />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className={disabledClass}
          aria-label={`Next ${range}`}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
