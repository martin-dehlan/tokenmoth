import { HookOverhead, fmtTokens } from "@/lib/data";

// Overhead tokens per plugin/hook, ranked — answers "what's my plugin tax" (#85).
export default function HookBreakdown({ hooks }: { hooks: HookOverhead[] }) {
  const max = Math.max(1, ...hooks.map((h) => h.tokens));
  return (
    <div className="flex flex-col gap-3">
      {hooks.map((h) => (
        <div key={h.hook} className="grid grid-cols-[6rem_1fr_4rem] sm:grid-cols-[12rem_1fr_5rem] items-center gap-3 sm:gap-4">
          <span className="font-mono text-[12px] text-ink truncate" title={h.hook}>
            {h.hook}
          </span>
          <div className="track">
            <i style={{ width: `${Math.round((h.tokens / max) * 100)}%`, background: "var(--chart-3)" }} />
          </div>
          <span className="font-mono text-[12px] text-muted tabular-nums text-right">
            {fmtTokens(h.tokens)}
          </span>
        </div>
      ))}
    </div>
  );
}
