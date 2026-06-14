import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalShell from "@/components/LegalShell";
import { operator, subprocessors, site } from "@/lib/legal";
import { locales, isLocale, type Locale } from "@/lib/i18n";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const TITLE: Record<Locale, string> = { en: "Privacy policy", de: "Datenschutzerklärung" };

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const l = isLocale(params.locale) ? params.locale : "en";
  return { title: `${TITLE[l]} — TokenMoth`, robots: { index: true, follow: true } };
}

function Op({ value }: { value: string }) {
  return <>{value}</>;
}

function SubprocessorTable({ locale }: { locale: Locale }) {
  const h =
    locale === "de"
      ? ["Dienst", "Zweck", "Region", "Transfer"]
      : ["Service", "Purpose", "Region", "Transfer"];
  return (
    <table>
      <thead>
        <tr>
          {h.map((x) => (
            <th key={x}>{x}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {subprocessors.map((s) => (
          <tr key={s.name}>
            <td>{s.name}</td>
            <td>{s.purpose}</td>
            <td>{s.region}</td>
            <td>{s.transfer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function En() {
  return (
    <>
      <h2>1. Controller</h2>
      <p>
        Controller for data processing on {site.domain} within the meaning of the GDPR:
        <br />
        <Op value={operator.legalName} />, <Op value={operator.street} />,{" "}
        <Op value={operator.postalCity} />, {operator.country}
        <br />
        Email: <a href={`mailto:${operator.email}`}>{operator.email}</a>
        <br />
        Full details in the <a href="/en/impressum">legal notice</a>.
      </p>

      <h2>2. What data we process</h2>
      <h3>a) Account & authentication</h3>
      <p>
        When you sign in (OAuth login via Supabase) we process your email address and a user ID.
        Legal basis: performance of a contract (Art. 6(1)(b) GDPR).
      </p>
      <h3>b) Usage / telemetry data</h3>
      <p>
        TokenMoth records metrics about your Claude Code usage: token counts, estimated cost, model
        names, repository names, session metadata and plugin/hook overhead. The locally installed
        hook sends these via an API key to our API.{" "}
        <strong>Transcripts/source code are not transmitted.</strong> Legal basis: performance of a
        contract (Art. 6(1)(b) GDPR).
      </p>
      <h3>c) Server logs</h3>
      <p>
        When you access the website, technically necessary data (e.g. IP address, timestamp,
        user agent) is processed by our hosting provider. Legal basis: legitimate interest in
        operation and security (Art. 6(1)(f) GDPR).
      </p>
      <h3>d) Product analytics (consent only)</h3>
      <p>
        With your consent we use PostHog to analyse usage and improve TokenMoth. Without consent no
        analytics take place. Legal basis: consent (Art. 6(1)(a) GDPR, § 25(1) TDDDG). You can
        withdraw consent at any time via <em>Cookie settings</em> in the footer.
      </p>
      <h3>e) Payment data</h3>
      <p>
        For paid plans, payment data is processed by a payment provider. We do not store full payment
        instrument data ourselves. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).
      </p>

      <h2>3. Cookies & local storage</h2>
      <p>
        Technically necessary cookies (e.g. to keep your Supabase login session) are set on the basis
        of § 25(2) TDDDG without consent. Your cookie/analytics choice is stored locally in your
        browser. Optional analytics cookies are only set after your consent.
      </p>

      <h2>4. Recipients / processors</h2>
      <p>
        To provide the service we use the following providers. Data processing agreements under
        Art. 28 GDPR are in place with each:
      </p>
      <SubprocessorTable locale="en" />

      <h2>5. Retention</h2>
      <p>
        We store account and usage data for as long as your account exists. After account deletion the
        associated data is deleted; statutory retention obligations (e.g. tax law for invoices) remain
        unaffected. Specific retention periods: usage data is kept until you delete your account;
        server logs are deleted after 14 days; invoice data is retained for 10 years under statutory
        tax law (§ 147 AO, § 14b UStG).
      </p>

      <h2>6. Your rights</h2>
      <p>Under the GDPR you have in particular the following rights:</p>
      <ul>
        <li>access to the data stored about you (Art. 15)</li>
        <li>rectification of inaccurate data (Art. 16)</li>
        <li>erasure (Art. 17) — directly via &ldquo;Delete account&rdquo; in settings</li>
        <li>restriction of processing (Art. 18)</li>
        <li>data portability / export (Art. 20) — via the export function in the dashboard</li>
        <li>objection to processing based on legitimate interests (Art. 21)</li>
        <li>withdrawal of consent with effect for the future (Art. 7(3))</li>
      </ul>
      <p>
        An email to <a href={`mailto:${operator.email}`}>{operator.email}</a> is sufficient to
        exercise these. You also have the right to lodge a complaint with a supervisory authority.
      </p>

      <h2>7. Changes</h2>
      <p>
        We adapt this privacy policy when processing changes. The version published on this page
        applies.
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung auf {site.domain} im Sinne der DSGVO:
        <br />
        <Op value={operator.legalName} />, <Op value={operator.street} />,{" "}
        <Op value={operator.postalCity} />, {operator.country}
        <br />
        E-Mail: <a href={`mailto:${operator.email}`}>{operator.email}</a>
        <br />
        Die vollständigen Angaben finden sich im <a href="/de/impressum">Impressum</a>.
      </p>

      <h2>2. Welche Daten wir verarbeiten</h2>
      <h3>a) Account & Authentifizierung</h3>
      <p>
        Bei der Anmeldung (Login über einen OAuth-Anbieter via Supabase) verarbeiten wir deine
        E-Mail-Adresse und eine Nutzer-ID. Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b
        DSGVO).
      </p>
      <h3>b) Nutzungs-/Telemetriedaten</h3>
      <p>
        TokenMoth erfasst Kennzahlen zu deiner Claude-Code-Nutzung: Token-Anzahl, geschätzte Kosten,
        Modellnamen, Repository-Namen, Session-Metadaten und Plugin-/Hook-Overhead. Diese Daten
        sendet der lokal installierte Hook über einen API-Schlüssel an unsere API.{" "}
        <strong>Transcripts/Quellcode-Inhalte werden nicht übertragen.</strong> Rechtsgrundlage:
        Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
      </p>
      <h3>c) Server-Logs</h3>
      <p>
        Beim Aufruf der Website werden technisch notwendige Daten (z. B. IP-Adresse, Zeitpunkt,
        User-Agent) durch unseren Hosting-Dienstleister verarbeitet. Rechtsgrundlage: berechtigtes
        Interesse an Betrieb und Sicherheit (Art. 6 Abs. 1 lit. f DSGVO).
      </p>
      <h3>d) Produkt-Analytics (nur mit Einwilligung)</h3>
      <p>
        Mit deiner Einwilligung nutzen wir PostHog, um die Nutzung von TokenMoth zu analysieren und
        das Produkt zu verbessern. Ohne Einwilligung findet keine Analyse statt. Rechtsgrundlage:
        Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Du kannst die Einwilligung
        jederzeit über die <em>Cookie-Einstellungen</em> im Footer widerrufen.
      </p>
      <h3>e) Zahlungsdaten</h3>
      <p>
        Bei kostenpflichtigen Plänen werden Zahlungsdaten durch einen Zahlungsdienstleister
        verarbeitet. Wir speichern selbst keine vollständigen Zahlungsmittel-Daten. Rechtsgrundlage:
        Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
      </p>

      <h2>3. Cookies & lokale Speicherung</h2>
      <p>
        Technisch notwendige Cookies (z. B. zur Aufrechterhaltung deiner Login-Sitzung über
        Supabase) setzen wir auf Grundlage von § 25 Abs. 2 TDDDG ohne Einwilligung. Deine
        Cookie-/Analytics-Entscheidung speichern wir lokal in deinem Browser. Optionale
        Analytics-Cookies werden erst nach deiner Einwilligung gesetzt.
      </p>

      <h2>4. Empfänger / Auftragsverarbeiter</h2>
      <p>
        Zur Bereitstellung des Dienstes setzen wir folgende Dienstleister ein. Mit ihnen bestehen
        Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO:
      </p>
      <SubprocessorTable locale="de" />

      <h2>5. Speicherdauer</h2>
      <p>
        Account- und Nutzungsdaten speichern wir, solange dein Konto besteht. Nach Löschung des
        Kontos werden die zugehörigen Daten gelöscht; gesetzliche Aufbewahrungsfristen (z. B.
        steuerrechtlich für Rechnungen) bleiben unberührt. Konkrete Löschfristen: Nutzungsdaten bis
        zur Kontolöschung, Server-Logs nach 14 Tagen, Rechnungsdaten 10 Jahre (§ 147 AO, § 14b UStG).
      </p>

      <h2>6. Deine Rechte</h2>
      <p>Dir stehen nach der DSGVO insbesondere folgende Rechte zu:</p>
      <ul>
        <li>Auskunft über die zu dir gespeicherten Daten (Art. 15)</li>
        <li>Berichtigung unrichtiger Daten (Art. 16)</li>
        <li>Löschung (Art. 17) — direkt über „Account löschen“ in den Einstellungen</li>
        <li>Einschränkung der Verarbeitung (Art. 18)</li>
        <li>Datenübertragbarkeit / Export (Art. 20) — über die Export-Funktion im Dashboard</li>
        <li>Widerspruch gegen Verarbeitung auf Basis berechtigter Interessen (Art. 21)</li>
        <li>Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3)</li>
      </ul>
      <p>
        Zur Ausübung genügt eine E-Mail an{" "}
        <a href={`mailto:${operator.email}`}>{operator.email}</a>. Außerdem steht dir ein
        Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu.
      </p>

      <h2>7. Änderungen</h2>
      <p>
        Wir passen diese Datenschutzerklärung an, wenn sich die Datenverarbeitung ändert. Es gilt die
        jeweils auf dieser Seite veröffentlichte Fassung.
      </p>
    </>
  );
}

export default function Datenschutz({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  return (
    <LegalShell locale={locale} slug="datenschutz" title={TITLE[locale]}>
      {locale === "de" ? <De /> : <En />}
    </LegalShell>
  );
}
