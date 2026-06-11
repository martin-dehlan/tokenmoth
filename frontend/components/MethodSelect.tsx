"use client";

import { METHOD_OPTIONS, type Method } from "@/lib/install";

// Segmented npm · script control — same `.seg` language as OsSelect. npm is the
// recommended default (OS-agnostic, no toolchain); script is the curl|sh path.
export default function MethodSelect({
  current,
  onSelect,
}: {
  current: Method;
  onSelect: (method: Method) => void;
}) {
  return (
    <div className="seg" role="group" aria-label="install method">
      {METHOD_OPTIONS.map((m) => (
        <button
          key={m.id}
          type="button"
          data-active={m.id === current}
          aria-pressed={m.id === current}
          onClick={() => onSelect(m.id)}
          className="font-mono text-muted"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
