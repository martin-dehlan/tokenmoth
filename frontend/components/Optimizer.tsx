"use client";

import { useState, type ReactNode } from "react";
import { fmtTokens, type HookOverhead, type McpUsage } from "@/lib/data";

// Optimizer (#153/#154): what to act on, ordered by impact. Dead MCP servers
// collapse into a single actionable line (they all read "0" — listing each as a
// row is pure noise); the active servers stay a ledger table where the numbers
// vary. Hooks are the small lever. Long lists cap at CAP with a show-more
// toggle. Side-by-side on wide, stacked on mobile.
const CAP = 5;

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
  const rankedHooks = [...hooks].filter((h) => h.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const monthly = (tokens: number) => Math.round((tokens / Math.max(1, windowDays)) * 30);

  const [showDead, setShowDead] = useState(false);
  const [allUsed, setAllUsed] = useState(false);
  const [allHooks, setAllHooks] = useState(false);

  const showMcp = dead.length > 0 || used.length > 0;
  const showHooks = rankedHooks.length > 0;
  if (!showMcp && !showHooks) return null;

  const usedRows = allUsed ? used : used.slice(0, CAP);
  const hookRows = allHooks ? rankedHooks : rankedHooks.slice(0, CAP);

  return (
    <div className={`grid gap-x-12 gap-y-9 ${showMcp && showHooks ? "lg:grid-cols-2" : ""}`}>
      {showMcp && (
        <section>
          <Head
            label="MCP servers — loaded vs called"
            hint={avgBaselineTokens > 0 ? `baseline ${fmtTokens(avgBaselineTokens)} / call` : undefined}
          />

          {dead.length > 0 && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowDead((v) => !v)}
                className="text-left text-[11px] leading-relaxed"
              >
                <span className="text-warn">{dead.length} never called</span>
                <span className="text-faint"> — schemas reload every session. Drop them.</span>
                <span className="ml-1.5 text-[10px] uppercase tracking-label text-muted hover:text-ink">
                  {showDead ? "hide" : "show"}
                </span>
              </button>
              {showDead && (
                <p className="mt-1.5 font-mono text-[11px] text-faint leading-relaxed break-words">
                  {dead.map((d) => d.server).join(", ")}
                </p>
              )}
            </div>
          )}

          {used.length > 0 && (
            <>
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-line-soft">
                    <Th className="text-left">server</Th>
                    <Th className="text-right w-16">calls</Th>
                    <Th className="text-right w-20">sessions</Th>
                  </tr>
                </thead>
                <tbody>
                  {usedRows.map((m) => (
                    <tr key={m.server} className="border-b border-hair last:border-0">
                      <td className="py-1.5 pr-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <i className="h-1.5 w-1.5 rounded-full shrink-0 bg-accent" />
                          <span className="font-mono text-[12px] text-ink truncate" title={m.server}>
                            {m.server}
                          </span>
                        </span>
                      </td>
                      <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-muted">
                        {m.calls}×
                      </td>
                      <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-muted">
                        {m.sessionsCalled}/{m.sessionsLoaded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {used.length > CAP && (
                <Toggle expanded={allUsed} onClick={() => setAllUsed((v) => !v)} />
              )}
            </>
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
              {hookRows.map((h) => (
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
          {rankedHooks.length > CAP && (
            <Toggle expanded={allHooks} onClick={() => setAllHooks((v) => !v)} />
          )}
          <p className="mt-2.5 text-[10px] text-faint leading-relaxed">
            Injected context per hook, projected to a month at this window&apos;s pace — usually a
            fraction of total usage. The big levers are dead MCP servers and session length.
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

function Toggle({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 w-full text-[10px] uppercase tracking-label text-muted hover:text-ink border-t border-hair pt-2.5 transition-colors"
    >
      {expanded ? "show less" : "show more"}
    </button>
  );
}
