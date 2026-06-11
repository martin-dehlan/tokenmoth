"use client";

import { useEffect, useState } from "react";
import { fmtTokens, type PlanInfo } from "@/lib/data";

// Subscription tier + usage, with a Stripe Checkout upgrade button (#33/#34).
// Degrades gracefully when billing isn't configured server-side.
const PAID_TIERS = [
  { id: "pro", label: "Pro", price: 20 },
  { id: "max", label: "Max", price: 100 },
];

export default function PlanBilling() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/plan", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          setPlan({
            plan: d.plan,
            status: d.status,
            billingEnabled: !!d.billing_enabled,
            label: d.label,
            priceUsd: d.price_usd,
            monthlyTokenLimit: d.monthly_token_limit,
            tokensThisMonth: d.tokens_this_month,
            overLimit: !!d.over_limit,
          });
        }
      } catch {
        /* leave null */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function upgrade(tier: string) {
    setBusy(tier);
    setErr(null);
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (r.ok) {
        const { url } = await r.json();
        if (url) {
          window.location.href = url;
          return;
        }
        setErr("No checkout URL returned.");
      } else if (r.status === 501) {
        setErr("Billing isn't configured yet.");
      } else {
        setErr(`Checkout failed (${r.status}).`);
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-[12px] text-faint">loading…</div>;
  if (!plan) return <div className="text-[12px] text-faint">plan unavailable</div>;

  // The free-tier allowance is only meaningful once billing is live.
  const limit = plan.billingEnabled ? plan.monthlyTokenLimit : null;
  const pct = limit ? Math.min(100, Math.round((plan.tokensThisMonth / limit) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-ink font-medium">{plan.label}</span>
          {plan.status && <span className="text-[11px] text-faint">· {plan.status}</span>}
        </div>
        <div className="text-[11px] text-muted tabular-nums">
          {fmtTokens(plan.tokensThisMonth)} tok this month
          {limit ? ` / ${fmtTokens(limit)} (${pct}%)` : plan.billingEnabled ? " · unlimited" : ""}
        </div>
      </div>

      {plan.overLimit && (
        <div className="text-[11px] text-warn" role="alert">
          You&apos;ve passed your plan&apos;s monthly token allowance — consider upgrading.
        </div>
      )}

      {plan.billingEnabled ? (
        <div className="flex items-center gap-2 flex-wrap">
          {PAID_TIERS.map((t) => (
            <button
              key={t.id}
              className="btn"
              disabled={busy !== null || plan.plan === t.id}
              onClick={() => upgrade(t.id)}
            >
              {plan.plan === t.id
                ? `current: ${t.label}`
                : busy === t.id
                  ? "redirecting…"
                  : `upgrade to ${t.label} · $${t.price}/mo`}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-faint leading-relaxed max-w-md">
          Paid plans aren&apos;t enabled on this deployment yet. Set the <code>STRIPE_*</code> env
          vars to turn on checkout.
        </p>
      )}

      {err && (
        <p className="text-[11px] text-warn" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
