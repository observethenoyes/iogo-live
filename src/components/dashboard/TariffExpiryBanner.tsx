"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";

interface TariffExpiryBannerProps {
  /** ISO date string of when the tariff agreement expires. */
  agreementEndDate: string;
}

export default function TariffExpiryBanner({
  agreementEndDate,
}: TariffExpiryBannerProps) {
  const endDate = new Date(agreementEndDate);
  const now = new Date();
  const daysRemaining = Math.ceil(
    (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Only show if within 30 days of expiry
  if (daysRemaining > 30 || daysRemaining < 0) return null;

  const formattedDate = endDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const isUrgent = daysRemaining <= 7;

  return (
    <div
      className={`animate-fade-up flex items-start gap-3 rounded-xl border px-4 py-3 ${
        isUrgent
          ? "border-destructive/30 bg-destructive/[0.06]"
          : "border-amber-500/20 bg-amber-500/[0.04]"
      }`}
    >
      <AlertTriangle
        size={16}
        className={`mt-0.5 shrink-0 ${
          isUrgent ? "text-destructive" : "text-amber-400"
        }`}
      />
      <div className="flex-1 text-sm">
        <p
          className={`font-medium ${
            isUrgent ? "text-destructive" : "text-amber-300"
          }`}
        >
          Tariff {isUrgent ? "expiring soon" : "renewal coming up"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your IOG agreement ends on{" "}
          <span className="font-medium text-foreground">{formattedDate}</span>
          {" — "}
          {daysRemaining === 0
            ? "today"
            : daysRemaining === 1
              ? "tomorrow"
              : `${daysRemaining} days remaining`}
          . Renew to keep your off-peak rates.
        </p>
      </div>
      <a
        href="https://octopus.energy/dashboard/new/accounts/tariff-details/"
        target="_blank"
        rel="noreferrer"
        className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all hover:bg-white/[0.06] ${
          isUrgent
            ? "border-destructive/30 text-destructive"
            : "border-amber-500/20 text-amber-400"
        }`}
      >
        Renew
        <ExternalLink size={10} />
      </a>
    </div>
  );
}
