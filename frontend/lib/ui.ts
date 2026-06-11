// Single source of truth for the page content column width. The dashboard,
// repo + session detail pages, loading skeleton, TopRail and Footer all compose
// this so header, content and footer stay the same width and can never drift
// per route (see #127). Tailwind scans this literal, so the class is generated.
export const PAGE_MAX_W = "max-w-7xl";

// Convenience for the page <main> wrapper (mx-auto + width + horizontal padding).
export const PAGE_MAIN = `mx-auto ${PAGE_MAX_W} px-5`;
