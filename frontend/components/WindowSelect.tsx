"use client";

import { useTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WINDOWS } from "@/lib/ui";

// Segmented time-window control. Drives the `?since=` query param on the current
// path so the selection is shareable + server-rendered. The clicked pill goes
// active immediately (optimistic) and the group dims while the server render is
// in flight — without this the UI looks dead for the whole API round-trip.
export default function WindowSelect({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<string | null>(null);

  const shown = pending && optimistic ? optimistic : current;

  function select(v: string) {
    if (v === current) return;
    setOptimistic(v);
    const params = new URLSearchParams(search.toString());
    params.set("since", v);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className={`seg transition-opacity ${pending ? "opacity-60" : ""}`}
      role="group"
      aria-label="time window"
      aria-busy={pending}
    >
      {WINDOWS.map((o) => (
        <button
          key={o}
          type="button"
          data-active={o === shown}
          aria-pressed={o === shown}
          onClick={() => select(o)}
          className="font-mono text-muted"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
