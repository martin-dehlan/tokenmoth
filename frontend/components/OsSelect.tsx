"use client";

import { OS_OPTIONS, type Os } from "@/lib/install";

// Segmented macOS · Linux · Windows control — same `.seg` language as the
// dashboard time-window switcher. Override for the auto-detected OS.
export default function OsSelect({
  current,
  onSelect,
}: {
  current: Os;
  onSelect: (os: Os) => void;
}) {
  return (
    <div className="seg" role="group" aria-label="operating system">
      {OS_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          data-active={o.id === current}
          aria-pressed={o.id === current}
          onClick={() => onSelect(o.id)}
          className="font-mono text-muted"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
