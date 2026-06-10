import Link from "next/link";
import { site } from "@/lib/legal";
import CookieSettingsLink from "@/components/CookieSettingsLink";

const LINKS = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/agb", label: "AGB" },
  { href: "/widerruf", label: "Widerruf" },
];

// Global legal footer — must stay reachable from every page (max ~2 clicks).
export default function Footer() {
  return (
    <footer className="border-t border-line mt-auto">
      <div className="mx-auto max-w-5xl px-5 py-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-faint">
        <span className="text-muted">© {new Date().getFullYear()} {site.name}</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-muted hover:text-ink transition-colors">
            {l.label}
          </Link>
        ))}
        <CookieSettingsLink />
      </div>
    </footer>
  );
}
