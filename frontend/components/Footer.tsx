"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/lib/legal";
import { localeFromPath } from "@/lib/i18n";
import CookieSettingsLink from "@/components/CookieSettingsLink";

const LINKS: Record<"en" | "de", { slug: string; label: string }[]> = {
  en: [
    { slug: "impressum", label: "Legal notice" },
    { slug: "datenschutz", label: "Privacy" },
    { slug: "agb", label: "Terms" },
    { slug: "widerruf", label: "Withdrawal" },
  ],
  de: [
    { slug: "impressum", label: "Impressum" },
    { slug: "datenschutz", label: "Datenschutz" },
    { slug: "agb", label: "AGB" },
    { slug: "widerruf", label: "Widerruf" },
  ],
};

// Global legal footer — must stay reachable from every page (max ~2 clicks).
// Links use the active locale so switching language is sticky.
export default function Footer() {
  const locale = localeFromPath(usePathname() ?? "/");
  return (
    <footer className="border-t border-line mt-auto">
      <div className="mx-auto max-w-5xl px-5 py-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-faint">
        <span className="text-muted">
          © {new Date().getFullYear()} {site.name}
        </span>
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
      </div>
    </footer>
  );
}
