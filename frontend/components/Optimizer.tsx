import { fmtTokens, type HookOverhead, type McpUsage } from "@/lib/data";

// Optimizer (#153/#154): turns the window's data into things to act on,
// ordered by impact — dead MCP servers first (they inflate the baseline
// re-read on every call), hook injections last (real but small).
export default function Optimizer({
  mcpUsage,
  hooks,
  windowDays,
  avgBaselineTokens,
}: {
  mcpUsage: McpUsage[];
  hooks: HookOverhead[];
  windowDays: number;
  avgBaselineTokens: number;
}) {
  const dead = mcpUsage.filter((m) => m.sessionsCalled === 0);
  const used = mcpUsage.filter((m) => m.sessionsCalled > 0);
  const maxLoaded = Math.max(1, ...mcpUsage.map((m) => m.sessionsLoaded));
  const rankedHooks = [...hooks].sort((a, b) => b.tokens - a.tokens).filter((h) => h.tokens > 0);
  const monthly = (tokens: number) => Math.round((tokens / Math.max(1, windowDays)) * 30);

  if (mcpUsage.length === 0 && rankedHooks.length === 0) return null;

  return (
    <div className="flex flex-col gap-7">
      {mcpUsage.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[10px] uppercase tracking-label text-muted">
              MCP servers — loaded vs called
            </h3>
            {avgBaselineTokens > 0 && (
              <span className="text-[10px] tracking-label text-faint tabular-nums">
                avg baseline {fmtTokens(avgBaselineTokens)} / call
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {[...dead, ...used].map((m) => {
              const isDead = m.sessionsCalled === 0;
              return (
                <div
                  key={m.server}
                  className="grid grid-cols-[8rem_1fr_8rem] sm:grid-cols-[14rem_1fr_11rem] items-center gap-3 sm:gap-4"
                >
                  <span
                    className={`font-mono text-[12px] truncate ${isDead ? "text-warn" : "text-ink"}`}
                    title={m.server}
                  >
                    {m.server}
                  </span>
                  <div className="track">
                    <i
                      style={{
                        width: `${Math.round((m.sessionsLoaded / maxLoaded) * 100)}%`,
                        background: isDead ? "#9a6200" : "#1a7f64",
                      }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-muted tabular-nums text-right">
                    {isDead
                      ? `0 / ${m.sessionsLoaded} sessions`
                      : `${m.sessionsCalled} / ${m.sessionsLoaded} · ${m.calls}×`}
                  </span>
                </div>
              );
            })}
          </div>
          {dead.length > 0 && (
            <p className="mt-3 text-[10px] text-faint leading-relaxed max-w-prose">
              <span className="text-warn">{dead.length} server(s) never called</span> — their tool
              schemas still load into every session&apos;s baseline and get re-read on every API
              call. Removing them is the cheapest cut available.
            </p>
          )}
        </div>
      )}

      {rankedHooks.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[10px] uppercase tracking-label text-muted">
              hook / plugin injections
            </h3>
            <span className="text-[10px] tracking-label text-faint">
              projected / month · the small lever
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {rankedHooks.map((h) => (
              <div
                key={h.hook}
                className="grid grid-cols-[8rem_1fr_8rem] sm:grid-cols-[14rem_1fr_11rem] items-center gap-3 sm:gap-4"
              >
                <span className="font-mono text-[12px] text-ink truncate" title={h.hook}>
                  {h.hook}
                </span>
                <div className="track">
                  <i
                    style={{
                      width: `${Math.round((h.tokens / Math.max(1, rankedHooks[0].tokens)) * 100)}%`,
                      background: "#1a4f7f",
                    }}
                  />
                </div>
                <span className="font-mono text-[11px] text-muted tabular-nums text-right">
                  {fmtTokens(h.tokens)} · ≈{fmtTokens(monthly(h.tokens))}/mo
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-faint leading-relaxed max-w-prose">
            Injected context per hook across this window, projected to a month. Usually a
            fraction of a percent of total usage — the big levers are dead MCP servers and
            session length (see a session&apos;s cost anatomy).
          </p>
        </div>
      )}
    </div>
  );
}
