import Link from "next/link";
import TopRail from "@/components/TopRail";
import AnnotatedChart from "@/components/AnnotatedChart";
import SessionList from "@/components/SessionList";
import { fetchRepoSeries, fetchSessions, fmtTokens, fmtChartLabel, padSeriesToWindow } from "@/lib/data";
import { PAGE_MAIN } from "@/lib/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WINDOWS = ["1h", "5h", "12h", "24h", "7d", "30d", "90d", "all"];

export default async function RepoDetail({
  params,
  searchParams,
}: {
  params: { name: string };
  searchParams: { since?: string };
}) {
  const name = decodeURIComponent(params.name);
  const since = WINDOWS.includes(searchParams.since ?? "") ? searchParams.since! : "30d";
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const [{ points, source, error }, sessions] = await Promise.all([
    fetchRepoSeries(session?.access_token ?? "", name, since),
    fetchSessions(session?.access_token ?? "", since, name),
  ]);
  const live = source === "live";

  const sum = points.reduce(
    (a, p) => ({
      tokens: a.tokens + p.totalTokens,
      sessions: a.sessions + p.sessions,
      input: a.input + p.inputTokens,
      output: a.output + p.outputTokens,
      cread: a.cread + p.cacheReadTokens,
      ccreate: a.ccreate + p.cacheCreationTokens,
    }),
    { tokens: 0, sessions: 0, input: 0, output: 0, cread: 0, ccreate: 0 },
  );
  const activeDays = Math.max(1, points.length);
  const chartPoints = padSeriesToWindow(points, since);

  const breakdown = [
    { label: "input", v: sum.input, color: "#1a7f64" },
    { label: "output", v: sum.output, color: "#1a4f7f" },
    { label: "cache read", v: sum.cread, color: "#9a6200" },
    { label: "cache write", v: sum.ccreate, color: "#6b7280" },
  ];
  const tmax = Math.max(1, ...breakdown.map((b) => b.v));

  return (
    <>
      <TopRail active="models" since={since} />

      <main className={PAGE_MAIN}>
        {!live && (
          <div className="mt-5 text-[11px] text-warn flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-warn inline-block" />
            demo mode — {error ?? "no live connection"}.
          </div>
        )}

        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          {/* HERO */}
          <section className="px-8 pt-8 pb-7">
            <div className="flex items-center gap-2 mb-4">
              <Link href="/" className="btn text-muted">
                ◀ <span className="text-ink">panel</span>
              </Link>
              <span className="font-mono text-[13px] text-faint">/{name}</span>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end gap-x-12 gap-y-6">
              <div className="shrink-0">
                <div className="text-[10px] uppercase tracking-label text-faint mb-2">
                  tokens · last {since}
                </div>
                <div className="font-mono font-medium text-ink text-[56px] leading-[0.9] tracking-hero tabular-nums">
                  {fmtTokens(sum.tokens)}
                </div>
              </div>
              <ul className="flex flex-wrap gap-x-8 gap-y-2.5 lg:pb-2">
                <Annotation label="sessions" value={`${sum.sessions}`} />
                <Annotation label="avg / day" value={`${fmtTokens(sum.tokens / activeDays)} tok`} />
                <Annotation label="active days" value={`${points.length}`} />
              </ul>
            </div>
          </section>

          {/* CHART — zero-filled across the full window so the x-axis always
              spans the selected range, flat at 0 when nothing happened. Only
              "all" with no data ever shows the empty state. */}
          <section className="px-8 py-6 border-t border-hair">
            {chartPoints.length > 0 ? (
              <AnnotatedChart
                series={[
                  { name: "total", color: "#1a7f64", values: chartPoints.map((p) => p.totalTokens) },
                  { name: "input", color: "#1a4f7f", dashed: true, values: chartPoints.map((p) => p.inputTokens) },
                  { name: "output", color: "#9a6200", dashed: true, values: chartPoints.map((p) => p.outputTokens) },
                ]}
                xLabels={chartPoints.map((p) => fmtChartLabel(p.day, since))}
                format={fmtTokens}
              />
            ) : (
              <div className="text-[12px] text-faint py-10 text-center">
                no activity for {name} yet
              </div>
            )}
          </section>

          {/* BREAKDOWN */}
          <section className="px-8 pt-7 pb-7 border-t border-hair">
            <h2 className="text-[10px] uppercase tracking-label text-muted mb-4">token breakdown</h2>
            <div className="flex flex-col gap-3">
              {breakdown.map((b) => (
                <div key={b.label} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-4">
                  <span className="text-[11px] text-muted">{b.label}</span>
                  <div className="track">
                    <i style={{ width: `${Math.round((b.v / tmax) * 100)}%`, background: b.color }} />
                  </div>
                  <span className="font-mono text-[12px] text-ink tabular-nums text-right">
                    {fmtTokens(b.v)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* SESSION HISTORY */}
          <section className="px-8 pt-7 pb-7 border-t border-hair">
            <h2 className="text-[10px] uppercase tracking-label text-muted mb-4">
              session history
            </h2>
            <SessionList sessions={sessions} />
          </section>
        </div>

        <footer className="pb-10 text-[11px] text-faint">{name} · cost is an estimate</footer>
      </main>
    </>
  );
}

function Annotation({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="h-1 w-1 rounded-full bg-line-strong shrink-0 translate-y-[-2px]" />
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-[13px] text-ink tabular-nums font-mono">{value}</span>
    </li>
  );
}
