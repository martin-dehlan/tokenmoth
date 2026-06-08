import Link from "next/link";

type Nav = { key: string; label: string; href: string };

const NAV: Nav[] = [
  { key: "usage", label: "usage", href: "/#hero" },
  { key: "models", label: "repos", href: "/#instruments" },
];

// Single-line top rail: logo pip + wordmark + workspace, flat nav, date chip + settings.
// Border-bottom only, no background fill.
export default function TopRail({
  workspace = "personal",
  active = "usage",
  since = "30d",
}: {
  workspace?: string;
  active?: string;
  since?: string;
}) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between gap-4">
        {/* left: logo pip + wordmark + workspace */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span
            className="block h-[9px] w-[9px] rounded-full bg-accent"
            style={{ boxShadow: "0 0 0 3px rgba(26,127,100,0.18)" }}
          />
          <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
          <span className="font-mono text-[12px] text-faint">/{workspace}</span>
        </Link>

        {/* center: flat nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map((n) => {
            const on = n.key === active;
            return (
              <Link
                key={n.key}
                href={n.href}
                className={`relative px-2.5 py-1 text-[13px] transition-colors ${
                  on ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {n.label}
                {on && (
                  <span className="absolute left-2.5 right-2.5 -bottom-[1px] h-[2px] bg-accent rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* right: date chip + settings */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="btn text-muted">
            <span className="text-faint">last</span>
            <span className="font-mono text-ink">{since}</span>
            <span className="text-faint">▾</span>
          </span>
          <Link
            href="/settings"
            aria-label="settings"
            className={`btn ${active === "settings" ? "border-accent" : ""}`}
          >
            <span className="text-[13px] text-muted leading-none">⚙</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
