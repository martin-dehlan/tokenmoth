"use client";

import { useEffect, useState } from "react";

// Days per window, to normalize the window's API cost to a monthly figure for a
// fair ROI vs the monthly plan price. "all" → no projection (use raw).
const DAYS: Record<string, number> = {
  "1h": 1 / 24,
  "5h": 5 / 24,
  "12h": 0.5,
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// Shows "→ 4.6× your $200 plan" when the user has picked a plan (#72 Phase 2).
// Renders nothing (server + no-plan) so it's purely additive to the stats row.
export default function RoiBadge({ apiCostUsd, since }: { apiCostUsd: number; since: string }) {
  const [plan, setPlan] = useState<{ label: string; price: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tm_plan");
      if (raw) setPlan(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  if (!plan || plan.price <= 0) return null;

  const days = DAYS[since];
  const monthly = days ? apiCostUsd * (30 / days) : apiCostUsd; // "all" → raw
  const mult = monthly / plan.price;

  return (
    <li className="flex items-baseline gap-2">
      <span className="h-1 w-1 rounded-full bg-accent shrink-0 translate-y-[-2px]" />
      <span className="text-[11px] text-muted">vs {plan.label} plan</span>
      <span className="text-[14px] text-accent font-medium tabular-nums font-mono">
        {mult.toFixed(1)}× · ${plan.price}/mo
      </span>
    </li>
  );
}
