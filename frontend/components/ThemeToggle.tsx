"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. The initial class is set pre-paint by the inline script in
// layout (no FOUC); this reads it back on mount, then flips + persists. Renders
// a stable placeholder until mounted to avoid a hydration mismatch.
//
// `variant`: "button" (TopRail — icon-only .btn) or "text" (footer — inline link
// with a label, matching the surrounding footer links).
export default function ThemeToggle({ variant = "button" }: { variant?: "button" | "text" }) {
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

  const label = dark ? "switch to light theme" : "switch to dark theme";
  // Placeholder glyph until mounted keeps SSR + first client paint identical.
  const glyph = dark === null ? "◐" : dark ? "☀" : "☾";

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="text-muted hover:text-ink transition-colors"
      >
        {glyph} {dark === null ? "theme" : dark ? "light" : "dark"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={dark ? "light theme" : "dark theme"}
      className="btn text-muted"
    >
      <span className="text-[13px] leading-none">{glyph}</span>
    </button>
  );
}
