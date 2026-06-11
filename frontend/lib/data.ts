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
  hookOverheadTokens: number; // est. plugin/MCP/hook context overhead (#80)
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
  hook_overhead_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  last_active: string;
};

const API_URL = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

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
    hookOverheadTokens: a.hook_overhead_tokens,
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

export function fmtChartLabel(dayStr: string, since: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
    return dayStr.slice(5);
  }
  const date = new Date(dayStr);
  if (Number.isNaN(date.getTime())) {
    return dayStr;
  }
  // If the timeframe is in hours (e.g., "1h", "5h", "12h", "24h"), show only time.
  if (/\dh$/.test(since)) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  // For day-level ranges, show month-day.
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

// ---- chart window padding & re-bucketing ----------------------------------
// Two problems with the raw series for charting:
//   1) the backend omits empty buckets, so the x-axis only spanned the data
//      extent (an 18-min burst looked like the whole "5h" window);
//   2) the backend's grouping is too fine for short windows (1h/5h come back at
//      minute resolution → 60 / 300 points, unreadable).
// So for display we pick a sensible bin per window (~12–30 points), re-aggregate
// the backend buckets into those bins (summing), and zero-fill the full window.
// Display bins are always ≥ the backend's grouping, so summing is sound. "all"
// is unbounded and returned unchanged.

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// Display bin size per window (must be ≥ the backend grouping unit).
function bucketMs(since: string): number {
  switch (since) {
    case "1h": return 5 * MINUTE; //   12 pts
    case "5h": return 15 * MINUTE; //  20 pts
    case "12h": return HOUR; //        12 pts
    case "24h": return HOUR; //        24 pts
    case "90d": return 3 * DAY; //     30 pts
    default: return DAY; //  7d → 7, 30d → 30
  }
}

// Human label for the chart's y-unit, matching bucketMs above.
export function chartUnitLabel(since: string): string {
  switch (since) {
    case "1h": return "tokens / 5 min";
    case "5h": return "tokens / 15 min";
    case "12h":
    case "24h": return "tokens / hr";
    case "90d": return "tokens / 3 d";
    default: return /\dh$/.test(since) ? "tokens / hr" : "tokens / day";
  }
}

// Window length in ms, or null for "all"/unbounded.
function windowMs(since: string): number | null {
  const m = /^(\d+)([hd])$/.exec(since);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "h" ? n * HOUR : n * DAY;
}

function emptyPoint(day: string): SeriesPoint {
  return {
    day,
    sessions: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };
}

// Sum b's numeric fields into a (a's day/bin label is kept).
function addPoints(a: SeriesPoint, b: SeriesPoint): SeriesPoint {
  return {
    day: a.day,
    sessions: a.sessions + b.sessions,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

// Distinct calendar days present in a series, regardless of bucket granularity.
// "avg / day" must divide by real days — for hour windows the buckets are
// minutes/hours, not days, so series.length would be wrong.
export function distinctDays(points: SeriesPoint[]): number {
  return new Set(points.map((p) => p.day.slice(0, 10))).size;
}

export function padSeriesToWindow(points: SeriesPoint[], since: string): SeriesPoint[] {
  const win = windowMs(since);
  if (win === null) return points; // "all" — keep the data extent
  const step = bucketMs(since);
  const now = Date.now();
  const end = Math.floor(now / step) * step;
  const start = Math.floor((now - win) / step) * step;

  // Aggregate backend buckets into the (coarser-or-equal) display bins. Multiple
  // fine buckets in one display bin are summed, not overwritten.
  const byBucket = new Map<number, SeriesPoint>();
  for (const p of points) {
    const t = Date.parse(p.day);
    if (Number.isNaN(t)) continue;
    const b = Math.floor(t / step) * step;
    const binDay = new Date(b).toISOString();
    const prev = byBucket.get(b);
    byBucket.set(b, prev ? addPoints(prev, p) : { ...p, day: binDay });
  }

  const out: SeriesPoint[] = [];
  for (let t = start; t <= end; t += step) {
    out.push(byBucket.get(t) ?? emptyPoint(new Date(t).toISOString()));
  }
  return out;
}

// ---- demo fallback --------------------------------------------------------

const PRICE = { input: 5.0, output: 25.0, cacheRead: 0.5, cacheWrite: 6.25 } as const;

function withTotals(
  r: Omit<RepoUsage, "totalTokens" | "costUsd" | "hookOverheadTokens">,
): RepoUsage {
  const totalTokens =
    r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreationTokens;
  const hookOverheadTokens = Math.round(r.inputTokens * 0.08); // ~8% demo overhead
  const costUsd =
    (r.inputTokens * PRICE.input +
      r.outputTokens * PRICE.output +
      r.cacheReadTokens * PRICE.cacheRead +
      r.cacheCreationTokens * PRICE.cacheWrite) /
    1_000_000;
  return { ...r, totalTokens, hookOverheadTokens, costUsd: Math.round(costUsd * 100) / 100 };
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
  day: string; // ISO 8601 or YYYY-MM-DD
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

// ---- per-model rollup (GET /v1/models) ------------------------------------

export type ModelUsage = {
  model: string;
  sessions: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

type ApiModel = {
  model: string;
  sessions: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
};

export async function fetchModels(accessToken: string, since = "30d"): Promise<ModelUsage[]> {
  if (!accessToken) return [];
  try {
    const res = await fetch(`${API_URL}/v1/models?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const d = (await res.json()) as ApiModel[];
    return d.map((m) => ({
      model: m.model,
      sessions: m.sessions,
      totalTokens: m.total_tokens,
      inputTokens: m.input_tokens,
      outputTokens: m.output_tokens,
      cacheReadTokens: m.cache_read_tokens,
      cacheCreationTokens: m.cache_creation_tokens,
    }));
  } catch {
    return [];
  }
}

// ---- trends (GET /v1/trends) ----------------------------------------------

export type Trends = {
  currentTokens: number;
  previousTokens: number;
  hasPrevious: boolean;
  deltaPct: number | null;
  dailyAvgTokens: number;
  projectedMonthlyTokens: number;
  currentSessions: number;
  previousSessions: number;
};

export async function fetchTrends(accessToken: string, since = "30d"): Promise<Trends | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${API_URL}/v1/trends?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      currentTokens: d.current_tokens,
      previousTokens: d.previous_tokens,
      hasPrevious: d.has_previous,
      deltaPct: d.delta_pct,
      dailyAvgTokens: d.daily_avg_tokens,
      projectedMonthlyTokens: d.projected_monthly_tokens,
      currentSessions: d.current_sessions,
      previousSessions: d.previous_sessions,
    };
  } catch {
    return null;
  }
}

// ---- consolidated dashboard (GET /v1/dashboard) ---------------------------
// One request → one Lambda invocation → one DB connection (avoids the session
// pooler's 15-client cap that 4 parallel calls were hitting; see issue #65).

export type HookOverhead = { hook: string; tokens: number; sessions: number };

// Loaded-vs-called rollup per MCP server (#153). Only sessions ingested by a
// call-tracking CLI count — older rows can't tell "never called" from "unknown".
export type McpUsage = {
  server: string;
  sessionsLoaded: number;
  sessionsCalled: number;
  calls: number;
};

export type DashboardData = {
  repos: RepoUsage[];
  series: SeriesPoint[];
  models: ModelUsage[];
  trends: Trends | null;
  apiCostUsd: number; // API pay-as-you-go equivalent for the window (#72)
  overheadByHook: HookOverhead[]; // overhead tokens per plugin/hook (#85)
  mcpUsage: McpUsage[]; // loaded vs called per MCP server (#153)
  avgBaselineTokens: number; // avg measured first-call context (#152)
  source: "live" | "demo";
  error?: string;
};

function demoDashboard(since: string, error: string): DashboardData {
  return {
    repos: DEMO_REPOS,
    series: demoSeries("all repos", since, error).points,
    models: [],
    trends: null,
    apiCostUsd: DEMO_REPOS.reduce((a, r) => a + r.costUsd, 0),
    overheadByHook: [
      { hook: "vercel-plugin", tokens: 12400, sessions: 18 },
      { hook: "caveman", tokens: 3100, sessions: 18 },
      { hook: "PreToolUse:Bash", tokens: 900, sessions: 12 },
    ],
    mcpUsage: [
      { server: "supabase", sessionsLoaded: 18, sessionsCalled: 11, calls: 64 },
      { server: "vercel", sessionsLoaded: 18, sessionsCalled: 6, calls: 19 },
      { server: "figma", sessionsLoaded: 14, sessionsCalled: 0, calls: 0 },
    ],
    avgBaselineTokens: 38_000,
    source: "demo",
    error,
  };
}

export async function fetchDashboard(accessToken: string, since = "30d"): Promise<DashboardData> {
  if (!accessToken) return demoDashboard(since, "not signed in — showing demo data");
  try {
    const res = await fetch(`${API_URL}/v1/dashboard?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return demoDashboard(since, `API responded ${res.status} — showing demo data`);
    const d = await res.json();
    const t = d.trends;
    return {
      repos: (d.repos as ApiRepo[]).map(normalize),
      series: (d.series as ApiSeriesPoint[]).map(normalizePoint),
      models: (d.models as ApiModel[]).map((m) => ({
        model: m.model,
        sessions: m.sessions,
        totalTokens: m.total_tokens,
        inputTokens: m.input_tokens,
        outputTokens: m.output_tokens,
        cacheReadTokens: m.cache_read_tokens,
        cacheCreationTokens: m.cache_creation_tokens,
      })),
      trends: t
        ? {
            currentTokens: t.current_tokens,
            previousTokens: t.previous_tokens,
            hasPrevious: t.has_previous,
            deltaPct: t.delta_pct,
            dailyAvgTokens: t.daily_avg_tokens,
            projectedMonthlyTokens: t.projected_monthly_tokens,
            currentSessions: t.current_sessions,
            previousSessions: t.previous_sessions,
          }
        : null,
      apiCostUsd: typeof d.api_cost_usd === "number" ? d.api_cost_usd : 0,
      overheadByHook: Array.isArray(d.overhead_by_hook)
        ? d.overhead_by_hook.map((h: { hook: string; tokens: number; sessions: number }) => ({
            hook: h.hook,
            tokens: h.tokens,
            sessions: h.sessions,
          }))
        : [],
      mcpUsage: Array.isArray(d.mcp_usage)
        ? d.mcp_usage.map(
            (m: { server: string; sessions_loaded: number; sessions_called: number; calls: number }) => ({
              server: m.server,
              sessionsLoaded: m.sessions_loaded,
              sessionsCalled: m.sessions_called,
              calls: m.calls,
            }),
          )
        : [],
      avgBaselineTokens: typeof d.avg_baseline_tokens === "number" ? d.avg_baseline_tokens : 0,
      source: "live",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return demoDashboard(since, `${msg} — showing demo data`);
  }
}

// ---- recent sessions + per-hook overhead breakdown (GET /v1/sessions) ------

export type SessionUsage = {
  sessionId: string;
  repo: string;
  model: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  hookOverheadTokens: number;
  hookOverheadBreakdown: Record<string, number>;
  mcpServers: string[]; // MCP server names active for the project (#106)
  mcpCalls: Record<string, number>; // tool calls per MCP server (#153)
  baselineTokens: number; // measured first-call context (#152)
  turnCount: number; // real API calls; 0 = row predates call tracking
  endedAt: string;
};

// Detail = list shape + the per-turn series for the Cost Anatomy chart (#152).
// Each entry is [input, cacheRead, cacheCreation, output] for one API call.
export type SessionDetail = SessionUsage & { turnUsage: number[][] };

// Wire shape shared by GET /v1/sessions and /v1/session/:id (snake_case).
type ApiSession = {
  session_id: string;
  repo: string;
  model: string | null;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  hook_overhead_tokens: number;
  hook_overhead_breakdown: Record<string, number>;
  mcp_servers?: string[];
  mcp_calls?: Record<string, number>;
  baseline_tokens?: number;
  turn_count?: number;
  ended_at: string;
};

function normalizeSession(s: ApiSession): SessionUsage {
  return {
    sessionId: s.session_id,
    repo: s.repo,
    model: s.model,
    totalTokens: s.total_tokens,
    inputTokens: s.input_tokens ?? 0,
    outputTokens: s.output_tokens ?? 0,
    cacheReadTokens: s.cache_read_tokens ?? 0,
    cacheCreationTokens: s.cache_creation_tokens ?? 0,
    hookOverheadTokens: s.hook_overhead_tokens,
    hookOverheadBreakdown: s.hook_overhead_breakdown ?? {},
    mcpServers: s.mcp_servers ?? [],
    mcpCalls: s.mcp_calls ?? {},
    baselineTokens: s.baseline_tokens ?? 0,
    turnCount: s.turn_count ?? 0,
    endedAt: s.ended_at,
  };
}

export async function fetchSessions(
  accessToken: string,
  since = "30d",
  repo?: string,
): Promise<SessionUsage[]> {
  if (!accessToken) return [];
  const repoParam = repo ? `&repo=${encodeURIComponent(repo)}` : "";
  try {
    const res = await fetch(`${API_URL}/v1/sessions?since=${encodeURIComponent(since)}${repoParam}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const d = (await res.json()) as ApiSession[];
    return d.map(normalizeSession);
  } catch {
    return [];
  }
}

// ---- a single session by id (GET /v1/session/:id) --------------------------

export async function fetchSession(
  accessToken: string,
  id: string,
): Promise<SessionDetail | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${API_URL}/v1/session/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const s = (await res.json()) as ApiSession & { turn_usage?: number[][] };
    return { ...normalizeSession(s), turnUsage: s.turn_usage ?? [] };
  } catch {
    return null;
  }
}

// Color per model family.
export function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "#1a4f7f"; // navy
  if (m.includes("sonnet")) return "#1a7f64"; // teal
  if (m.includes("haiku")) return "#9a6200"; // amber
  return "#6b7280"; // gray
}

// Gauge fill colors cycled per instrument row (teal / navy / amber / gray).
export const INSTRUMENT_COLORS = ["#1a7f64", "#1a4f7f", "#9a6200", "#6b7280"] as const;

// Deterministic demo series so the detail page renders offline.
function demoSeries(name: string, since: string, error: string): SeriesResult {
  const base = DEMO_REPOS.find((r) => r.repo === name);
  const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  
  let count = 12;
  let stepMs = 86_400_000; // 1 day
  if (since === "1h") {
    count = 12;
    stepMs = 5 * 60 * 1000; // 5 mins
  } else if (since === "5h") {
    count = 15;
    stepMs = 20 * 60 * 1000; // 20 mins
  } else if (since === "12h") {
    count = 12;
    stepMs = 60 * 60 * 1000; // 1 hour
  } else if (since === "24h") {
    count = 24;
    stepMs = 60 * 60 * 1000; // 1 hour
  } else if (since === "7d") {
    count = 7;
    stepMs = 24 * 60 * 60 * 1000;
  } else if (since === "30d") {
    count = 30;
    stepMs = 24 * 60 * 60 * 1000;
  } else if (since === "90d") {
    count = 12;
    stepMs = 7 * 24 * 60 * 60 * 1000; // 1 week
  }

  const today = Date.now();
  const points: SeriesPoint[] = Array.from({ length: count }, (_, i) => {
    const wobble = 0.4 + 0.6 * Math.abs(Math.sin(seed + i));
    const scale = (base ? base.inputTokens / count : 80_000) * wobble;
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
      day: new Date(today - (count - 1 - i) * stepMs).toISOString(),
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
