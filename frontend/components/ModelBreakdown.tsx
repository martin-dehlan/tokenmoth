import { ModelUsage, fmtTokens, modelColor } from "@/lib/data";

export default function ModelBreakdown({ models }: { models: ModelUsage[] }) {
  const max = Math.max(1, ...models.map((m) => m.totalTokens));
  return (
    <div className="flex flex-col gap-3">
      {models.map((m) => (
        <div key={m.model} className="grid grid-cols-[10rem_1fr_5rem] items-center gap-4">
          <span className="font-mono text-[12px] text-ink truncate">{m.model}</span>
          <div className="track">
            <i
              style={{
                width: `${Math.round((m.totalTokens / max) * 100)}%`,
                background: modelColor(m.model),
              }}
            />
          </div>
          <span className="font-mono text-[12px] text-muted tabular-nums text-right">
            {fmtTokens(m.totalTokens)}
          </span>
        </div>
      ))}
    </div>
  );
}
