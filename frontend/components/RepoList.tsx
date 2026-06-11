"use client";

import { useState } from "react";
import RepoBreaker from "./RepoBreaker";
import { RepoUsage, INSTRUMENT_COLORS } from "@/lib/data";

type Sort = "tokens" | "sessions" | "recent";

const COLLAPSED = 5;

export default function RepoList({ repos }: { repos: RepoUsage[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("tokens");
  const [expanded, setExpanded] = useState(false);

  const max = Math.max(1, ...repos.map((r) => r.totalTokens));
  const filtered = repos.filter((r) => r.repo.toLowerCase().includes(q.trim().toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "sessions") return b.sessions - a.sessions;
    if (sort === "recent") return a.lastActive < b.lastActive ? 1 : -1;
    return b.totalTokens - a.totalTokens;
  });
  // Show the top N by default; the long tail expands on demand (lean list).
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED);
  const hidden = sorted.length - visible.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter repos…"
          className="border border-line rounded-btn px-3 py-1.5 text-[12px] shadow-btn focus:outline-none focus:border-accent bg-surface min-w-[8rem]"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="btn text-muted"
        >
          <option value="tokens">sort: tokens</option>
          <option value="sessions">sort: sessions</option>
          <option value="recent">sort: recent</option>
        </select>
        <span className="text-[10px] tracking-label text-faint ml-auto">
          showing {sorted.length} of {repos.length}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="text-[12px] text-faint py-6 text-center">no repos match “{q}”.</div>
      ) : (
        <>
          <div className="divide-y divide-hair">
            {visible.map((r, i) => (
              <RepoBreaker
                key={r.repo}
                repo={r}
                max={max}
                color={INSTRUMENT_COLORS[i % INSTRUMENT_COLORS.length]}
              />
            ))}
          </div>
          {(hidden > 0 || expanded) && sorted.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 w-full text-[10px] uppercase tracking-label text-muted hover:text-ink border-t border-hair pt-3 transition-colors"
            >
              {expanded ? "show less ↑" : `show ${hidden} more ↓`}
            </button>
          )}
        </>
      )}
    </>
  );
}
