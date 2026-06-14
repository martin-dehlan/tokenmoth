import RevealOnView from "./RevealOnView";
import { fmtTokens } from "@/lib/data";

// Cost Anatomy (#152): decompose where a session's tokens actually went.
// Every API call re-reads the full prior context, so cost splits into
//   setup re-reads   — the measured first-call baseline × every call
//   conversation     — everything the session added on top (files, results, chat)
//   output           — what the model wrote
// All inputs are numeric token counts; the per-turn series is
// [input, cacheRead, cacheCreation, output] per API call.
export default function CostAnatomy({
  turnUsage,
  baselineTokens,
  turnCount,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
}: {
  turnUsage: number[][];
  baselineTokens: number;
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}) {
  // Context paid across the whole session (cache reads ARE re-paid context).
  const contextPaid = inputTokens + cacheReadTokens + cacheCreationTokens;
  const setupShare = Math.min(baselineTokens * turnCount, contextPaid);
  const growthShare = contextPaid - setupShare;

  const rows = [
    {
      label: "setup re-reads",
      tokens: setupShare,
      color: "var(--chart-3)",
      hint: `${fmtTokens(baselineTokens)} baseline × ${turnCount} calls`,
    },
    {
      label: "conversation context",
      tokens: growthShare,
      color: "var(--chart-2)",
      hint: "files, tool results, chat — re-read each call",
    },
    {
      label: "output",
      tokens: outputTokens,
      color: "var(--chart-1)",
      hint: "what the model wrote",
    },
  ];
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  const total = contextPaid + outputTokens;

  // Per-call context size for the growth curve.
  const sizes = turnUsage.map((t) => (t[0] ?? 0) + (t[1] ?? 0) + (t[2] ?? 0));
  const peak = Math.max(1, ...sizes);
  // Largest single jump between consecutive calls — usually a big file read or
  // tool result that every later call re-paid.
  let jumpAt = -1;
  let jump = 0;
  for (let i = 1; i < sizes.length; i++) {
    const d = sizes[i] - sizes[i - 1];
    if (d > jump) {
      jump = d;
      jumpAt = i;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <RevealOnView className="flex flex-col gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[8rem_1fr_4rem] sm:grid-cols-[12rem_1fr_5rem] items-center gap-3 sm:gap-4"
          >
            <span className="font-mono text-[12px] text-ink truncate" title={r.hint}>
              {r.label}
            </span>
            <div className="track">
              <i style={{ width: `${Math.round((r.tokens / max) * 100)}%`, background: r.color }} />
            </div>
            <span className="font-mono text-[12px] text-muted tabular-nums text-right">
              {fmtTokens(r.tokens)}
            </span>
          </div>
        ))}
      </RevealOnView>

      {sizes.length > 1 && (
        <RevealOnView>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] uppercase tracking-label text-faint">
              context size per API call
            </span>
            <span className="text-[10px] tracking-label text-faint tabular-nums">
              peak {fmtTokens(peak)}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${sizes.length} 100`}
            preserveAspectRatio="none"
            className="w-full h-20 block"
            role="img"
            aria-label="context size per API call"
          >
            {sizes.map((s, i) => (
              <rect
                key={i}
                className="ca-bar"
                style={{ animationDelay: `calc(var(--motion-stagger) * ${i})` }}
                x={i + 0.12}
                y={100 - (s / peak) * 100}
                width={0.76}
                height={(s / peak) * 100}
                fill={i === jumpAt ? "var(--chart-3)" : "var(--chart-2)"}
                opacity={i === jumpAt ? 1 : 0.55}
              />
            ))}
          </svg>
          {jumpAt > 0 && (
            <p className="mt-2 text-[10px] text-faint leading-relaxed">
              largest jump: +{fmtTokens(jump)} at call {jumpAt + 1}
              {turnCount > jumpAt + 1 &&
                ` — re-paid by every one of the ${turnCount - jumpAt - 1} calls after it`}
            </p>
          )}
        </RevealOnView>
      )}

      {total > 0 && setupShare > 0 && (
        <p className="text-[10px] text-faint leading-relaxed max-w-prose">
          {Math.round((setupShare / total) * 100)}% of this session went into re-reading the
          fixed setup (system prompt, tool &amp; MCP schemas, hooks) on every call. A leaner
          setup or an earlier /clear shrinks exactly this share.
        </p>
      )}
    </div>
  );
}
