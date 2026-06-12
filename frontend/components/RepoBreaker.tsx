import Link from "next/link";
import { RepoUsage, fmtTokens, relativeTime } from "@/lib/data";

// One repo rendered as an instrument row: name + sub-note, gauge track (by
// token share), token count, sessions. Not a card, not a table cell.
export default function RepoBreaker({
  repo,
  max,
  color,
}: {
  repo: RepoUsage;
  max: number;
  color: string;
}) {
  const width = Math.max(2, Math.round((repo.totalTokens / Math.max(1, max)) * 100));

  return (
    <Link
      href={`/repo/${encodeURIComponent(repo.repo)}`}
      className="group grid grid-cols-[minmax(0,1.2fr)_minmax(2.5rem,2fr)_auto] items-center gap-3 sm:gap-6 px-2 -mx-2 py-2.5 rounded-btn hover:bg-accent-faint transition-colors"
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

      {/* gauge track (token share) */}
      <div className="track">
        <i style={{ width: `${width}%`, background: color }} />
      </div>

      {/* tokens */}
      <div className="font-mono text-[13px] font-medium text-ink tabular-nums text-right w-20">
        {fmtTokens(repo.totalTokens)}
      </div>
    </Link>
  );
}
