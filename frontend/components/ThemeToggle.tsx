"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. The initial class is set pre-paint by the inline script in
// layout (no FOUC); this reads it back on mount, then flips + persists. Renders
// a stable placeholder until mounted to avoid a hydration mismatch.
export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable — toggle still applies for the session */
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "switch to light theme" : "switch to dark theme"}
      title={dark ? "light theme" : "dark theme"}
      className="btn text-muted"
    >
      {/* Placeholder glyph until mounted keeps SSR + first client paint identical. */}
      <span className="text-[13px] leading-none">{dark === null ? "◐" : dark ? "☀" : "☾"}</span>
    </button>
  );
}
