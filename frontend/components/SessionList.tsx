import Link from "next/link";
import { SessionUsage, fmtTokens, relativeTime } from "@/lib/data";

export default function SessionList({ sessions }: { sessions: SessionUsage[] }) {
  if (sessions.length === 0) {
    return (
      <div className="text-[12px] text-faint py-8 text-center">no sessions in this window yet.</div>
    );
  }
  return (
    <div className="divide-y divide-hair">
      {sessions.map((s) => {
        const pct = s.totalTokens > 0 ? Math.round((s.hookOverheadTokens / s.totalTokens) * 100) : 0;
        const hooks = Object.entries(s.hookOverheadBreakdown)
          .filter(([, t]) => t > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        return (
          <Link
            key={s.sessionId}
            href={`/session/${encodeURIComponent(s.sessionId)}`}
            className="py-3 flex flex-col gap-1.5 group hover:bg-canvas -mx-2 px-2 rounded-btn transition-colors"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-mono text-[13px] text-ink group-hover:text-accent transition-colors min-w-0 truncate">
                  {s.repo}
                </span>
                {s.source === "desktop_mcp" && (
                  <span
                    className="text-[9px] uppercase tracking-label text-accent border border-accent/40 rounded-btn px-1.5 py-0.5"
                    title="reported from Claude Desktop via the tokenmoth MCP server"
                  >
                    desktop
                  </span>
                )}
                {s.model && <span className="text-[11px] text-faint">{s.model}</span>}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] sm:flex-nowrap">
                <span className="text-muted tabular-nums font-mono sm:w-24 sm:text-right">
                  {fmtTokens(s.totalTokens)} tok
                </span>
                <span
                  className="text-accent tabular-nums font-mono sm:w-40 sm:text-right"
                  title="estimated hook/plugin overhead for this session"
                >
                  overhead ~{pct}% · {fmtTokens(s.hookOverheadTokens)}
                </span>
                <span className="text-faint tabular-nums sm:w-16 sm:text-right">{relativeTime(s.endedAt)}</span>
              </div>
            </div>
            {hooks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hooks.map(([name, tok]) => (
                  <span
                    key={name}
                    className="text-[10px] font-mono text-muted border border-hair rounded-btn px-1.5 py-0.5"
                  >
                    {name} · {fmtTokens(tok)}
                  </span>
                ))}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
