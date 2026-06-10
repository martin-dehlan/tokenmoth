// Per-OS install commands + browser OS detection for the install blocks.
// macOS and Linux share the curl|sh path. Windows has no native build yet
// (release.yml ships darwin + linux only), so we point Windows users at WSL.

export type Os = "macos" | "linux" | "windows";

export const OS_OPTIONS: { id: Os; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux" },
  { id: "windows", label: "Windows" },
];

const CURL = "curl -fsSL https://tokenmoth-dist.s3.eu-central-1.amazonaws.com/install.sh | sh";

// The install line(s) for an OS. Windows runs the same installer inside WSL —
// there's no native Windows binary, so the segment carries a short WSL note.
export function installLines(os: Os): string[] {
  if (os === "windows") {
    // Inside a WSL (Ubuntu) shell — same installer as Linux.
    return [CURL];
  }
  return [CURL];
}

// Short caption shown under the Windows segment; null for macOS/Linux.
export function osNote(os: Os): string | null {
  if (os === "windows") {
    return "No native Windows build yet — run this inside WSL (wsl --install, then an Ubuntu shell).";
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
