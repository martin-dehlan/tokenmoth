"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONSENT_REOPEN_EVENT,
  readConsent,
  writeConsent,
  type Consent,
} from "@/lib/consent";

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Opt-in consent banner. Shows on first visit when an analytics key is set and
// no choice has been made yet. "Ablehnen" is equally prominent as "Akzeptieren"
// (no dark patterns). Reopened via the footer "Cookie-Einstellungen" link.
export default function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // No analytics configured → nothing to consent to.
    if (!PH) return;
    if (readConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  function choose(value: Consent) {
    writeConsent(value);
    setOpen(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-surface border border-line bg-surface shadow-surface px-5 py-4">
        <div className="text-[10px] uppercase tracking-label text-faint mb-1.5">
          Cookies & Analytics
        </div>
        <p className="text-[12px] text-muted leading-relaxed">
          Für den Betrieb technisch notwendige Cookies (z. B. Login) setzen wir immer.
          Zusätzlich nutzen wir optionale Produkt-Analytics (PostHog), um TokenMoth zu
          verbessern — nur mit deiner Einwilligung. Du kannst sie jederzeit über die
          Cookie-Einstellungen im Footer widerrufen. Mehr in der{" "}
          <Link href="/datenschutz" className="underline hover:text-ink">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button onClick={() => choose("granted")} className="btn btn-accent">
            Akzeptieren
          </button>
          <button onClick={() => choose("denied")} className="btn text-muted">
            Ablehnen
          </button>
          <Link href="/datenschutz" className="btn text-muted">
            Details
          </Link>
        </div>
      </div>
    </div>
  );
}
