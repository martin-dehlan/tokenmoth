import Link from "next/link";
import WindowSelect from "./WindowSelect";
import MothLogo from "./MothLogo";
import ReloadButton from "./ReloadButton";
import ThemeToggle from "./ThemeToggle";
import { PAGE_MAX_W } from "@/lib/ui";

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
      <div className={`mx-auto ${PAGE_MAX_W} px-5`}>
        <div className="h-14 flex items-center justify-between gap-4">
          {/* left: logo pip + wordmark + workspace */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <MothLogo className="h-[22px] w-auto text-ink shrink-0" />
            <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
            {/* workspace tag eats width on phones — desktop only */}
            <span className="hidden sm:inline font-mono text-[12px] text-faint">/{workspace}</span>
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

          {/* right: window picker (desktop inline) + settings */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <WindowSelect current={since} />
            </div>
            <ReloadButton />
            <ThemeToggle />
            <Link
              href="/settings"
              aria-label="settings"
              className={`btn ${active === "settings" ? "border-accent" : ""}`}
            >
              <span className="text-[13px] text-muted leading-none">⚙</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn text-muted">
                sign out
              </button>
            </form>
          </div>
        </div>

        {/* mobile: window picker on its own row — fits most phones, scrolls on
            the narrowest instead of overflowing the header. */}
        <div className="sm:hidden pb-2.5 -mt-0.5 overflow-x-auto">
          <WindowSelect current={since} />
        </div>
      </div>
    </header>
  );
}
