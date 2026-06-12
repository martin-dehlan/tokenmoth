"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WINDOWS } from "@/lib/ui";

// Segmented time-window control. Drives the `?since=` query param on the current
// path so the selection is shareable + server-rendered.
export default function WindowSelect({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function select(v: string) {
    const params = new URLSearchParams(search.toString());
    params.set("since", v);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="seg" role="group" aria-label="time window">
      {WINDOWS.map((o) => (
        <button
          key={o}
          type="button"
          data-active={o === current}
          aria-pressed={o === current}
          onClick={() => select(o)}
          className="font-mono text-muted"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
