"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { fmtUsd, type Budget } from "@/lib/data";

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// In-app budget alert (#30). Shows at 80% (warn) and 100% (over) of the monthly
// budget, and emits a PostHog event once per (month, level) per browser session
// so crossing a threshold is observable without spamming on every page load.
export default function BudgetBanner({ budget }: { budget: Budget }) {
  const { pct, spendUsd, budgetUsd } = budget;
  const level = pct >= 100 ? "over" : pct >= 80 ? "warn" : null;

  useEffect(() => {
    if (!level) return;
    const month = new Date().toISOString().slice(0, 7);
    const flag = `tm_budget_alert_${month}_${level}`;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {
      /* storage unavailable — fall through and still emit once per mount */
    }
    if (PH) {
      posthog.capture("budget_threshold_crossed", {
        level,
        pct,
        spend_usd: spendUsd,
        budget_usd: budgetUsd,
      });
    }
  }, [level, pct, spendUsd, budgetUsd]);

  if (!level) return null;

  const over = level === "over";
  return (
    <div
      role="alert"
      className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-btn border px-4 py-2.5 text-[12px] ${
        over ? "border-warn/50 bg-warn/10 text-warn" : "border-line bg-surface text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${over ? "bg-warn" : "bg-accent"}`} />
      <span className="font-medium">
        {over ? "Over budget" : "Approaching budget"} — {fmtUsd(spendUsd)} of {fmtUsd(budgetUsd)} this
        month ({pct.toFixed(0)}%)
      </span>
      <Link href="/settings" className="underline hover:text-ink transition-colors">
        adjust budget
      </Link>
    </div>
  );
}
