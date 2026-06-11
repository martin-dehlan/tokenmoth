"use client";

import { useEffect, useState } from "react";
import { fmtUsd, type Budget } from "@/lib/data";

// Settings control to set the monthly budget (#30). Reads + writes via the
// /api/budget proxy; shows month-to-date spend against the saved budget.
export default function BudgetSetting() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/budget", { cache: "no-store" });
        if (r.ok) {
          const b = (await r.json()) as { budget_usd: number; spend_usd: number; pct: number };
          const next = { budgetUsd: b.budget_usd, spendUsd: b.spend_usd, pct: b.pct };
          setBudget(next);
          setInput(String(next.budgetUsd));
        }
      } catch {
        /* leave unset — the form still works */
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0) {
      setErr("Enter a non-negative dollar amount.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budget_usd: value }),
      });
      if (r.ok) {
        const b = (await r.json()) as { budget_usd: number; spend_usd: number; pct: number };
        setBudget({ budgetUsd: b.budget_usd, spendUsd: b.spend_usd, pct: b.pct });
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      } else {
        setErr(`Couldn't save (${r.status}).`);
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">$</span>
        <input
          type="number"
          min="0"
          step="1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-28 border border-line rounded-btn px-3 py-1.5 text-[13px] shadow-btn focus:outline-none focus:border-accent bg-surface tabular-nums"
        />
        <span className="text-[12px] text-muted">/ month</span>
        <button type="submit" className="btn btn-accent" disabled={saving}>
          {saving ? "saving…" : saved ? "saved ✓" : "save"}
        </button>
      </div>
      {budget && (
        <div className="text-[11px] text-faint tabular-nums">
          {fmtUsd(budget.spendUsd)} spent this month · {budget.pct.toFixed(0)}% of budget
        </div>
      )}
      {err && (
        <p className="text-[11px] text-warn" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
