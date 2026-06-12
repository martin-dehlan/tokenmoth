"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Re-runs the server components for the current route (router.refresh) — pages
// are force-dynamic with no-store fetches, so this pulls fresh data from the
// API without a full page reload.
export default function ReloadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="reload data"
      title="reload data"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="btn text-muted disabled:opacity-60"
    >
      <span
        aria-hidden
        className={`text-[13px] leading-none inline-block ${pending ? "animate-spin" : ""}`}
      >
        ↻
      </span>
    </button>
  );
}
