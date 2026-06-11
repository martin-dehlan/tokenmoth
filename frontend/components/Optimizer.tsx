import { type ReactNode } from "react";
import { fmtTokens, type HookOverhead, type McpUsage } from "@/lib/data";

// Optimizer (#153/#154): two lean ledger tables of what to act on, ordered by
// impact. Dead MCP servers first (they inflate the baseline re-read on every
// call), hook injections second (real but small). Side-by-side on wide screens,
// stacked on mobile. Bars belong to the breakdown sections; this is a decision
// table, so it stays numeric — status lamp (amber = never called) does the work.
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
  const dead = mcpUsage
    .filter((m) => m.sessionsCalled === 0)
    .sort((a, b) => b.sessionsLoaded - a.sessionsLoaded);
  const used = mcpUsage
    .filter((m) => m.sessionsCalled > 0)
    .sort((a, b) => b.calls - a.calls);
  const servers = [...dead, ...used];
  const rankedHooks = [...hooks].filter((h) => h.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const monthly = (tokens: number) => Math.round((tokens / Math.max(1, windowDays)) * 30);

  const showMcp = servers.length > 0;
  const showHooks = rankedHooks.length > 0;
  if (!showMcp && !showHooks) return null;

  return (
    <div className={`grid gap-x-12 gap-y-9 ${showMcp && showHooks ? "lg:grid-cols-2" : ""}`}>
      {showMcp && (
        <section>
          <Head
            label="MCP servers — loaded vs called"
            hint={avgBaselineTokens > 0 ? `baseline ${fmtTokens(avgBaselineTokens)} / call` : undefined}
          />
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-line-soft">
                <Th className="text-left">server</Th>
                <Th className="text-right w-16">calls</Th>
                <Th className="text-right w-20">sessions</Th>
              </tr>
            </thead>
            <tbody>
              {servers.map((m) => {
                const isDead = m.sessionsCalled === 0;
                return (
                  <tr key={m.server} className="border-b border-hair last:border-0">
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <i
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${isDead ? "bg-warn" : "bg-accent"}`}
                        />
                        <span
                          className={`font-mono text-[12px] truncate ${isDead ? "text-warn" : "text-ink"}`}
                          title={m.server}
                        >
                          {m.server}
                        </span>
                      </span>
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono text-[12px] tabular-nums ${isDead ? "text-warn" : "text-muted"}`}
                    >
                      {isDead ? "0" : `${m.calls}×`}
                    </td>
                    <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-muted">
                      {m.sessionsCalled}/{m.sessionsLoaded}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {dead.length > 0 && (
            <p className="mt-2.5 text-[10px] text-faint leading-relaxed">
              <span className="text-warn">{dead.length} never called</span> — their tool schemas
              still load into every session&apos;s baseline and get re-read on each call. Cheapest
              cut available.
            </p>
          )}
        </section>
      )}

      {showHooks && (
        <section>
          <Head label="hook / plugin injections" hint="projected / mo · the small lever" />
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-line-soft">
                <Th className="text-left">hook</Th>
                <Th className="text-right w-20">window</Th>
                <Th className="text-right w-20">/ mo</Th>
              </tr>
            </thead>
            <tbody>
              {rankedHooks.map((h) => (
                <tr key={h.hook} className="border-b border-hair last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="font-mono text-[12px] text-ink truncate block" title={h.hook}>
                      {h.hook}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-muted">
                    {fmtTokens(h.tokens)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-muted">
                    ≈{fmtTokens(monthly(h.tokens))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-[10px] text-faint leading-relaxed">
            Injected context per hook, projected to a month at this window&apos;s pace. Usually a
            fraction of total usage — the big levers are dead MCP servers and session length (see a
            session&apos;s cost anatomy).
          </p>
        </section>
      )}
    </div>
  );
}

function Head({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2.5">
      <h3 className="text-[10px] uppercase tracking-label text-muted">{label}</h3>
      {hint && (
        <span className="text-[10px] tracking-label text-faint tabular-nums truncate shrink-0">
          {hint}
        </span>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`pb-1.5 text-[10px] uppercase tracking-label font-normal text-faint ${className}`}>
      {children}
    </th>
  );
}
