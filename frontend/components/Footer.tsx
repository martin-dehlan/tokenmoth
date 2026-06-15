"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/lib/legal";
import { localeFromPath } from "@/lib/i18n";
import { PAGE_MAX_W } from "@/lib/ui";
import CookieSettingsLink from "@/components/CookieSettingsLink";

const LINKS: Record<"en" | "de", { slug: string; label: string }[]> = {
  en: [
    { slug: "impressum", label: "Legal notice" },
    { slug: "datenschutz", label: "Privacy" },
    { slug: "agb", label: "Terms" },
  ],
  de: [
    { slug: "impressum", label: "Impressum" },
    { slug: "datenschutz", label: "Datenschutz" },
    { slug: "agb", label: "AGB" },
  ],
};

// Global legal footer — must stay reachable from every page (max ~2 clicks).
// Links use the active locale so switching language is sticky.
export default function Footer() {
  const locale = localeFromPath(usePathname() ?? "/");
  return (
    <footer className="mt-auto bg-transparent">
      <div className={`mx-auto ${PAGE_MAX_W} px-5 py-6 flex flex-wrap items-center justify-center text-center gap-x-5 gap-y-2 text-[11px] text-faint`}>
        <span className="text-muted">
          © {new Date().getFullYear()} {site.name}
        </span>
        <Link href="/data" className="text-muted hover:text-ink transition-colors">
          {locale === "de" ? "Gesendete Daten" : "Data we send"}
        </Link>
        {LINKS[locale].map((l) => (
          <Link
            key={l.slug}
            href={`/${locale}/${l.slug}`}
            className="text-muted hover:text-ink transition-colors"
          >
            {l.label}
          </Link>
        ))}
        <CookieSettingsLink />
        <a
          href={site.repo}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="TokenMoth on GitHub"
          title="GitHub"
          className="inline-flex items-center gap-1.5 text-muted hover:text-ink transition-colors"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
      </div>
    </footer>
  );
}
