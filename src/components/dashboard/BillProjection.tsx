"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";

interface MonthlyData {
  totalCostPence: number;
  days: Array<{ date: string; totalKwh: number; totalCostPence: number }>;
}

export default function BillProjection({
  todayDate,
}: {
  todayDate: string;
}) {
  const [data, setData] = useState<MonthlyData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/summary?range=monthly&date=${todayDate}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError(true));
  }, [todayDate]);

  // Parse today's position in the calendar month.
  const [, , dayStr] = todayDate.split("-");
  const dayOfMonth = parseInt(dayStr, 10);
  const [yearStr, monthStr] = todayDate.split("-");
  const daysInMonth = new Date(
    parseInt(yearStr, 10),
    parseInt(monthStr, 10),
    0
  ).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const progress = dayOfMonth / daysInMonth;

  if (error) return null;

  // Loading skeleton
  if (!data) {
    return (
      <div
        className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
        style={{ animationDelay: "300ms" }}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Receipt size={14} className="text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Bill Projection
          </h2>
        </div>
        <div className="space-y-3">
          <div className="skeleton h-10 rounded-lg" />
          <div className="skeleton h-3 rounded-full" />
          <div className="skeleton h-4 w-3/4 rounded-lg" />
        </div>
      </div>
    );
  }

  // The monthly API returns a rolling 30-day window. Filter to only days
  // within the current calendar month for an accurate bill projection.
  const monthPrefix = todayDate.slice(0, 7); // "YYYY-MM"
  const thisMonthDays = data.days.filter(
    (d) => d.date.startsWith(monthPrefix) && d.totalKwh > 0
  );
  if (thisMonthDays.length === 0) return null;

  const costSoFar = thisMonthDays.reduce(
    (sum, d) => sum + d.totalCostPence,
    0
  );
  const avgDailyCost = costSoFar / thisMonthDays.length;
  const projectedTotal = avgDailyCost * daysInMonth;

  return (
    <div
      className="glass-card animate-fade-up rounded-2xl p-4 md:p-6"
      style={{ animationDelay: "300ms" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Receipt size={14} className="text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Bill Projection
        </h2>
      </div>

      {/* Big projected number */}
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
          ~£{(projectedTotal / 100).toFixed(2)}
        </span>
        <span className="text-xs text-muted-foreground">projected this month</span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            Day {dayOfMonth} of {daysInMonth}
          </span>
          <span>{daysRemaining} days remaining</span>
        </div>
      </div>

      {/* Cost so far + daily average */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Spent so far
          </p>
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            £{(costSoFar / 100).toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Daily average
          </p>
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            £{(avgDailyCost / 100).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
