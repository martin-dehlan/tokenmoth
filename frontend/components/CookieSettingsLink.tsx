"use client";

import { usePathname } from "next/navigation";
import { localeFromPath } from "@/lib/i18n";
import { reopenConsent } from "@/lib/consent";

// Same locale detection as ConsentBanner: /de/* paths get German, everything
// else English (the app default).
const COPY = {
  en: "Cookie settings",
  de: "Cookie-Einstellungen",
} as const;

// Lets users withdraw/change consent at any time (TDDDG requirement).
export default function CookieSettingsLink() {
  const locale = localeFromPath(usePathname() ?? "/");
  return (
    <button
      type="button"
      onClick={reopenConsent}
      className="text-muted hover:text-ink transition-colors"
    >
      {COPY[locale]}
    </button>
  );
}
