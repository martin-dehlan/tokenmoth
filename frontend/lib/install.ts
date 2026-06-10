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

// Cross-platform one-liners. The npm path is the lowest-friction option for the
// Claude Code crowd — everyone already has Node/npm (Claude Code ships over
// npm), no compile, no toolchain. Homebrew is the trusted Mac/Linux default.
export const NPM = "npm install -g tokenmoth";
export const NPX = "npx tokenmoth";
export const BREW = "brew install martin-dehlan/tokenmoth/tokenmoth";

// The install line(s) for an OS. Windows uses the native PowerShell installer;
// macOS/Linux share the curl|sh path.
export function installLines(os: Os): string[] {
  return os === "windows" ? [PWSH] : [CURL];
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
