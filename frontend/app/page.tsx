import RepoBreaker from "@/components/RepoBreaker";
import { fetchRepos, fmtTokens, fmtUsd } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { repos, source, error, since } = await fetchRepos("30d");
  const grandCost = repos.reduce((a, r) => a + r.costUsd, 0);
  const grandTokens = repos.reduce((a, r) => a + r.totalTokens, 0);
  const grandSessions = repos.reduce((a, r) => a + r.sessions, 0);
  const live = source === "live";

  return (
    <main className="min-h-screen p-6 md:p-10">
      {/* top bar */}
      <header className="border-4 border-black bg-ratyellow text-black px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold tracking-tight">tokenrat</span>
          <span className="text-[11px] font-bold tracking-widest border-2 border-black px-2 py-0.5">
            SICHERUNGSKASTEN
          </span>
        </div>
        <span className="text-[11px] font-bold tracking-widest">
          CLAUDE CODE · TOKEN MAINS · {since.toUpperCase()}
        </span>
      </header>

      {/* data-source / error banner */}
      {!live && (
        <div className="mt-4 border-4 border-black bg-danger text-black px-4 py-3 text-[11px] font-bold tracking-widest">
          ⚠ DEMO MODE — {error ?? "no live connection"}. Set TOKENRAT_API_URL +
          TOKENRAT_API_KEY to go live.
        </div>
      )}

      {/* mains summary — three big gauges */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <Gauge label="TOTAL DRAW" value={fmtUsd(grandCost)} accent="text-toxic" />
        <Gauge label="TOKENS PULLED" value={fmtTokens(grandTokens)} accent="text-ratyellow" />
        <Gauge label="SESSIONS" value={`${grandSessions}`} accent="text-white" />
      </section>

      {/* the breaker panel */}
      <section className="mt-6 border-4 border-black bg-black p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-bold tracking-widest text-white/60">
            REPO BREAKERS · {repos.length} CIRCUITS
          </span>
          <span
            className={`text-[11px] font-bold tracking-widest ${
              live ? "text-toxic" : "text-white/40"
            }`}
          >
            {live ? "● LIVE" : "○ DEMO"}
          </span>
        </div>

        {repos.length === 0 ? (
          <div className="border-4 border-dashed border-white/20 p-10 text-center text-white/50 text-[12px] tracking-widest">
            NO CIRCUITS YET — run{" "}
            <span className="text-ratyellow">tokenrat setup</span> and finish a Claude
            Code session.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {repos.map((r) => (
              <RepoBreaker key={r.repo} repo={r} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-8 text-[11px] text-white/40 tracking-widest">
        tokenrat // tracked via Claude Code SessionEnd hook · cost is an estimate
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
