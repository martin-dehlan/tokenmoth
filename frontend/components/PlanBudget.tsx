"use client";

import { useEffect, useState } from "react";
import { fmtUsd, type Budget } from "@/lib/data";

// Plan & budget are one decision, not two settings (#audit): how you pay for
// Claude determines what's worth tracking.
//   - API / pay-as-you-go → tokens are real dollars → budget is the primary tool
//   - flat subscription (Pro/Max) → extra usage costs nothing → ROI badge is the
//     metric; a budget is only an optional "API-equivalent" awareness alert
// Plan choice stays in localStorage ("tm_plan", read by RoiBadge — price 0 hides
// the badge); the budget itself lives server-side via /api/budget.
const PLANS = [
  { key: "none", label: "None", price: 0 },
  { key: "pro", label: "Pro $20", price: 20, planLabel: "Pro" },
  { key: "max5", label: "Max 5× $100", price: 100, planLabel: "Max 5×" },
  { key: "max20", label: "Max 20× $200", price: 200, planLabel: "Max 20×" },
  { key: "api", label: "API (pay-as-you-go)", price: 0 },
] as const;
type PlanKey = (typeof PLANS)[number]["key"];

function loadPlanKey(): PlanKey {
  try {
    const raw = localStorage.getItem("tm_plan");
    if (!raw) return "none";
    const p = JSON.parse(raw) as { label?: string; price?: number; mode?: string };
    if (p.mode === "api" || p.label === "API") return "api";
    const hit = PLANS.find((x) => "planLabel" in x && x.price === p.price);
    return hit ? hit.key : "none";
  } catch {
    return "none";
  }
}

export default function PlanBudget() {
  const [planKey, setPlanKey] = useState<PlanKey>("none");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [trackEquivalent, setTrackEquivalent] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPlanKey(loadPlanKey());
    (async () => {
      try {
        const r = await fetch("/api/budget", { cache: "no-store" });
        if (r.ok) {
          const b = (await r.json()) as { budget_usd: number; spend_usd: number; pct: number };
          setBudget({ budgetUsd: b.budget_usd, spendUsd: b.spend_usd, pct: b.pct });
          if (b.budget_usd > 0) {
            setInput(String(b.budget_usd));
            setTrackEquivalent(true); // existing budget → opt-in already taken
          }
        } else if (r.status !== 404) {
          setLoadErr(`Couldn't load your current budget (${r.status}).`);
        }
      } catch {
        setLoadErr("Couldn't load your current budget — check your connection.");
      }
    })();
  }, []);

  function pick(key: PlanKey) {
    setPlanKey(key);
    if (key === "api") {
      // price 0 keeps the ROI badge hidden — their cost IS the API cost
      localStorage.setItem("tm_plan", JSON.stringify({ label: "API", price: 0, mode: "api" }));
    } else if (key === "none") {
      localStorage.removeItem("tm_plan");
    } else {
      const p = PLANS.find((x) => x.key === key)!;
      localStorage.setItem(
        "tm_plan",
        JSON.stringify({ label: (p as { planLabel?: string }).planLabel ?? p.label, price: p.price })
      );
    }
  }

  async function putBudget(value: number | null): Promise<boolean> {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budget_usd: value }),
      });
      if (r.ok) {
        if (value && value > 0) {
          const b = (await r.json()) as { budget_usd: number; spend_usd: number; pct: number };
          setBudget({ budgetUsd: b.budget_usd, spendUsd: b.spend_usd, pct: b.pct });
        } else {
          setBudget(null);
          setInput("");
        }
        return true;
      }
      setErr(`Couldn't save (${r.status}).`);
      return false;
    } catch {
      setErr("Couldn't reach the server.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0) {
      setErr("Enter a non-negative dollar amount.");
      return;
    }
    if (await putBudget(value)) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }
  }

  // Toggling the opt-in OFF deactivates the budget server-side so banner/alerts
  // stop; toggling ON just reveals the form (nothing saved until they submit).
  async function toggleEquivalent(on: boolean) {
    setTrackEquivalent(on);
    if (!on && budget && budget.budgetUsd > 0) {
      const ok = await putBudget(null);
      if (!ok) setTrackEquivalent(true);
    }
  }

  const isSubscription = planKey !== "none" && planKey !== "api";
  const showBudgetForm =
    planKey === "api" || (isSubscription && trackEquivalent) || (planKey === "none" && budget !== null && budget.budgetUsd > 0);

  return (
    <div className="flex flex-col gap-4">
      {loadErr && (
        <p className="text-[11px] text-warn" role="alert">
          {loadErr}
        </p>
      )}

      <div className="seg flex-wrap">
        {PLANS.map((p) => (
          <button key={p.key} data-active={p.key === planKey} onClick={() => pick(p.key)} className="text-muted">
            {p.label}
          </button>
        ))}
      </div>

      {planKey === "none" && (
        <p className="text-[11px] text-faint leading-relaxed">
          Pick how you pay for Claude. A flat subscription gets the ROI view on the dashboard; API
          pay-as-you-go gets a real-dollar monthly budget with alerts.
        </p>
      )}

      {isSubscription && (
        <>
          <p className="text-[11px] text-faint leading-relaxed">
            Flat plan — extra usage doesn&apos;t cost extra. The dashboard shows your ROI vs API
            pricing instead of a spend alarm.
          </p>
          <label className="flex items-center gap-2 text-[12px] text-muted select-none">
            <input
              type="checkbox"
              checked={trackEquivalent}
              disabled={saving}
              onChange={(e) => toggleEquivalent(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            additionally track an API-equivalent budget (awareness alerts, not real spend)
          </label>
        </>
      )}

      {planKey === "api" && (
        <p className="text-[11px] text-faint leading-relaxed">
          Pay-as-you-go — your tokens bill at API rates. Set a monthly budget; the dashboard warns
          at 80% and 100%.
        </p>
      )}

      {showBudgetForm && (
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">$</span>
            <input
              type="number"
              min="0"
              step="1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="decimal"
              className="w-28 border border-line rounded-btn px-3 py-1.5 text-[16px] sm:text-[13px] shadow-btn focus:outline-none focus:border-accent bg-surface tabular-nums"
            />
            <span className="text-[12px] text-muted">/ month</span>
            <button type="submit" className="btn btn-accent" disabled={saving}>
              {saving ? "saving…" : saved ? "saved ✓" : "save"}
            </button>
            {planKey !== "api" || !budget || budget.budgetUsd <= 0 ? null : (
              <button type="button" className="btn text-muted" onClick={() => putBudget(null)} disabled={saving}>
                remove budget
              </button>
            )}
          </div>
          {budget && budget.budgetUsd > 0 && (
            <div className="text-[11px] text-faint tabular-nums">
              {fmtUsd(budget.spendUsd)} {planKey === "api" ? "spent" : "API-equivalent used"} this
              month · {budget.pct.toFixed(0)}% of budget
            </div>
          )}
          {err && (
            <p className="text-[11px] text-warn" role="alert">
              {err}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
