import Link from "next/link";
import { RepoUsage, breakerLoad, fmtTokens, fmtUsd, relativeTime } from "@/lib/data";

// One repo rendered as an instrument row: name + sub-note, gauge track,
// token count, cost, status tag. Not a card, not a table cell.
export default function RepoBreaker({
  repo,
  max,
  color,
}: {
  repo: RepoUsage;
  max: number;
  color: string;
}) {
  const load = breakerLoad(repo.costUsd);
  const width = Math.max(2, Math.round((repo.costUsd / Math.max(0.01, max)) * 100));
  const status = STATUS[load];

  return (
    <Link
      href={`/repo/${encodeURIComponent(repo.repo)}`}
      className="group grid grid-cols-[minmax(9rem,1.2fr)_2fr_auto_auto_auto] items-center gap-4 sm:gap-6 px-2 -mx-2 py-2.5 rounded-btn hover:bg-accent-faint transition-colors"
    >
      {/* name + sub-note */}
      <div className="min-w-0">
        <div className="font-mono text-[13px] font-medium text-ink truncate group-hover:text-accent transition-colors">
          {repo.repo}
        </div>
        <div className="text-[10px] italic text-faint truncate">
          {repo.sessions} sessions · {relativeTime(repo.lastActive)}
        </div>
      </div>

      {/* gauge track */}
      <div className="track">
        <i style={{ width: `${width}%`, background: color }} />
      </div>

      {/* tokens */}
      <div className="font-mono text-[12px] text-muted tabular-nums text-right w-16">
        {fmtTokens(repo.totalTokens)}
      </div>

      {/* cost */}
      <div className="font-mono text-[13px] font-medium text-ink tabular-nums text-right w-16">
        {fmtUsd(repo.costUsd)}
      </div>

      {/* status */}
      <div className="w-16 flex justify-end">
        <span className="tag" style={{ color: status.color, background: status.bg }}>
          {status.label}
        </span>
      </div>
    </Link>
  );
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "ok", color: "#1a7f64", bg: "rgba(26,127,100,0.07)" },
  mid: { label: "ok", color: "#6b7280", bg: "rgba(107,114,128,0.08)" },
  high: { label: "high $", color: "#9a6200", bg: "rgba(154,98,0,0.08)" },
  tripped: { label: "over", color: "#1a4f7f", bg: "rgba(26,79,127,0.08)" },
};
