import Link from "next/link";
import TopRail from "@/components/TopRail";
import HookBreakdown from "@/components/HookBreakdown";
import CostAnatomy from "@/components/CostAnatomy";
import { fetchSession, fmtTokens, relativeTime, type HookOverhead } from "@/lib/data";
import { PAGE_MAIN } from "@/lib/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SessionDetail({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const s = await fetchSession(session?.access_token ?? "", id);

  if (!s) {
    return (
      <>
        <TopRail active="usage" since="30d" />
        <main className={PAGE_MAIN}>
          <div className="my-7 rounded-surface border border-line bg-surface shadow-surface px-8 py-12 text-center">
            <div className="text-[13px] text-muted mb-3">session not found</div>
            <Link href="/" className="btn text-muted">
              ◀ <span className="text-ink">panel</span>
            </Link>
          </div>
        </main>
      </>
    );
  }

  const overheadPct = s.totalTokens > 0 ? Math.round((s.hookOverheadTokens / s.totalTokens) * 100) : 0;
  // Plugin/hook overhead rows for this session, ranked, zero-token rows dropped.
  const hooks: HookOverhead[] = Object.entries(s.hookOverheadBreakdown)
    .filter(([, t]) => t > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([hook, tokens]) => ({ hook, tokens, sessions: 1 }));

  // Cost Anatomy (#152) needs per-turn data — rows from older CLI versions
  // (turnCount 0) fall back to the pre-anatomy view.
  const hasAnatomy = s.turnCount > 0;
  // MCP servers: union of "loaded" (log dirs) and "called" (transcript) (#153).
  const mcpNames = Array.from(new Set([...s.mcpServers, ...Object.keys(s.mcpCalls)])).sort();

  return (
    <>
      <TopRail active="usage" since="30d" />

      <main className={PAGE_MAIN}>
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          {/* HERO */}
          <section className="px-8 pt-8 pb-7">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Link href={`/repo/${encodeURIComponent(s.repo)}`} className="btn text-muted">
                ◀ <span className="text-ink">{s.repo}</span>
              </Link>
              <span className="font-mono text-[12px] text-faint">session</span>
              {s.model && <span className="text-[11px] text-faint">{s.model}</span>}
              <span className="text-[11px] text-faint">· {relativeTime(s.endedAt)}</span>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end gap-x-12 gap-y-6">
              <div className="shrink-0">
                <div className="text-[10px] uppercase tracking-label text-faint mb-2">tokens</div>
                <div className="font-mono font-medium text-ink text-[56px] leading-[0.9] tracking-hero tabular-nums">
                  {fmtTokens(s.totalTokens)}
                </div>
              </div>
              <ul className="flex flex-wrap gap-x-8 gap-y-2.5 lg:pb-2">
                {hasAnatomy && (
                  <>
                    <Annotation
                      label="baseline / call"
                      value={fmtTokens(s.baselineTokens)}
                      accent
                    />
                    <Annotation label="API calls" value={`${s.turnCount}`} />
                  </>
                )}
                <Annotation
                  label="hook overhead"
                  value={`~${overheadPct}% · ${fmtTokens(s.hookOverheadTokens)}`}
                />
                <Annotation label="plugins / hooks" value={`${hooks.length}`} />
              </ul>
            </div>
          </section>

          {/* COST ANATOMY — where this session's tokens actually went (#152) */}
          {hasAnatomy && (
            <section className="px-8 pt-7 pb-7 border-t border-hair">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[10px] uppercase tracking-label text-muted">cost anatomy</h2>
                <span className="text-[10px] tracking-label text-faint">
                  measured per API call · what to shrink
                </span>
              </div>
              <CostAnatomy
                turnUsage={s.turnUsage}
                baselineTokens={s.baselineTokens}
                turnCount={s.turnCount}
                inputTokens={s.inputTokens}
                outputTokens={s.outputTokens}
                cacheReadTokens={s.cacheReadTokens}
                cacheCreationTokens={s.cacheCreationTokens}
              />
            </section>
          )}

          {/* PLUGIN / HOOK OVERHEAD */}
          <section className="px-8 pt-7 pb-7 border-t border-hair">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[10px] uppercase tracking-label text-muted">
                overhead by plugin / hook
              </h2>
              <span className="text-[10px] tracking-label text-faint">
                est. injected context · what to disable
              </span>
            </div>
            {hooks.length > 0 ? (
              <HookBreakdown hooks={hooks} />
            ) : (
              <div className="text-[12px] text-faint py-6 text-center">
                no plugin overhead recorded for this session
              </div>
            )}
          </section>

          {/* MCP SERVERS — loaded vs actually called (#153) */}
          {mcpNames.length > 0 && (
            <section className="px-8 pt-7 pb-7 border-t border-hair">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[10px] uppercase tracking-label text-muted">
                  MCP servers active
                </h2>
                <span className="text-[10px] tracking-label text-faint">
                  {mcpNames.length} loaded
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {mcpNames.map((m) => {
                  const calls = s.mcpCalls[m] ?? 0;
                  const dead = hasAnatomy && calls === 0;
                  return (
                    <span
                      key={m}
                      className={`text-[11px] font-mono border rounded-btn px-2 py-1 ${
                        dead ? "text-warn border-warn" : "text-muted border-hair"
                      }`}
                      title={dead ? "loaded but never called this session" : undefined}
                    >
                      {m}
                      {hasAnatomy && (
                        <span className={`ml-1.5 tabular-nums ${dead ? "" : "text-faint"}`}>
                          {calls === 0 ? "0 calls" : `${calls}×`}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] text-faint leading-relaxed max-w-prose">
                {hasAnatomy ? (
                  <>
                    Every loaded server&apos;s tool schemas sit in the {fmtTokens(s.baselineTokens)}{" "}
                    baseline re-read on each of the {s.turnCount} calls — servers at 0 calls paid
                    that price for nothing this session.
                  </>
                ) : (
                  <>
                    Per-server token cost isn&apos;t separately measurable — MCP tool schemas are
                    injected into the request, not the transcript. That cost is already counted in
                    this session&apos;s totals above.
                  </>
                )}
              </p>
            </section>
          )}
        </div>

        <footer className="pb-10 text-[11px] text-faint">
          overhead is an estimate from injected context
        </footer>
      </main>
    </>
  );
}

function Annotation({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <li className="flex items-baseline gap-2">
      <span
        className={`h-1 w-1 rounded-full shrink-0 translate-y-[-2px] ${accent ? "bg-accent" : "bg-line-strong"}`}
      />
      <span className="text-[11px] text-muted">{label}</span>
      <span
        className={`tabular-nums font-mono ${accent ? "text-[14px] text-accent font-medium" : "text-[13px] text-ink"}`}
      >
        {value}
      </span>
    </li>
  );
}
