// Per-OS install commands + browser OS detection for the install blocks.
// macOS and Linux share the curl|sh path; Windows has a native PowerShell
// installer (irm|iex → tokenmoth.exe). WSL counts as Linux (detected as such).

export type Os = "macos" | "linux" | "windows";

export const OS_OPTIONS: { id: Os; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux" },
  { id: "windows", label: "Windows" },
];

// Branded dist domain (CloudFront → S3, see issue #124). The raw S3 URL stays
// as a transitional fallback inside the installers themselves.
const BASE = "https://get.tokenmoth.com";
const CURL = `curl -fsSL ${BASE}/install.sh | sh`;
const PWSH = `irm ${BASE}/install.ps1 | iex`;

// How the user installs. npm is the default — OS-agnostic, no toolchain, and
// every Claude Code user already has Node. `script` is the curl|sh / irm path
// for people without Node (and is OS-specific).
export type Method = "npm" | "script";

export const METHOD_OPTIONS: { id: Method; label: string }[] = [
  { id: "npm", label: "npm" },
  { id: "script", label: "script" },
];

// The install line(s) for an OS. Windows uses the native PowerShell installer;
// macOS/Linux share the curl|sh path.
export function installLines(os: Os): string[] {
  return os === "windows" ? [PWSH] : [CURL];
}

// Full command sequence for a method. `setupArgs` is the trailing argument
// string for `setup` (e.g. "--key abc --api-url …" or the teaser dots).
// npm runs install + setup in a single `npx` line; the script path is the
// installer one-liner followed by a separate `tokenmoth setup`.
export function installSequence(method: Method, os: Os, setupArgs: string): string[] {
  if (method === "npm") {
    // -y skips npx's first-run "Ok to proceed?" prompt so the one-liner runs
    // start-to-finish without interruption.
    return [`npx -y tokenmoth setup ${setupArgs}`];
  }
  return [...installLines(os), `tokenmoth setup ${setupArgs}`];
}

// Short caption shown under the install block. Only the script path has caveats
// (PowerShell on Windows); npm is the same everywhere.
export function methodNote(method: Method, os: Os): string | null {
  if (method === "npm") return "Works on macOS, Linux and Windows — needs Node (you already have it for Claude Code).";
  if (os === "windows") return "Run in PowerShell. (On WSL, pick Linux instead.)";
  return null;
}

// Short caption shown under a segment; null when nothing extra is needed.
export function osNote(os: Os): string | null {
  if (os === "windows") {
    return "Run in PowerShell. (On WSL, pick Linux instead.)";
  }
  return null;
}

// Best-effort OS guess from the browser. Returns null when undetectable
// (e.g. server render) so callers can fall back to a stable default.
export function detectOs(): Os | null {
  if (typeof navigator === "undefined") return null;

  // userAgentData is the modern, UA-string-independent signal.
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const platform = (uaData?.platform || navigator.platform || "").toLowerCase();
  const ua = navigator.userAgent.toLowerCase();

  if (platform.includes("win") || ua.includes("windows")) return "windows";
  if (platform.includes("mac") || ua.includes("mac os")) return "macos";
  if (platform.includes("linux") || ua.includes("linux")) return "linux";
  return null;
}
