import Link from "next/link";
import MothLogo from "@/components/MothLogo";
import { lastUpdated } from "@/lib/legal";
import { locales, localeLabel, type Locale } from "@/lib/i18n";

const t = {
  en: {
    kicker: "legal",
    back: "← home",
    updated: "Last updated",
    draft: (
      <>
        <strong>Draft — pending legal review.</strong> This text is a template and not yet
        legally approved. Have it reviewed by a lawyer before publishing (see{" "}
        <code>docs/legal/anwalt-briefing.md</code>).
      </>
    ),
  },
  de: {
    kicker: "rechtliches",
    back: "← Startseite",
    updated: "Stand",
    draft: (
      <>
        <strong>Entwurf — anwaltliche Prüfung ausstehend.</strong> Dieser Text ist eine Vorlage
        und noch nicht rechtsverbindlich freigegeben. Vor Veröffentlichung von einer
        Anwältin/einem Anwalt prüfen lassen (siehe <code>docs/legal/anwalt-briefing.md</code>).
      </>
    ),
  },
} satisfies Record<Locale, unknown>;

// Shared chrome for the static legal pages — same neo-brutalist surface as the
// rest of the app, but standalone (no auth-gated TopRail). Locale-aware: shows a
// language switcher and translates its own strings.
export default function LegalShell({
  locale,
  slug,
  title,
  draft = true,
  children,
}: {
  locale: Locale;
  slug: string;
  title: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  const s = t[locale];
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto max-w-3xl px-5 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <MothLogo className="h-[22px] w-auto text-ink shrink-0" />
            <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="seg">
              {locales.map((l) => (
                <Link
                  key={l}
                  href={`/${l}/${slug}`}
                  data-active={l === locale}
                  className={l === locale ? "text-ink" : "text-muted hover:text-ink"}
                >
                  {localeLabel[l]}
                </Link>
              ))}
            </div>
            <Link href="/" className="text-[13px] text-muted hover:text-ink transition-colors">
              {s.back}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 w-full">
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-8 pt-8 pb-8">
            <div className="text-[10px] uppercase tracking-label text-faint mb-1">{s.kicker}</div>
            <h1 className="text-2xl font-medium tracking-hero text-ink mb-1">{title}</h1>
            <p className="text-[11px] text-faint mb-6">
              {s.updated}: {lastUpdated}
            </p>

            {draft && (
              <div className="mb-7 rounded-btn border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3 text-[12px] text-warn leading-relaxed">
                {s.draft}
              </div>
            )}

            <div className="legal-prose text-[13px] text-ink leading-relaxed">{children}</div>
          </section>
        </div>
      </main>
    </>
  );
}
