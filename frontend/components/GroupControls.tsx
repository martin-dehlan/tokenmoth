"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unmergeRepoGroup } from "@/lib/data";

// Shown on a repo detail page when the repo is actually a GROUP (folds ≥1 raw
// repo). Lets the user split the whole group back, or pull one member out (#224).
export default function GroupControls({ group, members }: { group: string; members: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: () => Promise<void>, redirectHome = false) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      if (redirectHome) router.push("/");
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-btn border border-line bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-label text-faint">
          grouped · {members.length} repo{members.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => unmergeRepoGroup(group), true)}
          className="btn text-muted hover:text-ink disabled:opacity-40 ml-auto"
        >
          {busy ? "…" : "unmerge all"}
        </button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <li key={m}>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => unmergeRepoGroup(group, m))}
              title={`remove ${m} from this group`}
              className="font-mono text-[11px] text-muted hover:text-ink border border-hair rounded-btn px-2 py-0.5 disabled:opacity-40"
            >
              {m} <span className="text-faint">✕</span>
            </button>
          </li>
        ))}
      </ul>
      {err && <div className="mt-2 text-[11px] text-warn">{err}</div>}
    </div>
  );
}
