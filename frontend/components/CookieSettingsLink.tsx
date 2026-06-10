"use client";

import { reopenConsent } from "@/lib/consent";

// Lets users withdraw/change consent at any time (TDDDG requirement).
export default function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={reopenConsent}
      className="text-muted hover:text-ink transition-colors"
    >
      Cookie-Einstellungen
    </button>
  );
}
