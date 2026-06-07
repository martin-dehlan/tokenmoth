import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#fbfbfa", // warm off-white notebook canvas
        surface: "#ffffff",
        ink: "#1f2328", // near-black text
        muted: "#6b7280",
        faint: "#9ca3af",
        line: "#d1d5db", // control borders
        "line-strong": "#c4c9d0", // solid bottom-edge shadow color
        hair: "#ececee", // very faint section dividers
        accent: {
          DEFAULT: "#1a7f64", // deep teal — used sparingly
          faint: "rgba(26,127,100,0.06)",
          ring: "rgba(26,127,100,0.18)",
        },
        warn: "#9a6200", // amber
        info: "#1a4f7f", // navy
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
        btn: "0 1px 0 0 #c4c9d0, 0 1px 3px 0 rgba(0,0,0,0.07)",
        surface: "0 1px 0 0 #c4c9d0, 0 3px 12px rgba(0,0,0,0.07)",
        track: "inset 0 1px 3px rgba(0,0,0,0.07)",
      },
    },
  },
  plugins: [],
};

export default config;
