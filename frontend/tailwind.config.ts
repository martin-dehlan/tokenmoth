import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#0d0d0d",
        ratyellow: "#fccd04", // PostHog yellow
        toxic: "#00ff66", // toxic green
        danger: "#ff2e2e",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
    // Neo-brutalism: no rounding anywhere.
    borderRadius: {
      none: "0",
      DEFAULT: "0",
      sm: "0",
      md: "0",
      lg: "0",
      xl: "0",
      full: "0",
    },
  },
  plugins: [],
};

export default config;
