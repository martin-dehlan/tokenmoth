"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. The initial class is set pre-paint by the inline script in
// layout (no FOUC); this reads it back on mount, then flips + persists. Renders
// a stable placeholder until mounted to avoid a hydration mismatch.
//
// `variant`:
//   "button" — TopRail: icon in a .btn, matching the neighbouring ⚙ / sign-out.
//   "icon"   — marketing/legal headers: bare ghost glyph, color-only hover, so it
//              sits as light as the adjacent text links.
export default function ThemeToggle({
  variant = "button",
}: {
  variant?: "button" | "icon";
}) {
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

  if (variant === "icon") {
    // Bare glyph — no border/bg/shadow — so it reads as light as a text link.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={dark ? "light theme" : "dark theme"}
        className="inline-flex items-center justify-center text-[15px] leading-none text-muted hover:text-ink transition-colors"
      >
        {glyph}
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
