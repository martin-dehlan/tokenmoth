// Types + mock data for the dashboard. Swap `getRepos()` for a real fetch
// against the Rust API (GET /v1/repos) once that endpoint lands.

export type RepoUsage = {
  repo: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  lastActive: string;
};

// Rough Claude Opus blended price ($ per 1M tokens). Tune per model.
const PRICE = {
  input: 5.0,
  output: 25.0,
  cacheRead: 0.5,
  cacheWrite: 6.25,
} as const;

export function estimatedCost(r: RepoUsage): number {
  return (
    (r.inputTokens * PRICE.input +
      r.outputTokens * PRICE.output +
      r.cacheReadTokens * PRICE.cacheRead +
      r.cacheCreationTokens * PRICE.cacheWrite) /
    1_000_000
  );
}

export function totalTokens(r: RepoUsage): number {
  return r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreationTokens;
}

// "Breaker" load = how hot this repo is burning, relative to a soft monthly cap.
export type Load = "low" | "mid" | "high" | "tripped";

export function breakerLoad(r: RepoUsage, capUsd = 50): Load {
  const cost = estimatedCost(r);
  const ratio = cost / capUsd;
  if (ratio >= 1) return "tripped";
  if (ratio >= 0.6) return "high";
  if (ratio >= 0.3) return "mid";
  return "low";
}

export const MOCK_REPOS: RepoUsage[] = [
  {
    repo: "tokenrat",
    sessions: 42,
    inputTokens: 1_240_000,
    outputTokens: 880_000,
    cacheReadTokens: 9_300_000,
    cacheCreationTokens: 420_000,
    lastActive: "2m ago",
  },
  {
    repo: "cybermusic",
    sessions: 88,
    inputTokens: 3_900_000,
    outputTokens: 2_100_000,
    cacheReadTokens: 21_000_000,
    cacheCreationTokens: 1_050_000,
    lastActive: "1h ago",
  },
  {
    repo: "sippd",
    sessions: 67,
    inputTokens: 2_400_000,
    outputTokens: 1_300_000,
    cacheReadTokens: 14_500_000,
    cacheCreationTokens: 700_000,
    lastActive: "3h ago",
  },
  {
    repo: "illumine",
    sessions: 31,
    inputTokens: 980_000,
    outputTokens: 610_000,
    cacheReadTokens: 6_700_000,
    cacheCreationTokens: 310_000,
    lastActive: "yesterday",
  },
  {
    repo: "prooved",
    sessions: 19,
    inputTokens: 520_000,
    outputTokens: 290_000,
    cacheReadTokens: 3_100_000,
    cacheCreationTokens: 140_000,
    lastActive: "2 days ago",
  },
  {
    repo: "eam-tool",
    sessions: 7,
    inputTokens: 160_000,
    outputTokens: 95_000,
    cacheReadTokens: 900_000,
    cacheCreationTokens: 44_000,
    lastActive: "5 days ago",
  },
];

export function getRepos(): RepoUsage[] {
  return MOCK_REPOS;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
