import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Every color flows through a CSS variable (see globals.css) so the same
      // utility classes flip between light and `.dark` themes.
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        hair: "var(--hair)",
        accent: {
          DEFAULT: "var(--accent)",
          faint: "var(--accent-faint)",
          ring: "var(--accent-ring)",
        },
        warn: "var(--warn)",
        info: "var(--info)",
        copper: {
          DEFAULT: "var(--copper)",
          soft: "var(--copper-soft)",
        },
        stone: "var(--stone)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        label: "0.07em",
        hero: "-0.04em",
      },
      borderRadius: {
        btn: "7px",
        surface: "12px",
      },
      boxShadow: {
        btn: "0 1px 0 0 var(--line-strong), 0 1px 3px 0 var(--shadow)",
        surface: "0 1px 0 0 var(--line-strong), 0 3px 12px var(--shadow)",
        track: "inset 0 1px 3px var(--shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
