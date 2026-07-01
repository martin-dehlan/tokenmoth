"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RepoBreaker from "./RepoBreaker";
import RevealOnView from "./RevealOnView";
import { RepoUsage, INSTRUMENT_COLORS, mergeRepoGroup } from "@/lib/data";

type Sort = "tokens" | "sessions" | "recent";

const COLLAPSED = 5;

export default function RepoList({ repos }: { repos: RepoUsage[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("tokens");
  const [expanded, setExpanded] = useState(false);

  // Merge mode: pick ≥2 repos → fold them into one display group (#224).
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  function toggle(repo: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  }

  function resetMerge() {
    setSelecting(false);
    setPicked(new Set());
    setGroupName("");
    setErr(null);
  }

  async function doMerge() {
    const reposToMerge = [...picked];
    const group = groupName.trim() || reposToMerge[0];
    if (reposToMerge.length < 2) {
      setErr("pick at least two repos to merge");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await mergeRepoGroup(group, reposToMerge);
      resetMerge();
      router.refresh(); // re-fetch SSR data → folded rows appear
    } catch (e) {
      setErr(e instanceof Error ? e.message : "merge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter repos…"
          className="border border-line rounded-btn px-3 py-1.5 text-[16px] sm:text-[12px] shadow-btn focus:outline-none focus:border-accent bg-surface min-w-[8rem]"
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
        <button
          type="button"
          onClick={() => (selecting ? resetMerge() : setSelecting(true))}
          className="btn text-muted hover:text-ink"
          title="merge repos that are the same project under different folder names"
        >
          {selecting ? "cancel" : "merge…"}
        </button>
        <span className="text-[10px] tracking-label text-faint ml-auto">
          showing {visible.length} of {repos.length}
        </span>
      </div>

      {selecting && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-btn border border-line bg-surface px-3 py-2">
          <span className="text-[11px] text-muted">
            {picked.size === 0
              ? "select repos to merge into one group"
              : `${picked.size} selected`}
          </span>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="group name (defaults to first)"
            className="border border-line rounded-btn px-2 py-1 text-[12px] bg-surface focus:outline-none focus:border-accent ml-auto min-w-[10rem]"
          />
          <button
            type="button"
            onClick={doMerge}
            disabled={busy || picked.size < 2}
            className="btn text-accent hover:text-ink disabled:opacity-40"
          >
            {busy ? "merging…" : "merge"}
          </button>
        </div>
      )}
      {err && <div className="mb-3 text-[11px] text-warn">{err}</div>}

      {sorted.length === 0 ? (
        <div className="text-[12px] text-faint py-6 text-center">no repos match “{q}”.</div>
      ) : (
        <>
          <RevealOnView className="divide-y divide-hair">
            {visible.map((r, i) =>
              selecting ? (
                <label
                  key={r.repo}
                  className="flex items-center gap-3 cursor-pointer pl-1"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(r.repo)}
                    onChange={() => toggle(r.repo)}
                    className="shrink-0 accent-[var(--accent)]"
                  />
                  <span className="flex-1 min-w-0 pointer-events-none">
                    <RepoBreaker
                      repo={r}
                      max={max}
                      color={INSTRUMENT_COLORS[i % INSTRUMENT_COLORS.length]}
                    />
                  </span>
                </label>
              ) : (
                <RepoBreaker
                  key={r.repo}
                  repo={r}
                  max={max}
                  color={INSTRUMENT_COLORS[i % INSTRUMENT_COLORS.length]}
                />
              ),
            )}
          </RevealOnView>
          {(hidden > 0 || expanded) && sorted.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 w-full text-[10px] uppercase tracking-label text-muted hover:text-ink border-t border-hair pt-3 transition-colors"
            >
              {expanded ? "show less" : "show more"}
            </button>
          )}
        </>
      )}
    </>
  );
}
