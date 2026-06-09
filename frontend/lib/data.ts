// Dashboard data layer. Fetches per-repo rollups from the Rust API
// (GET /v1/repos) and normalizes them for the components. Falls back to demo
// data when no API key is configured or the API is unreachable, so the
// dashboard always renders.

export type RepoUsage = {
  repo: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd: number; // authoritative, computed server-side
  lastActive: string; // ISO 8601 from the API, or a label in demo data
};

// Wire format from GET /v1/repos (snake_case).
type ApiRepo = {
  repo: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  last_active: string;
};

const API_URL = process.env.TOKENMOTH_API_URL ?? "http://localhost:8080";

export type ReposResult = {
  repos: RepoUsage[];
  since: string;
  source: "live" | "demo";
  error?: string;
};

function normalize(a: ApiRepo): RepoUsage {
  return {
    repo: a.repo,
    sessions: a.sessions,
    inputTokens: a.input_tokens,
    outputTokens: a.output_tokens,
    cacheReadTokens: a.cache_read_tokens,
    cacheCreationTokens: a.cache_creation_tokens,
    totalTokens: a.total_tokens,
    costUsd: a.estimated_cost_usd,
    lastActive: a.last_active,
  };
}

export async function fetchRepos(accessToken: string, since = "30d"): Promise<ReposResult> {
  if (!accessToken) {
    return { repos: DEMO_REPOS, since, source: "demo", error: "not signed in — showing demo data" };
  }
  try {
    const res = await fetch(
      `${API_URL}/v1/repos?since=${encodeURIComponent(since)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) {
      return {
        repos: DEMO_REPOS,
        since,
        source: "demo",
        error: `API responded ${res.status} — showing demo data`,
      };
    }
    const data = (await res.json()) as { since: string; repos: ApiRepo[] };
    return { repos: data.repos.map(normalize), since: data.since, source: "live" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return { repos: DEMO_REPOS, since, source: "demo", error: `${msg} — showing demo data` };
  }
}

// ---- presentation helpers -------------------------------------------------

export type Load = "low" | "mid" | "high" | "tripped";

// Breaker "load" = spend against a soft monthly cap.
export function breakerLoad(costUsd: number, capUsd = 50): Load {
  const ratio = costUsd / capUsd;
  if (ratio >= 1) return "tripped";
  if (ratio >= 0.6) return "high";
  if (ratio >= 0.3) return "mid";
  return "low";
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ISO timestamp -> "2m ago". Non-date strings (demo labels) pass through.
export function relativeTime(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---- demo fallback --------------------------------------------------------

const PRICE = { input: 5.0, output: 25.0, cacheRead: 0.5, cacheWrite: 6.25 } as const;

function withTotals(
  r: Omit<RepoUsage, "totalTokens" | "costUsd">,
): RepoUsage {
  const totalTokens =
    r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreationTokens;
  const costUsd =
    (r.inputTokens * PRICE.input +
      r.outputTokens * PRICE.output +
      r.cacheReadTokens * PRICE.cacheRead +
      r.cacheCreationTokens * PRICE.cacheWrite) /
    1_000_000;
  return { ...r, totalTokens, costUsd: Math.round(costUsd * 100) / 100 };
}

export const DEMO_REPOS: RepoUsage[] = [
  { repo: "tokenmoth", sessions: 42, inputTokens: 1_240_000, outputTokens: 880_000, cacheReadTokens: 9_300_000, cacheCreationTokens: 420_000, lastActive: "2m ago" },
  { repo: "cybermusic", sessions: 88, inputTokens: 3_900_000, outputTokens: 2_100_000, cacheReadTokens: 21_000_000, cacheCreationTokens: 1_050_000, lastActive: "1h ago" },
  { repo: "sippd", sessions: 67, inputTokens: 2_400_000, outputTokens: 1_300_000, cacheReadTokens: 14_500_000, cacheCreationTokens: 700_000, lastActive: "3h ago" },
  { repo: "sample", sessions: 31, inputTokens: 980_000, outputTokens: 610_000, cacheReadTokens: 6_700_000, cacheCreationTokens: 310_000, lastActive: "1d ago" },
  { repo: "prooved", sessions: 19, inputTokens: 520_000, outputTokens: 290_000, cacheReadTokens: 3_100_000, cacheCreationTokens: 140_000, lastActive: "2d ago" },
  { repo: "eam-tool", sessions: 7, inputTokens: 160_000, outputTokens: 95_000, cacheReadTokens: 900_000, cacheCreationTokens: 44_000, lastActive: "5d ago" },
].map(withTotals);

// ---- per-repo daily series (GET /v1/repos/:name/series) -------------------

export type SeriesPoint = {
  day: string; // YYYY-MM-DD
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd: number;
};

type ApiSeriesPoint = {
  day: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
};

export type SeriesResult = {
  repo: string;
  since: string;
  points: SeriesPoint[];
  source: "live" | "demo";
  error?: string;
};

function normalizePoint(p: ApiSeriesPoint): SeriesPoint {
  return {
    day: p.day,
    sessions: p.sessions,
    inputTokens: p.input_tokens,
    outputTokens: p.output_tokens,
    cacheReadTokens: p.cache_read_tokens,
    cacheCreationTokens: p.cache_creation_tokens,
    totalTokens: p.total_tokens,
    costUsd: p.estimated_cost_usd,
  };
}

export async function fetchRepoSeries(
  accessToken: string,
  name: string,
  since = "30d",
): Promise<SeriesResult> {
  if (!accessToken) {
    return demoSeries(name, since, "not signed in — showing demo data");
  }
  try {
    const res = await fetch(
      `${API_URL}/v1/repos/${encodeURIComponent(name)}/series?since=${encodeURIComponent(since)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) return demoSeries(name, since, `API responded ${res.status} — showing demo data`);
    const data = (await res.json()) as { repo: string; since: string; points: ApiSeriesPoint[] };
    return {
      repo: data.repo,
      since: data.since,
      points: data.points.map(normalizePoint),
      source: "live",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return demoSeries(name, since, `${msg} — showing demo data`);
  }
}

// Account-wide daily series across all repos (GET /v1/series).
export async function fetchAccountSeries(accessToken: string, since = "30d"): Promise<SeriesResult> {
  if (!accessToken) {
    return demoSeries("all repos", since, "not signed in — showing demo data");
  }
  try {
    const res = await fetch(`${API_URL}/v1/series?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return demoSeries("all repos", since, `API responded ${res.status} — showing demo data`);
    const data = (await res.json()) as { since: string; points: ApiSeriesPoint[] };
    return { repo: "all repos", since: data.since, points: data.points.map(normalizePoint), source: "live" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return demoSeries("all repos", since, `${msg} — showing demo data`);
  }
}

// Gauge fill colors cycled per instrument row (teal / navy / amber / gray).
export const INSTRUMENT_COLORS = ["#1a7f64", "#1a4f7f", "#9a6200", "#6b7280"] as const;

// Deterministic demo series so the detail page renders offline.
function demoSeries(name: string, since: string, error: string): SeriesResult {
  const base = DEMO_REPOS.find((r) => r.repo === name);
  const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const days = 12;
  const dayMs = 86_400_000;
  const today = Date.now();
  const points: SeriesPoint[] = Array.from({ length: days }, (_, i) => {
    const wobble = 0.4 + 0.6 * Math.abs(Math.sin(seed + i));
    const scale = (base ? base.inputTokens / days : 80_000) * wobble;
    const input = Math.round(scale);
    const output = Math.round(scale * 0.6);
    const cacheRead = Math.round(scale * 7);
    const cacheCreation = Math.round(scale * 0.3);
    const { totalTokens, costUsd } = withTotals({
      repo: name,
      sessions: 1 + (i % 4),
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreation,
      lastActive: "",
    });
    return {
      day: new Date(today - (days - 1 - i) * dayMs).toISOString().slice(0, 10),
      sessions: 1 + (i % 4),
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreation,
      totalTokens,
      costUsd,
    };
  });
  return { repo: name, since, points, source: "demo", error };
}
