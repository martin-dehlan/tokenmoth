"use client";

import { useEffect, useState } from "react";

// Subscription plans for ROI comparison (#72 Phase 2). Stored client-side in
// localStorage ("tm_plan"); migrate to user_settings later for cross-device.
const PLANS = [
  { label: "None", price: 0 },
  { label: "Pro", price: 20 },
  { label: "Max 5×", price: 100 },
  { label: "Max 20×", price: 200 },
] as const;

export default function PlanSelect() {
  const [price, setPrice] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tm_plan");
      if (raw) setPrice(JSON.parse(raw).price ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  function pick(p: (typeof PLANS)[number]) {
    setPrice(p.price);
    if (p.price > 0) localStorage.setItem("tm_plan", JSON.stringify({ label: p.label, price: p.price }));
    else localStorage.removeItem("tm_plan");
  }

  return (
    <div className="seg">
      {PLANS.map((p) => (
        <button
          key={p.label}
          data-active={p.price === price}
          onClick={() => pick(p)}
          className="text-muted"
        >
          {p.label}
          {p.price > 0 ? ` $${p.price}` : ""}
        </button>
      ))}
    </div>
  );
}
