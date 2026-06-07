import Link from "next/link";
import {
  RepoUsage,
  breakerLoad,
  fmtTokens,
  fmtUsd,
  relativeTime,
  Load,
} from "@/lib/data";

const LOAD_STYLE: Record<Load, { bar: string; label: string; text: string }> = {
  low: { bar: "bg-toxic", label: "NOMINAL", text: "text-toxic" },
  mid: { bar: "bg-ratyellow", label: "LOAD", text: "text-ratyellow" },
  high: { bar: "bg-ratyellow", label: "HIGH", text: "text-ratyellow" },
  tripped: { bar: "bg-danger", label: "TRIPPED", text: "text-danger" },
};

// A single circuit breaker switch in the "Sicherungskasten".
export default function RepoBreaker({ repo }: { repo: RepoUsage }) {
  const load = breakerLoad(repo.costUsd);
  const s = LOAD_STYLE[load];
  const on = load !== "tripped";

  return (
    <Link
      href={`/repo/${encodeURIComponent(repo.repo)}`}
      className="border-4 border-black bg-[#161616] p-4 flex flex-col gap-3 hover:border-ratyellow transition-colors focus:outline-none focus:border-toxic"
    >
      {/* header: repo + status lamp */}
      <div className="flex items-center justify-between">
        <span className="font-extrabold truncate">{repo.repo}</span>
        <span className={`h-3 w-3 border-2 border-black ${s.bar}`} aria-hidden />
      </div>

      {/* the breaker lever */}
      <div className="border-2 border-black bg-charcoal h-16 flex items-stretch">
        <div className="flex-1 flex items-center justify-center text-[10px] tracking-widest text-white/40">
          OFF
        </div>
        <div
          className={`w-12 border-x-2 border-black flex items-center justify-center font-extrabold ${
            on ? `${s.bar} text-black` : "bg-charcoal text-white/30"
          }`}
        >
          {on ? "▲" : "▼"}
        </div>
        <div className="flex-1 flex items-center justify-center text-[10px] tracking-widest text-white/40">
          ON
        </div>
      </div>

      {/* readout */}
      <div className="flex items-baseline justify-between">
        <span className={`text-xl font-extrabold ${s.text}`}>{fmtUsd(repo.costUsd)}</span>
        <span className={`text-[10px] font-bold tracking-widest ${s.text}`}>{s.label}</span>
      </div>

      <dl className="text-[11px] text-white/60 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt>tokens</dt>
        <dd className="text-right text-white">{fmtTokens(repo.totalTokens)}</dd>
        <dt>sessions</dt>
        <dd className="text-right text-white">{repo.sessions}</dd>
        <dt>cache rd</dt>
        <dd className="text-right text-white">{fmtTokens(repo.cacheReadTokens)}</dd>
        <dt>last</dt>
        <dd className="text-right text-white">{relativeTime(repo.lastActive)}</dd>
      </dl>
    </Link>
  );
}
