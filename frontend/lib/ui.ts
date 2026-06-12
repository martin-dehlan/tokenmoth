// Single source of truth for the page content column width. The dashboard,
// repo + session detail pages, loading skeleton, TopRail and Footer all compose
// this so header, content and footer stay the same width and can never drift
// per route (see #127). Tailwind scans this literal, so the class is generated.
export const PAGE_MAX_W = "max-w-7xl";

// Convenience for the page <main> wrapper. NOTE the `w-full`: <main> is a flex
// item (child of the layout's `flex-1 flex flex-col`), and `mx-auto` on a flex
// item disables align-items:stretch, so without an explicit width the element
// shrinks to its content — making content-light pages (detail views, the
// loading skeleton) render narrower than the dashboard. `w-full` pins it to the
// full column (capped by max-w-7xl) so every page is the same width.
export const PAGE_MAIN = `mx-auto w-full ${PAGE_MAX_W} px-5`;

// Valid `?since=` time windows — shared by the dashboard, repo detail page and
// the WindowSelect segmented control so they can never drift apart.
export const WINDOWS = ["1h", "5h", "12h", "24h", "7d", "30d", "90d", "all"] as const;
export type Window = (typeof WINDOWS)[number];
