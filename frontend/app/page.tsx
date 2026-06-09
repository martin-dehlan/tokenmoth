import Link from "next/link";
import RepoList from "@/components/RepoList";
import RoiBadge from "@/components/RoiBadge";
import ModelBreakdown from "@/components/ModelBreakdown";
import HookBreakdown from "@/components/HookBreakdown";
import TopRail from "@/components/TopRail";
import AnnotatedChart from "@/components/AnnotatedChart";
import { fetchDashboard, fmtTokens, fmtUsd, fmtChartLabel } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WINDOWS = ["1h", "5h", "12h", "24h", "7d", "30d", "90d", "all"];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { since?: string };
}) {
  const since = WINDOWS.includes(searchParams.since ?? "") ? searchParams.since! : "30d";
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  const { repos, series, models, trends, apiCostUsd, overheadByHook, source, error } =
    await fetchDashboard(token, since);
  const live = source === "live";

  const grandTokens = repos.reduce((a, r) => a + r.totalTokens, 0);
  const grandSessions = repos.reduce((a, r) => a + r.sessions, 0);
  const grandCacheRead = repos.reduce((a, r) => a + r.cacheReadTokens, 0);
  const grandOverhead = repos.reduce((a, r) => a + r.hookOverheadTokens, 0);
  const overheadPct = grandTokens > 0 ? Math.round((grandOverhead / grandTokens) * 100) : 0;
  const ranked = [...repos].sort((a, b) => b.totalTokens - a.totalTokens);
  const activeDays = Math.max(1, series.length);
  const avgPerDay = grandTokens / activeDays;

  return (
    <>
      <TopRail active="usage" since={since} />

      <main className="mx-auto max-w-5xl px-5">
        {!live && (
          <div className="mt-5 text-[11px] text-warn flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-warn inline-block" />
            demo mode — {error ?? "no live connection"}. set TOKENMOTH_API_URL + TOKENMOTH_API_KEY to
            go live.
          </div>
        )}

        {/* one elevated surface */}
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          {/* HERO */}
          <section id="hero" className="px-8 pt-8 pb-7">
            <div className="flex flex-col lg:flex-row lg:items-end gap-x-12 gap-y-6">
              <div className="shrink-0">
                <div className="text-[10px] uppercase tracking-label text-faint mb-2">
                  tokens · last {since} · excl. cache reads
                </div>
                <div className="font-mono font-medium text-ink text-[56px] leading-[0.9] tracking-hero tabular-nums">
                  {fmtTokens(grandTokens)}
                </div>
              </div>

              {/* floating annotations */}
              <ul className="flex flex-wrap gap-x-8 gap-y-2.5 lg:pb-2">
                <Annotation label="API equiv." value={fmtUsd(apiCostUsd)} accent />
                <RoiBadge apiCostUsd={apiCostUsd} since={since} />
                <Annotation label="repos" value={`${repos.length}`} />
                <Annotation label="avg / day" value={`${fmtTokens(avgPerDay)} tok`} />
                <Annotation label="sessions" value={`${grandSessions}`} />
                <Annotation label="cache reads" value={`${fmtTokens(grandCacheRead)} tok`} />
                <Annotation
                  label="overhead"
                  value={`~${overheadPct}%`}
                  title="estimated tokens from SessionStart hooks (plugins, MCP context injections)"
                />
                {ranked[0] && <Annotation label="busiest" value={ranked[0].repo} />}
                {trends?.hasPrevious && trends.deltaPct !== null && (
                  <Annotation
                    label={`vs prev ${since}`}
                    value={`${trends.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(trends.deltaPct)}%`}
                  />
                )}
                {trends && trends.projectedMonthlyTokens > 0 && (
                  <Annotation
                    label="proj / mo"
                    value={`${fmtTokens(trends.projectedMonthlyTokens)} tok`}
                  />
                )}
              </ul>
            </div>
          </section>

          {/* CHART */}
          <section className="px-8 py-6 border-t border-hair">
            {series.length > 0 ? (
              <AnnotatedChart
                series={[
                  {
                    name: since.endsWith("h") ? (since === "1h" || since === "5h" ? "tokens / min" : "tokens / hr") : "tokens / day",
                    color: "#1a7f64",
                    values: series.map((p) => p.totalTokens),
                  },
                ]}
                xLabels={series.map((p) => fmtChartLabel(p.day, since))}
                format={fmtTokens}
              />
            ) : (
              <div className="text-[12px] text-faint py-10 text-center">
                no activity in this window yet
              </div>
            )}
          </section>

          {/* MODELS */}
          {models.length > 0 && (
            <section className="px-8 pt-7 pb-7 border-t border-hair">
              <h2 className="text-[10px] uppercase tracking-label text-muted mb-4">by model</h2>
              <ModelBreakdown models={models} />
            </section>
          )}

          {/* HOOK / PLUGIN OVERHEAD */}
          {overheadByHook.length > 0 && (
            <section className="px-8 pt-7 pb-7 border-t border-hair">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[10px] uppercase tracking-label text-muted">
                  overhead by plugin / hook
                </h2>
                <span className="text-[10px] tracking-label text-faint">
                  est. injected context · what to disable
                </span>
              </div>
              <HookBreakdown hooks={overheadByHook} />
            </section>
          )}

          {/* INSTRUMENTS */}
          <section id="instruments" className="px-8 pt-7 pb-7 border-t border-hair">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-label text-muted">repositories</h2>
              <div className="flex items-center gap-3">
                {ranked.length > 0 && (
                  <a
                    href={`/api/export?format=csv&since=${since}`}
                    className="btn text-muted"
                    download
                  >
                    export CSV
                  </a>
                )}
                <span className="text-[10px] tracking-label text-faint">
                  {repos.length} tracked {live ? "· live" : "· demo"}
                </span>
              </div>
            </div>

            {ranked.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center gap-3">
                <div className="text-[13px] text-muted">No data yet — let&apos;s get you set up.</div>
                <Link href="/onboarding" className="btn btn-accent">
                  Get started →
                </Link>
              </div>
            ) : (
              <RepoList repos={ranked} />
            )}
          </section>
        </div>

        <footer className="pb-10 text-[11px] text-faint">
          tracked via Claude Code SessionEnd hook
        </footer>
      </main>
    </>
  );
}

function Annotation({
  label,
  value,
  accent,
  title,
}: {
  label: string;
  value: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <li className="flex items-baseline gap-2" title={title}>
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
