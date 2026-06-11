"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { fmtUsd, type Budget } from "@/lib/data";

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// In-app budget feedback (#30). A budget that exists is always visible as a
// slim progress track with month-to-date spend; at 80% (warn) and 100% (over)
// it escalates to a prominent alert. Threshold crossings emit a PostHog event
// once per (month, level) per browser session so they're observable without
// spamming on every page load.
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

  // No budget configured — nothing to show.
  if (budgetUsd <= 0) return null;

  const over = level === "over";
  const fill = Math.min(100, Math.max(0, pct));
  const fillColor = level ? "var(--warn)" : "var(--accent)";

  // Below 80%: quiet confirmation that the budget is active — slim track plus
  // spend/budget, no alert chrome.
  if (!level) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
        <span className="uppercase tracking-label text-faint">budget</span>
        <div
          className="track w-40 sm:w-56"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="monthly budget used"
        >
          <i style={{ width: `${fill}%`, background: fillColor }} />
        </div>
        <span className="tabular-nums">
          {fmtUsd(spendUsd)} of {fmtUsd(budgetUsd)} this month ({pct.toFixed(0)}%)
        </span>
        <Link href="/settings" className="underline hover:text-ink transition-colors">
          adjust budget
        </Link>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-btn border px-4 py-2.5 text-[12px] ${
        over ? "border-warn/50 bg-warn/10 text-warn" : "border-line bg-surface text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${over ? "bg-warn" : "bg-accent"}`} />
      <span className="font-medium">
        {over ? "Over budget" : "Approaching budget"} — {fmtUsd(spendUsd)} of {fmtUsd(budgetUsd)} this
        month ({pct.toFixed(0)}%)
      </span>
      <div className="track w-32 sm:w-44">
        <i style={{ width: `${fill}%`, background: fillColor }} />
      </div>
      <Link href="/settings" className="underline hover:text-ink transition-colors">
        adjust budget
      </Link>
    </div>
  );
}
