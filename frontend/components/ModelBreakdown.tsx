import RevealOnView from "./RevealOnView";
import { ModelUsage, fmtTokens, modelColor } from "@/lib/data";

// Models are a share-of-total, not a ranking — so render one stacked
// composition bar + a compact legend instead of a stack of full-width bars
// (which just repeats the repository ranking visual right below it).
export default function ModelBreakdown({ models }: { models: ModelUsage[] }) {
  const total = models.reduce((a, m) => a + m.totalTokens, 0);
  const sorted = [...models].sort((a, b) => b.totalTokens - a.totalTokens);
  const pct = (t: number) => (total > 0 ? (t / total) * 100 : 0);
  const label = (t: number) => {
    const p = pct(t);
    return p >= 1 ? `${Math.round(p)}%` : p > 0 ? "<1%" : "0%";
  };

  return (
    <RevealOnView>
      <div
        data-bar
        className="flex h-2.5 rounded-[3px_6px_6px_3px] overflow-hidden border border-line shadow-track bg-surface"
      >
        {sorted.map((m) => (
          <i
            key={m.model}
            className="h-full"
            style={{
              width: `${pct(m.totalTokens)}%`,
              minWidth: m.totalTokens > 0 ? "2px" : 0,
              background: modelColor(m.model),
            }}
            title={`${m.model} · ${fmtTokens(m.totalTokens)} · ${label(m.totalTokens)}`}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 mt-3.5">
        {sorted.map((m) => (
          <li key={m.model} className="flex items-baseline gap-2 min-w-0">
            <i
              className="h-1.5 w-1.5 rounded-full shrink-0 translate-y-[-1px]"
              style={{ background: modelColor(m.model) }}
            />
            <span className="font-mono text-[12px] text-ink truncate" title={m.model}>
              {m.model}
            </span>
            <span className="font-mono text-[12px] text-muted tabular-nums">
              {fmtTokens(m.totalTokens)}
            </span>
            <span className="text-[10px] tracking-label text-faint tabular-nums">
              {label(m.totalTokens)}
            </span>
          </li>
        ))}
      </ul>
    </RevealOnView>
  );
}
