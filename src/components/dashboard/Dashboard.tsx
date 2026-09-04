"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Settings, LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { ukSlotIndex } from "@/lib/calculator/timezone";
import type {
  CostSlot,
  DailySummary,
  DailySummaryCompact,
  DispatchEvent,
  MonthlySummaryCompact,
  TimeRange,
} from "@/lib/types";
import RangeKpiCards from "./RangeKpiCards";
import DispatchTimeline from "./DispatchTimeline";
import DateNavigator from "./DateNavigator";
import RateDetails from "./RateDetails";
import TimeRangeSelector from "./TimeRangeSelector";
import TariffExpiryBanner from "./TariffExpiryBanner";
import BillProjection from "./BillProjection";
import TariffComparison from "./TariffComparison";
import EvChargingSplit from "./EvChargingSplit";

const ConsumptionChart = dynamic(() => import("./ConsumptionChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const LiveChart = dynamic(() => import("./LiveChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const RangeChart = dynamic(() => import("./RangeChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const YearlyChart = dynamic(() => import("./YearlyChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const CostBreakdown = dynamic(() => import("./CostBreakdown"), {
  ssr: false,
  loading: () => (
    <div className="glass-card rounded-2xl p-4 md:p-6">
      <div className="skeleton mb-4 h-5 w-36" />
      <div className="skeleton mx-auto h-[200px] w-[200px] rounded-full" />
    </div>
  ),
});

/**
 * Collapse a day's classified slots into the discrete dispatch events the
 * timeline expects. Each run of consecutive `dispatch` slots becomes one
 * event labelled with its UK-local start/end and totalled kWh.
 */
function slotsToDispatchEvents(slots: CostSlot[]): DispatchEvent[] {
  const events: DispatchEvent[] = [];
  let i = 0;
  while (i < slots.length) {
    if (slots[i].classification !== "dispatch") {
      i++;
      continue;
    }
    const startSlot = slots[i];
    let endSlot = slots[i];
    let kwh = 0;
    let hasCompleted = false;
    while (i < slots.length && slots[i].classification === "dispatch") {
      kwh += slots[i].consumptionKwh;
      if (slots[i].dispatchSource === "completed") hasCompleted = true;
      endSlot = slots[i];
      i++;
    }
    const startMs = new Date(startSlot.intervalStart).getTime();
    const endMs = new Date(endSlot.intervalEnd).getTime();
    const durationMinutes = Math.round((endMs - startMs) / 60000);
    events.push({
      id: `dispatch-${startSlot.intervalStart}`,
      start: startSlot.localStart,
      end: endSlot.localEnd,
      durationMinutes,
      estimatedKwh: Math.round(kwh * 10) / 10,
      status: hasCompleted ? "completed" : (startSlot.dispatchSource ?? undefined),
    });
  }
  return events;
}

function ChartSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-4 md:p-6">
      <div className="skeleton mb-4 h-5 w-48" />
      <div className="skeleton h-[300px] md:h-[380px]" />
    </div>
  );
}

export interface TariffComparisonData {
  /** User's actual IOG cost for the day (pence, consumption only — no standing charge). */
  iogCostPence: number;
  flexible: { name: string; costPence: number; ratePence: number } | null;
  agile: { name: string; costPence: number } | null;
  standingChargePence: number;
}

interface DashboardProps {
  dailySummary: DailySummary;
  dateLabel: string;
  /** YYYY-MM-DD currently being viewed (UK local). */
  currentDate: string;
  /** YYYY-MM-DD for "today" in UK local — used to disable the forward arrow. */
  todayDate: string;
  /** Optional initial range from URL `?range=`. */
  initialRange?: TimeRange;
  /** ISO date string — shown as a warning banner if within 30 days. */
  agreementEndDate?: string | null;
  /** Server-computed tariff comparison for the viewed day. */
  tariffComparison?: TariffComparisonData | null;
  /**
   * Current half-hour slot (0–47) as resolved on the server. Passed in rather
   * than computed here so the server render and hydration agree — deriving it
   * from `new Date()` in a lazy useState initialiser runs on both sides and
   * mismatches whenever a half-hour boundary falls between them.
   */
  initialSlotIndex: number;
}

export default function Dashboard({
  dailySummary,
  dateLabel,
  currentDate,
  todayDate,
  initialRange,
  agreementEndDate,
  tariffComparison,
  initialSlotIndex,
}: DashboardProps) {
  const router = useRouter();
  const [range, setRange] = useState<TimeRange>(
    initialRange ?? (currentDate === todayDate ? "live" : "daily")
  );
  const [includeStandingCharge, setIncludeStandingCharge] = useState(false);

  // When "Live" is clicked from a past date, navigate to today so
  // dailySummary gets rebuilt with real telemetry data.
  const handleRangeChange = useCallback(
    (newRange: TimeRange) => {
      if (newRange === "live" && currentDate !== todayDate) {
        router.push("/?range=live");
        return;
      }
      setRange(newRange);
    },
    [currentDate, todayDate, router]
  );

  // Live view uses today's real dailySummary with the current slot index.
  // Recompute every 30s so the "NOW" indicator advances and pull fresh
  // server data every 5 min so newly-settled telemetry shows up.
  const [liveSlotIndex, setLiveSlotIndex] = useState(initialSlotIndex);
  useEffect(() => {
    const tick = setInterval(() => {
      setLiveSlotIndex(ukSlotIndex());
    }, 30_000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (range !== "live" || currentDate !== todayDate) return;
    const refresh = setInterval(() => {
      router.refresh();
    }, 5 * 60_000);
    return () => clearInterval(refresh);
  }, [range, currentDate, todayDate, router]);
  const liveSummary = useMemo(
    () => ({ ...dailySummary, liveSlotIndex }),
    [dailySummary, liveSlotIndex]
  );

  // ── KPIs for live / daily (always available from server props) ──

  // Only count slots up to the current one for the "live" totals so we
  // reflect "today so far" rather than the whole-day aggregate.
  const liveKpi = useMemo(() => {
    const idx = liveSlotIndex;
    const past = dailySummary.slots.filter((_, i) => i <= idx);
    let totalCostPence = 0;
    let totalKwh = 0;
    let offPeakKwh = 0;
    let dispatchKwh = 0;
    for (const s of past) {
      totalCostPence += s.cost;
      totalKwh += s.consumptionKwh;
      if (s.classification === "off-peak") offPeakKwh += s.consumptionKwh;
      else if (s.classification === "dispatch") dispatchKwh += s.consumptionKwh;
    }
    const offPeakPercentage =
      totalKwh > 0
        ? Math.round(((offPeakKwh + dispatchKwh) / totalKwh) * 100)
        : 0;
    const allPeakCost = totalKwh * dailySummary.peakRatePence;
    return {
      totalCostPence: totalCostPence + dailySummary.standingChargePence,
      totalKwh,
      offPeakPercentage,
      savingsVsAllPeakPence: Math.max(0, allPeakCost - totalCostPence),
    };
  }, [dailySummary, liveSlotIndex]);

  // ── Client-side fetch for weekly / monthly / yearly ──

  type RangeData =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; data: Record<string, unknown> };

  const [rangeCache, setRangeCache] = useState<
    Record<string, RangeData>
  >({});

  // Keys already requested for the current cache generation. A ref rather than
  // state so React's double-invoked StrictMode effects can't fire two requests
  // for the same key before the first `setRangeCache` has committed.
  const requestedKeys = useRef<Set<string>>(new Set());

  // Bumped whenever the cache is dropped, to re-trigger the fetch below for
  // whichever range is on screen. Without it, clearing the cache while sitting
  // on a range view left it stuck on "loading…" until the range or date moved.
  const [cacheGeneration, setCacheGeneration] = useState(0);

  // Drop cached range data when the daily summary changes identity — that
  // means the server re-rendered (e.g. after a rate-override save), so the
  // weekly/monthly/yearly responses currently in cache are stale too.
  useEffect(() => {
    setRangeCache({});
    requestedKeys.current.clear();
    setCacheGeneration((g) => g + 1);
  }, [dailySummary]);

  // Fetch range data when the user switches to a non-daily/live range. The
  // fetch lives in the effect, not inside a `setRangeCache` updater: updaters
  // must be pure, and StrictMode double-invokes them in dev, which fired every
  // request twice.
  useEffect(() => {
    if (range !== "weekly" && range !== "monthly" && range !== "yearly") return;

    const cacheKey = `${range}:${currentDate}`;
    if (requestedKeys.current.has(cacheKey)) return;
    requestedKeys.current.add(cacheKey);
    setRangeCache((prev) => ({ ...prev, [cacheKey]: { status: "loading" } }));

    fetch(`/api/summary?range=${range}&date=${currentDate}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) =>
        setRangeCache((p) => ({ ...p, [cacheKey]: { status: "ok", data } }))
      )
      .catch((err) => {
        // Release the key so returning to this range retries.
        requestedKeys.current.delete(cacheKey);
        setRangeCache((p) => ({
          ...p,
          [cacheKey]: {
            status: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          },
        }));
      });
  }, [range, currentDate, cacheGeneration]);

  const getRangeState = (r: string): RangeData =>
    rangeCache[`${r}:${currentDate}`] ?? { status: "idle" };

  // ── Standing charge adjustment ──
  // Data includes standing charge by default. When the toggle is off we
  // subtract it so the user sees pure consumption cost.
  const sc = includeStandingCharge ? 0 : -(dailySummary.standingChargePence);

  // ── Compute KPI data for current range ──

  const kpiData = useMemo(() => {
    switch (range) {
      case "live":
        return {
          totalCostPence: liveKpi.totalCostPence + sc,
          avgCostPence: liveKpi.totalCostPence + sc,
          totalKwh: liveKpi.totalKwh,
          avgKwh: liveKpi.totalKwh,
          offPeakPercentage: liveKpi.offPeakPercentage,
          totalSavingsPence: liveKpi.savingsVsAllPeakPence,
          periodLabel: "today so far",
          dateLabel: "Today",
        };
      case "daily":
        return {
          totalCostPence: dailySummary.totalCostPence + sc,
          avgCostPence: dailySummary.totalCostPence + sc,
          totalKwh: dailySummary.totalKwh,
          avgKwh: dailySummary.totalKwh,
          offPeakPercentage: dailySummary.offPeakPercentage,
          totalSavingsPence: dailySummary.savingsVsAllPeakPence,
          periodLabel: dateLabel,
          dateLabel,
        };
      case "weekly":
      case "monthly":
      case "yearly": {
        const state = getRangeState(range);
        if (state.status !== "ok") {
          return {
            totalCostPence: 0,
            avgCostPence: 0,
            totalKwh: 0,
            avgKwh: 0,
            offPeakPercentage: 0,
            totalSavingsPence: 0,
            periodLabel: "loading…",
            dateLabel: "…",
          };
        }
        const d = state.data;
        const scRange = includeStandingCharge
          ? 0
          : -((d.standingChargePence as number) ?? 0);
        const numPeriods = range === "yearly" ? 12 : (d.days as unknown[])?.length ?? 1;
        const avgLabel =
          range === "yearly" ? "avgMonthlyCostPence" : "avgDailyCostPence";
        const avgKwhLabel =
          range === "yearly" ? "avgMonthlyKwh" : "avgDailyKwh";
        return {
          totalCostPence: (d.totalCostPence as number) + scRange,
          avgCostPence:
            ((d[avgLabel] as number) ?? 0) +
            (numPeriods > 0 ? scRange / numPeriods : 0),
          totalKwh: d.totalKwh as number,
          avgKwh: (d[avgKwhLabel] as number) ?? 0,
          offPeakPercentage: d.offPeakPercentage as number,
          totalSavingsPence: d.totalSavingsPence as number,
          periodLabel: d.label as string,
          dateLabel: d.label as string,
        };
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, dailySummary, dateLabel, liveKpi, rangeCache, currentDate, includeStandingCharge]);

  // ── Pick the right chart for the current range ──

  // Standing charge per day for adjusting range chart bars.
  const standingChargePerDay = dailySummary.standingChargePence;

  const chart = useMemo(() => {
    switch (range) {
      case "live":
        return <LiveChart key="live" summary={liveSummary} />;
      case "daily":
        return (
          <ConsumptionChart
            key="daily"
            slots={dailySummary.slots}
            standingChargePence={includeStandingCharge ? standingChargePerDay : 0}
          />
        );
      case "weekly":
      case "monthly": {
        const state = getRangeState(range);
        if (state.status !== "ok") return <ChartSkeleton />;
        const days = state.data.days as DailySummaryCompact[];
        const scPerDay = includeStandingCharge
          ? 0
          : -((state.data.standingChargePence as number) / days.length);
        const adjusted = scPerDay === 0
          ? days
          : days.map((d) => ({
              ...d,
              totalCostPence: d.totalCostPence + scPerDay,
            }));
        const label = range === "weekly" ? "Weekly Overview" : "Monthly Overview";
        return <RangeChart key={range} days={adjusted} rangeLabel={label} />;
      }
      case "yearly": {
        const state = getRangeState(range);
        if (state.status !== "ok") return <ChartSkeleton />;
        const months = state.data.months as MonthlySummaryCompact[];
        if (!includeStandingCharge) {
          const adjusted = months.map((m) => ({
            ...m,
            totalCostPence: m.totalCostPence - (standingChargePerDay * m.daysInMonth),
            avgDailyCostPence: m.avgDailyCostPence - standingChargePerDay,
          }));
          return <YearlyChart key="yearly" months={adjusted} />;
        }
        return <YearlyChart key="yearly" months={months} />;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, dailySummary, liveSummary, rangeCache, currentDate, includeStandingCharge]);

  // Real dispatch events for the day currently being viewed: collapse runs
  // of consecutive `dispatch`-classified slots into a single event so the
  // timeline doesn't show 12 separate 30-minute rows for one overnight charge.
  const dailyDispatches = useMemo(
    () => slotsToDispatchEvents(dailySummary.slots),
    [dailySummary]
  );

  // Pick dispatches to show for current range
  const dispatchesToShow = useMemo(() => {
    switch (range) {
      case "live":
        return slotsToDispatchEvents(
          dailySummary.slots.filter((_, i) => i <= liveSlotIndex)
        );
      case "daily":
        return dailyDispatches;
      case "weekly":
      case "monthly": {
        const state = getRangeState(range);
        if (state.status !== "ok") return [];
        return (state.data.dispatches as DispatchEvent[]) ?? [];
      }
      case "yearly":
        return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, dailyDispatches, dailySummary, liveSlotIndex, rangeCache, currentDate]);

  const showCostBreakdown = range === "daily" || range === "live";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* ── Ambient background blobs ── */}
      <div
        className="ambient-blob"
        style={{
          width: 500,
          height: 500,
          top: -100,
          right: -150,
          background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="ambient-blob"
        style={{
          width: 400,
          height: 400,
          bottom: 100,
          left: -100,
          background: "radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)",
          animationDelay: "3s",
        }}
      />
      <div
        className="ambient-blob"
        style={{
          width: 350,
          height: 350,
          top: "40%",
          left: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
          animationDelay: "5s",
        }}
      />

      {/* ── Header ── */}
      <header
        className="relative z-10 border-b border-white/[0.06]"
        style={{
          background: "rgba(5, 5, 9, 0.6)",
          backdropFilter: "blur(20px) saturate(1.3)",
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
              <Zap size={16} className="text-primary" />
              <div className="absolute inset-0 rounded-xl bg-primary/10 blur-md" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                IOG Dashboard
              </h1>
              <p className="text-[10px] text-muted-foreground">
                Octopus Intelligent Go
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <TimeRangeSelector value={range} onChange={handleRangeChange} />
            <DateNavigator
              range={range}
              label={kpiData.dateLabel}
              currentDate={currentDate}
              todayDate={todayDate}
            />
            <div className="flex items-center gap-1.5">
              <Link
                href="/setup"
                aria-label="Account setup"
                title="Account setup"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground active:scale-95"
              >
                <Settings size={16} />
              </Link>
              {process.env.NEXT_PUBLIC_SUPABASE_URL && (
                <form action={signOut}>
                  <button
                    type="submit"
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground active:scale-95"
                  >
                    <LogOut size={16} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
        <div className="space-y-5">
          {agreementEndDate && (
            <TariffExpiryBanner
              agreementEndDate={agreementEndDate}
              todayDate={todayDate}
            />
          )}

          <RangeKpiCards
            range={range}
            totalCostPence={kpiData.totalCostPence}
            avgCostPence={kpiData.avgCostPence}
            totalKwh={kpiData.totalKwh}
            avgKwh={kpiData.avgKwh}
            offPeakPercentage={kpiData.offPeakPercentage}
            totalSavingsPence={kpiData.totalSavingsPence}
            periodLabel={kpiData.periodLabel}
          />

          {/* Standing charge toggle */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeStandingCharge}
              onChange={(e) => setIncludeStandingCharge(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.04] accent-primary"
            />
            Include daily standing charge
            <span className="tabular-nums font-mono text-foreground/60">
              ({dailySummary.standingChargePence.toFixed(2)}p/day)
            </span>
          </label>

          {chart}

          {/* Bill projection + EV split + tariff comparison row */}
          {(range === "daily" || range === "live") && (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <BillProjection todayDate={todayDate} />
              {dailySummary.evChargingKwh != null &&
                dailySummary.dispatchKwh > 0 && (
                  <EvChargingSplit
                    dispatchKwh={dailySummary.dispatchKwh}
                    evChargingKwh={dailySummary.evChargingKwh}
                    offPeakRate={dailySummary.offPeakRatePence}
                  />
                )}
              {tariffComparison && (
                <TariffComparison data={tariffComparison} />
              )}
            </div>
          )}

          <div
            className={`grid gap-5 ${
              showCostBreakdown ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            <DispatchTimeline
              dispatches={dispatchesToShow}
              collapsible={range === "weekly" || range === "monthly"}
            />
            {showCostBreakdown && (
              <CostBreakdown summary={dailySummary} />
            )}
            <RateDetails
              offPeakRate={dailySummary.offPeakRatePence}
              peakRate={dailySummary.peakRatePence}
              standingCharge={dailySummary.standingChargePence}
            />
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className="relative z-10 border-t border-white/[0.04]"
        style={{ background: "rgba(5, 5, 9, 0.4)" }}
      >
        <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
          <p className="text-center text-[11px] text-muted-foreground">
            Data sourced from Octopus Energy API
          </p>
        </div>
      </footer>
    </div>
  );
}
