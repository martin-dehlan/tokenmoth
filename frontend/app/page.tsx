import RepoBreaker from "@/components/RepoBreaker";
import { estimatedCost, fmtTokens, fmtUsd, getRepos, totalTokens } from "@/lib/data";

export default function Dashboard() {
  const repos = getRepos();
  const grandCost = repos.reduce((a, r) => a + estimatedCost(r), 0);
  const grandTokens = repos.reduce((a, r) => a + totalTokens(r), 0);
  const grandSessions = repos.reduce((a, r) => a + r.sessions, 0);

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
        <span className="text-[11px] font-bold tracking-widest">CLAUDE CODE · TOKEN MAINS</span>
      </header>

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
          <span className="text-[11px] font-bold tracking-widest text-toxic">● LIVE</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {repos.map((r) => (
            <RepoBreaker key={r.repo} repo={r} />
          ))}
        </div>
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
