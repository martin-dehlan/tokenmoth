import Link from "next/link";
import CostChart from "@/components/CostChart";
import { fetchRepoSeries, fmtTokens, fmtUsd } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RepoDetail({ params }: { params: { name: string } }) {
  const name = decodeURIComponent(params.name);
  const { points, source, error, since } = await fetchRepoSeries(name, "30d");
  const live = source === "live";

  const sum = points.reduce(
    (a, p) => ({
      cost: a.cost + p.costUsd,
      tokens: a.tokens + p.totalTokens,
      sessions: a.sessions + p.sessions,
      input: a.input + p.inputTokens,
      output: a.output + p.outputTokens,
      cread: a.cread + p.cacheReadTokens,
      ccreate: a.ccreate + p.cacheCreationTokens,
    }),
    { cost: 0, tokens: 0, sessions: 0, input: 0, output: 0, cread: 0, ccreate: 0 },
  );

  const breakdown = [
    { label: "input", v: sum.input, color: "bg-toxic" },
    { label: "output", v: sum.output, color: "bg-ratyellow" },
    { label: "cache read", v: sum.cread, color: "bg-white" },
    { label: "cache write", v: sum.ccreate, color: "bg-danger" },
  ];
  const tmax = Math.max(1, ...breakdown.map((b) => b.v));

  return (
    <main className="min-h-screen p-6 md:p-10">
      {/* top bar */}
      <header className="border-4 border-black bg-ratyellow text-black px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[11px] font-bold tracking-widest border-2 border-black px-2 py-1 hover:bg-black hover:text-ratyellow">
            ◀ PANEL
          </Link>
          <span className="text-2xl font-extrabold tracking-tight">{name}</span>
        </div>
        <span className="text-[11px] font-bold tracking-widest">
          CIRCUIT · {since.toUpperCase()} · {live ? "● LIVE" : "○ DEMO"}
        </span>
      </header>

      {!live && (
        <div className="mt-4 border-4 border-black bg-danger text-black px-4 py-3 text-[11px] font-bold tracking-widest">
          ⚠ DEMO MODE — {error ?? "no live connection"}.
        </div>
      )}

      {/* gauges */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <Gauge label="DRAW (30D)" value={fmtUsd(sum.cost)} accent="text-toxic" />
        <Gauge label="TOKENS" value={fmtTokens(sum.tokens)} accent="text-ratyellow" />
        <Gauge label="SESSIONS" value={`${sum.sessions}`} accent="text-white" />
      </section>

      {points.length === 0 ? (
        <div className="mt-6 border-4 border-dashed border-white/20 p-10 text-center text-white/50 text-[12px] tracking-widest">
          NO ACTIVITY FOR <span className="text-ratyellow">{name}</span> IN THIS WINDOW.
        </div>
      ) : (
        <>
          {/* cost chart */}
          <section className="mt-6">
            <CostChart points={points} />
          </section>

          {/* token-type breakdown */}
          <section className="mt-6 border-4 border-black bg-[#161616] p-5">
            <div className="text-[11px] font-bold tracking-widest text-white/60 mb-4">
              TOKEN BREAKDOWN
            </div>
            <div className="flex flex-col gap-3">
              {breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-24 text-[11px] tracking-widest text-white/60">{b.label}</span>
                  <div className="flex-1 border-2 border-black bg-charcoal h-5">
                    <div
                      className={`${b.color} h-full border-r-2 border-black`}
                      style={{ width: `${Math.round((b.v / tmax) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-[11px] tabular-nums text-white">
                    {fmtTokens(b.v)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <footer className="mt-8 text-[11px] text-white/40 tracking-widest">
        tokenrat // {name} · cost is an estimate
      </footer>
    </main>
  );
}

function Gauge({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border-4 border-black bg-[#161616] px-5 py-6">
      <div className="text-[11px] font-bold tracking-widest text-white/50">{label}</div>
      <div className={`mt-2 text-4xl font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}
