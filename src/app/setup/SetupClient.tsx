"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  Search,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  Calendar,
  Save,
  Settings,
  RefreshCw,
  Shield,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { saveCredentials, saveRateOverrides } from "@/app/actions/credentials";

// ── Types ──

interface DiscoveredRates {
  peakPence: number | null;
  offPeakPence: number | null;
  standingChargePence: number | null;
  pricedAt: string;
}

interface DiscoveredMeter {
  mpan: string;
  meterSerial: string;
  tariffCode: string;
  productCode: string;
  agreementValidFrom: string;
  agreementValidTo: string | null;
  rates: DiscoveredRates | null;
}

interface DiscoveredProperty {
  id: number;
  label: string;
  movedOutAt: string | null;
  meter: DiscoveredMeter | null;
}

interface DiscoveryResult {
  accountNumber: string;
  properties: DiscoveredProperty[];
  recommended: DiscoveredMeter | null;
}

interface ErrorBody {
  error: string;
  code?: string;
}

export interface ExistingConfig {
  accountNumber: string;
  apiKeyMasked: string;
  mpan: string;
  meterSerial: string;
  productCode: string;
  tariffCode: string;
  peakRateOverride: number | null;
  offPeakRateOverride: number | null;
  standingChargeOverride: number | null;
}

export interface LiveRates {
  peakPence: number | null;
  offPeakPence: number | null;
  standingChargePence: number | null;
}

interface SetupClientProps {
  existingConfig: ExistingConfig | null;
  liveRates: LiveRates | null;
  isSupabase: boolean;
}

// ── Main component ──

export default function SetupClient({
  existingConfig,
  liveRates,
  isSupabase,
}: SetupClientProps) {
  const [view, setView] = useState<"overview" | "setup">(
    existingConfig ? "overview" : "setup"
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <Header
        isOverview={view === "overview"}
        onBackToOverview={
          existingConfig ? () => setView("overview") : undefined
        }
      />

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
        {view === "overview" && existingConfig ? (
          <AccountOverview
            config={existingConfig}
            liveRates={liveRates}
            isSupabase={isSupabase}
            onReconfigure={() => setView("setup")}
          />
        ) : (
          <DiscoveryForm
            isSupabase={isSupabase}
            onCancel={
              existingConfig ? () => setView("overview") : undefined
            }
          />
        )}
      </main>
    </div>
  );
}

// ── Header ──

function Header({
  isOverview,
  onBackToOverview,
}: {
  isOverview: boolean;
  onBackToOverview?: () => void;
}) {
  return (
    <header
      className="relative z-10 border-b border-white/[0.06]"
      style={{
        background: "rgba(5, 5, 9, 0.6)",
        backdropFilter: "blur(20px) saturate(1.3)",
      }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
            {isOverview ? (
              <Settings size={16} className="text-primary" />
            ) : (
              <Zap size={16} className="text-primary" />
            )}
            <div className="absolute inset-0 rounded-xl bg-primary/10 blur-md" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {isOverview ? "Account Settings" : "Setup"}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {isOverview
                ? "Manage your Octopus account"
                : "Connect your Octopus account"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOverview && onBackToOverview && (
            <button
              type="button"
              onClick={onBackToOverview}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground"
            >
              <ArrowLeft size={12} />
              Back to settings
            </button>
          )}
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground"
          >
            <ArrowLeft size={12} />
            Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Account Overview ──

function AccountOverview({
  config,
  liveRates,
  isSupabase,
  onReconfigure,
}: {
  config: ExistingConfig;
  liveRates: LiveRates | null;
  isSupabase: boolean;
  onReconfigure: () => void;
}) {
  const router = useRouter();
  const [overridesEnabled, setOverridesEnabled] = useState(
    config.peakRateOverride != null ||
      config.offPeakRateOverride != null ||
      config.standingChargeOverride != null
  );
  const [peakOverride, setPeakOverride] = useState(
    config.peakRateOverride?.toString() ?? ""
  );
  const [offPeakOverride, setOffPeakOverride] = useState(
    config.offPeakRateOverride?.toString() ?? ""
  );
  const [standingOverride, setStandingOverride] = useState(
    config.standingChargeOverride?.toString() ?? ""
  );
  const [saving, startSave] = useTransition();
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState("");

  function handleSaveOverrides() {
    setSaveStatus("idle");
    startSave(async () => {
      if (isSupabase) {
        const res = await saveRateOverrides({
          peakRateOverride: overridesEnabled && peakOverride
            ? parseFloat(peakOverride)
            : null,
          offPeakRateOverride: overridesEnabled && offPeakOverride
            ? parseFloat(offPeakOverride)
            : null,
          standingChargeOverride: overridesEnabled && standingOverride
            ? parseFloat(standingOverride)
            : null,
        });
        if (res?.error) {
          setSaveStatus("error");
          setSaveErrorMsg(res.error);
        } else {
          setSaveStatus("success");
          setTimeout(() => setSaveStatus("idle"), 2000);
          router.refresh();
        }
      }
    });
  }

  function handleClearOverrides() {
    setOverridesEnabled(false);
    setPeakOverride("");
    setOffPeakOverride("");
    setStandingOverride("");
    if (isSupabase) {
      startSave(async () => {
        await saveRateOverrides({
          peakRateOverride: null,
          offPeakRateOverride: null,
          standingChargeOverride: null,
        });
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2000);
        router.refresh();
      });
    }
  }

  // Effective rates: override if set, otherwise live API rate.
  const effectivePeak = overridesEnabled && peakOverride
    ? parseFloat(peakOverride)
    : liveRates?.peakPence ?? null;
  const effectiveOffPeak = overridesEnabled && offPeakOverride
    ? parseFloat(offPeakOverride)
    : liveRates?.offPeakPence ?? null;
  const effectiveStanding = overridesEnabled && standingOverride
    ? parseFloat(standingOverride)
    : liveRates?.standingChargePence ?? null;

  // Env var block for self-hosted override instructions.
  const overrideEnvBlock = [
    peakOverride ? `OCTOPUS_PEAK_RATE_OVERRIDE=${peakOverride}` : "# OCTOPUS_PEAK_RATE_OVERRIDE=24.50",
    offPeakOverride ? `OCTOPUS_OFF_PEAK_RATE_OVERRIDE=${offPeakOverride}` : "# OCTOPUS_OFF_PEAK_RATE_OVERRIDE=7.50",
    standingOverride ? `OCTOPUS_STANDING_CHARGE_OVERRIDE=${standingOverride}` : "# OCTOPUS_STANDING_CHARGE_OVERRIDE=46.36",
  ].join("\n");

  return (
    <div className="space-y-5">
      {/* Account details */}
      <section className="glass-card rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={14} className="text-primary" />
          <h2 className="text-xs font-medium text-muted-foreground">
            Account details
          </h2>
        </div>
        <dl className="space-y-2 text-xs">
          <DetailRow label="API key" value={config.apiKeyMasked} mono />
          <DetailRow label="Account number" value={config.accountNumber} mono />
          <DetailRow label="MPAN" value={config.mpan} mono />
          <DetailRow label="Meter serial" value={config.meterSerial} mono />
          <DetailRow label="Product code" value={config.productCode} mono />
          <DetailRow label="Tariff code" value={config.tariffCode} mono />
        </dl>
      </section>

      {/* Tariff rates */}
      <section className="glass-card rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            <h2 className="text-xs font-medium text-muted-foreground">
              Tariff rates
            </h2>
          </div>
          {liveRates && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
              Synced from API
            </span>
          )}
        </div>

        {/* Rate cards */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <RateCard
            icon={<TrendingDown size={14} className="text-emerald-400" />}
            label="Off-peak"
            apiValue={liveRates?.offPeakPence ?? null}
            effectiveValue={effectiveOffPeak}
            isOverridden={overridesEnabled && !!offPeakOverride}
            suffix="p/kWh"
            accent="emerald"
            hint="23:30–05:30 UK"
          />
          <RateCard
            icon={<TrendingUp size={14} className="text-orange-400" />}
            label="Peak"
            apiValue={liveRates?.peakPence ?? null}
            effectiveValue={effectivePeak}
            isOverridden={overridesEnabled && !!peakOverride}
            suffix="p/kWh"
            accent="orange"
            hint="All other times"
          />
          <RateCard
            icon={<Calendar size={14} className="text-slate-400" />}
            label="Standing charge"
            apiValue={liveRates?.standingChargePence ?? null}
            effectiveValue={effectiveStanding}
            isOverridden={overridesEnabled && !!standingOverride}
            suffix="p/day"
            accent="slate"
            hint="Charged once daily"
          />
        </div>

        {!liveRates && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-[11px] text-yellow-300/80">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              Couldn&rsquo;t fetch live rates from the API. The dashboard will
              use cached rates or fallback values.
            </span>
          </div>
        )}

        {/* Override toggle */}
        <div className="border-t border-white/[0.04] pt-4">
          <button
            type="button"
            onClick={() => setOverridesEnabled(!overridesEnabled)}
            className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {overridesEnabled ? (
              <ToggleRight size={20} className="text-primary" />
            ) : (
              <ToggleLeft size={20} />
            )}
            Use custom rates
            <span className="text-[10px] text-muted-foreground/60">
              (override API values)
            </span>
          </button>

          {overridesEnabled && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <OverrideInput
                  label="Off-peak rate"
                  suffix="p/kWh"
                  value={offPeakOverride}
                  placeholder={liveRates?.offPeakPence?.toFixed(2) ?? "7.50"}
                  onChange={setOffPeakOverride}
                />
                <OverrideInput
                  label="Peak rate"
                  suffix="p/kWh"
                  value={peakOverride}
                  placeholder={liveRates?.peakPence?.toFixed(2) ?? "24.50"}
                  onChange={setPeakOverride}
                />
                <OverrideInput
                  label="Standing charge"
                  suffix="p/day"
                  value={standingOverride}
                  placeholder={
                    liveRates?.standingChargePence?.toFixed(2) ?? "46.36"
                  }
                  onChange={setStandingOverride}
                />
              </div>

              {isSupabase ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveOverrides}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    ) : saveStatus === "success" ? (
                      <Check size={12} />
                    ) : (
                      <Save size={12} />
                    )}
                    {saveStatus === "success" ? "Saved" : "Save overrides"}
                  </button>
                  {(config.peakRateOverride != null ||
                    config.offPeakRateOverride != null ||
                    config.standingChargeOverride != null) && (
                    <button
                      type="button"
                      onClick={handleClearOverrides}
                      disabled={saving}
                      className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      Clear overrides
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Add these to your{" "}
                    <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px]">
                      .env.local
                    </code>{" "}
                    to override API rates:
                  </p>
                  <pre className="rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {overrideEnvBlock}
                  </pre>
                </div>
              )}

              {saveStatus === "error" && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{saveErrorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Reconfigure */}
      <section className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground">
              Reconfigure account
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Re-run discovery to update your meter, tariff, or API key.
            </p>
          </div>
          <button
            type="button"
            onClick={onReconfigure}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-xs font-medium text-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06]"
          >
            <RefreshCw size={12} />
            Reconfigure
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Discovery Form (existing flow) ──

function DiscoveryForm({
  isSupabase,
  onCancel,
}: {
  isSupabase: boolean;
  onCancel?: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(
    null
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSelectedPropertyId(null);
    setSaveError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/setup/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, accountNumber }),
      });
      const json: DiscoveryResult | ErrorBody = await res.json();
      if (!res.ok) {
        setError("error" in json ? json.error : "Discovery failed.");
        return;
      }
      const r = json as DiscoveryResult;
      setResult(r);
      const firstUsable = r.properties.find((p) => p.meter !== null);
      setSelectedPropertyId(firstUsable?.id ?? r.properties[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const selectedProperty =
    result?.properties.find((p) => p.id === selectedPropertyId) ?? null;
  const activeMeter = selectedProperty?.meter ?? result?.recommended ?? null;

  const envBlock = activeMeter
    ? [
        `OCTOPUS_API_KEY=${apiKey}`,
        `OCTOPUS_ACCOUNT_NUMBER=${result!.accountNumber}`,
        `OCTOPUS_MPAN=${activeMeter.mpan}`,
        `OCTOPUS_METER_SERIAL=${activeMeter.meterSerial}`,
        `OCTOPUS_PRODUCT_CODE=${activeMeter.productCode}`,
        `OCTOPUS_TARIFF_CODE=${activeMeter.tariffCode}`,
      ].join("\n")
    : null;

  function handleSave() {
    if (!activeMeter || !result) return;
    setSaveError(null);
    startSaveTransition(async () => {
      const res = await saveCredentials({
        apiKey,
        accountNumber: result.accountNumber,
        mpan: activeMeter.mpan,
        meterSerial: activeMeter.meterSerial,
        productCode: activeMeter.productCode,
        tariffCode: activeMeter.tariffCode,
      });
      if (res?.error) {
        setSaveError(res.error);
      }
    });
  }

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // Clipboard API unavailable — noop.
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="mb-2 text-xl font-semibold text-foreground">
          Connect your Octopus account
        </h2>
        <p className="text-sm text-muted-foreground">
          Paste your API key and account number. We&rsquo;ll look up your MPAN,
          meter serial, and active IOG tariff automatically.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="glass-card mb-6 space-y-4 rounded-2xl p-5 md:p-6"
      >
        <div>
          <label
            htmlFor="apiKey"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            API key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk_live_…"
            autoComplete="off"
            required
            className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Find it at{" "}
            <a
              href="https://octopus.energy/dashboard/new/accounts/personal-details/api-access"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              octopus.energy &rsaquo; API access
            </a>
            .{" "}
            {isSupabase
              ? "Encrypted before storage — never stored in plaintext."
              : "Stays in your browser — only sent to discover your meter."}
          </p>
        </div>

        <div>
          <label
            htmlFor="account"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Account number
          </label>
          <input
            id="account"
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.toUpperCase())}
            placeholder="A-ABC12345"
            autoComplete="off"
            required
            className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading || !apiKey || !accountNumber}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Discovering…
              </>
            ) : (
              <>
                <Search size={14} />
                Discover account
              </>
            )}
          </button>
          {onCancel && !result && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="glass-card mb-6 flex gap-3 rounded-2xl border border-destructive/40 p-4">
          <AlertTriangle
            size={18}
            className="shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-foreground">
              Discovery failed
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-5">
          {/* Property picker if more than one */}
          {result.properties.length > 1 && (
            <div className="glass-card rounded-2xl p-5">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                This account has {result.properties.length} properties — pick
                the one you want to monitor:
              </p>
              <div className="space-y-2">
                {result.properties.map((p) => {
                  const active = p.id === selectedPropertyId;
                  const disabled = p.meter === null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedPropertyId(p.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                        active
                          ? "border-primary/60 bg-primary/10"
                          : disabled
                            ? "cursor-not-allowed border-white/[0.04] bg-white/[0.01] opacity-50"
                            : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-foreground">
                          {p.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {disabled
                            ? "no IOG meter"
                            : p.movedOutAt
                              ? "moved out"
                              : "active"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Discovered values */}
          {activeMeter && (
            <div className="glass-card rounded-2xl p-5">
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Discovered values
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Active since{" "}
                  {new Date(
                    activeMeter.agreementValidFrom
                  ).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {activeMeter.agreementValidTo
                    ? ` until ${new Date(
                        activeMeter.agreementValidTo
                      ).toLocaleDateString("en-GB")}`
                    : " (current)"}
                </p>
              </div>
              <dl className="space-y-2 text-xs">
                <DiscoveredRow
                  label="Account number"
                  value={result.accountNumber}
                  onCopy={() => copy("acc", result.accountNumber)}
                  copied={copiedKey === "acc"}
                />
                <DiscoveredRow
                  label="MPAN"
                  value={activeMeter.mpan}
                  onCopy={() => copy("mpan", activeMeter.mpan)}
                  copied={copiedKey === "mpan"}
                />
                <DiscoveredRow
                  label="Meter serial"
                  value={activeMeter.meterSerial}
                  onCopy={() => copy("serial", activeMeter.meterSerial)}
                  copied={copiedKey === "serial"}
                />
                <DiscoveredRow
                  label="Product code"
                  value={activeMeter.productCode}
                  onCopy={() => copy("product", activeMeter.productCode)}
                  copied={copiedKey === "product"}
                />
                <DiscoveredRow
                  label="Tariff code"
                  value={activeMeter.tariffCode}
                  onCopy={() => copy("tariff", activeMeter.tariffCode)}
                  copied={copiedKey === "tariff"}
                />
              </dl>
            </div>
          )}

          {/* Live rates */}
          {activeMeter?.rates && (
            <div className="glass-card rounded-2xl p-5">
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Live rates for this tariff
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pulled directly from Octopus today.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <SimpleRateCard
                  icon={
                    <TrendingDown size={14} className="text-emerald-400" />
                  }
                  label="Off-peak"
                  value={activeMeter.rates.offPeakPence}
                  suffix="p/kWh"
                  accent="emerald"
                  hint="23:30–05:30 UK"
                />
                <SimpleRateCard
                  icon={<TrendingUp size={14} className="text-orange-400" />}
                  label="Peak"
                  value={activeMeter.rates.peakPence}
                  suffix="p/kWh"
                  accent="orange"
                  hint="All other times"
                />
                <SimpleRateCard
                  icon={<Calendar size={14} className="text-slate-400" />}
                  label="Standing charge"
                  value={activeMeter.rates.standingChargePence}
                  suffix="p/day"
                  accent="slate"
                  hint="Charged once daily"
                />
              </div>
            </div>
          )}

          {/* Save button (Supabase) or .env block (self-hosted) */}
          {activeMeter && isSupabase && (
            <div className="glass-card rounded-2xl p-5">
              {saveError && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Save &amp; continue to dashboard
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Your API key is encrypted before storage and never stored in
                plaintext.
              </p>
            </div>
          )}

          {activeMeter && !isSupabase && envBlock && (
            <div className="glass-card rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Drop into{" "}
                  <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px]">
                    .env.local
                  </code>{" "}
                  or Vercel env vars
                </p>
                <button
                  type="button"
                  onClick={() => copy("env", envBlock)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-muted-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground"
                >
                  {copiedKey === "env" ? (
                    <>
                      <Check size={12} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copy all
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {envBlock}
              </pre>
              <p className="mt-3 text-[11px] text-muted-foreground">
                After saving, restart the dev server (or redeploy on Vercel) so
                the new values take effect.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ──

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </dt>
      <dd
        className={`truncate text-xs text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function RateCard({
  icon,
  label,
  apiValue,
  effectiveValue,
  isOverridden,
  suffix,
  accent,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  apiValue: number | null;
  effectiveValue: number | null;
  isOverridden: boolean;
  suffix: string;
  accent: "emerald" | "orange" | "slate";
  hint: string;
}) {
  const borderByAccent: Record<typeof accent, string> = {
    emerald: "border-emerald-500/20",
    orange: "border-orange-500/20",
    slate: "border-slate-500/20",
  };
  return (
    <div
      className={`rounded-xl border ${borderByAccent[accent]} bg-black/20 p-3`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
          {label}
        </span>
      </div>
      <div className="font-mono text-lg tabular-nums text-foreground">
        {effectiveValue != null ? effectiveValue.toFixed(2) : "—"}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          {suffix}
        </span>
      </div>
      {isOverridden && apiValue != null ? (
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          API: {apiValue.toFixed(2)} {suffix}{" "}
          <span className="text-primary/70">(overridden)</span>
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>
      )}
    </div>
  );
}

function SimpleRateCard({
  icon,
  label,
  value,
  suffix,
  accent,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  suffix: string;
  accent: "emerald" | "orange" | "slate";
  hint: string;
}) {
  const borderByAccent: Record<typeof accent, string> = {
    emerald: "border-emerald-500/20",
    orange: "border-orange-500/20",
    slate: "border-slate-500/20",
  };
  return (
    <div
      className={`rounded-xl border ${borderByAccent[accent]} bg-black/20 p-3`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
          {label}
        </span>
      </div>
      <div className="font-mono text-lg tabular-nums text-foreground">
        {value != null ? value.toFixed(2) : "—"}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          {suffix}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>
    </div>
  );
}

function OverrideInput({
  label,
  suffix,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 pr-14 font-mono text-sm tabular-nums text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function DiscoveredRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {label}
        </dt>
        <dd className="truncate font-mono text-xs text-foreground">{value}</dd>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-all hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}
