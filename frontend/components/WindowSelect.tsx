"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = ["24h", "7d", "30d", "90d", "all"] as const;

// Segmented time-window control. Drives the `?since=` query param on the current
// path so the selection is shareable + server-rendered.
export default function WindowSelect({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function select(v: string) {
    const params = new URLSearchParams(search.toString());
    params.set("since", v);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="seg">
      {OPTIONS.map((o) => (
        <button
          key={o}
          data-active={o === current}
          onClick={() => select(o)}
          className="font-mono text-muted"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
