"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeFromPath } from "@/lib/i18n";
import {
  CONSENT_REOPEN_EVENT,
  readConsent,
  writeConsent,
  type Consent,
} from "@/lib/consent";

const COPY = {
  en: {
    heading: "Cookies & analytics",
    body: (privacy: string) => (
      <>
        We always set cookies that are technically necessary to run the service (e.g. login). In
        addition we use optional product analytics (PostHog) to improve TokenMoth — only with your
        consent. You can withdraw it any time via cookie settings in the footer. More in the{" "}
        <Link href={privacy} className="underline hover:text-ink">
          privacy policy
        </Link>
        .
      </>
    ),
    accept: "Accept",
    reject: "Reject",
    details: "Details",
  },
  de: {
    heading: "Cookies & Analytics",
    body: (privacy: string) => (
      <>
        Für den Betrieb technisch notwendige Cookies (z. B. Login) setzen wir immer. Zusätzlich
        nutzen wir optionale Produkt-Analytics (PostHog), um TokenMoth zu verbessern — nur mit deiner
        Einwilligung. Du kannst sie jederzeit über die Cookie-Einstellungen im Footer widerrufen.
        Mehr in der{" "}
        <Link href={privacy} className="underline hover:text-ink">
          Datenschutzerklärung
        </Link>
        .
      </>
    ),
    accept: "Akzeptieren",
    reject: "Ablehnen",
    details: "Details",
  },
};

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Opt-in consent banner. Shows on first visit when an analytics key is set and
// no choice has been made yet. "Ablehnen" is equally prominent as "Akzeptieren"
// (no dark patterns). Reopened via the footer "Cookie-Einstellungen" link.
export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const locale = localeFromPath(usePathname() ?? "/");
  const c = COPY[locale];
  const privacy = `/${locale}/datenschutz`;

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
        <div className="text-[10px] uppercase tracking-label text-faint mb-1.5">{c.heading}</div>
        <p className="text-[12px] text-muted leading-relaxed">{c.body(privacy)}</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button onClick={() => choose("granted")} className="btn btn-accent">
            {c.accept}
          </button>
          <button onClick={() => choose("denied")} className="btn text-muted">
            {c.reject}
          </button>
          <Link href={privacy} className="btn text-muted">
            {c.details}
          </Link>
        </div>
      </div>
    </div>
  );
}
