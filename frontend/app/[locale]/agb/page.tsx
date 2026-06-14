import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalShell from "@/components/LegalShell";
import { operator, site } from "@/lib/legal";
import { locales, isLocale, type Locale } from "@/lib/i18n";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const TITLE: Record<Locale, string> = { en: "Terms of Service", de: "Allgemeine Geschäftsbedingungen" };

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const l = isLocale(params.locale) ? params.locale : "en";
  return { title: `${TITLE[l]} — TokenMoth`, robots: { index: true, follow: true } };
}

function Name() {
  return <>{operator.legalName}</>;
}

function En() {
  return (
    <>
      <h2>1. Scope</h2>
      <p>
        These terms govern the use of {site.name} ({site.domain}), operated by <Name /> (the
        &ldquo;Provider&rdquo;). The version valid at the time of contract conclusion applies.
      </p>
      <h2>2. Service description</h2>
      <p>
        {site.name} records, aggregates and visualises metrics about the use of Claude Code (tokens,
        estimated cost, overhead) per repository. The Provider owes provision of the platform
        &ldquo;as is&rdquo;. No particular economic outcome or accuracy of estimated cost figures is
        guaranteed.
      </p>
      <h2>3. Registration & account</h2>
      <p>
        An account is required. You are responsible for keeping your access/API keys confidential.
        Information provided must be accurate.
      </p>
      <h2>4. Availability</h2>
      <p>
        The Provider strives for high availability but owes no specific availability — especially on
        the free tier (no SLA). Maintenance, development and outages may cause interruptions.
      </p>
      <h2>5. User obligations</h2>
      <ul>
        <li>no abusive or unlawful use</li>
        <li>no impairment of availability (e.g. by automated overload)</li>
        <li>no circumvention of access or security mechanisms</li>
      </ul>
      <h2>6. User data</h2>
      <p>
        The usage data you submit remains attributed to you. Processing and protection are governed by
        the <a href="/en/datenschutz">privacy policy</a>.
      </p>
      <h2>7. Prices & payment</h2>
      <p>
        Paid plans and their prices are shown transparently during checkout. For consumers, the{" "}
        <a href="/en/widerruf">right of withdrawal</a> also applies.{" "}
        <span className="text-warn">Add plan details once billing is live (#117).</span>
      </p>
      <h2>8. Liability</h2>
      <p>
        The Provider is liable without limitation for intent and gross negligence and for injury to
        life, body or health. For ordinary negligence it is liable only for breach of essential
        contractual obligations and limited to foreseeable, contract-typical damage.{" "}
        <span className="text-warn">Verify wording with a lawyer.</span>
      </p>
      <h2>9. Term & termination</h2>
      <p>
        The usage relationship can be ended at any time by deleting the account. For paid plans, the
        terms stated during checkout apply.
      </p>
      <h2>10. Changes to these terms</h2>
      <p>
        The Provider may amend these terms with effect for the future. Material changes will be
        communicated in good time.
      </p>
      <h2>11. Governing law & jurisdiction</h2>
      <p>
        German law applies, excluding the UN Convention on Contracts for the International Sale of
        Goods. Mandatory consumer protection rules of the consumer&rsquo;s state of residence remain
        unaffected. <span className="text-warn">Verify jurisdiction clause with a lawyer.</span>
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <h2>1. Geltungsbereich</h2>
      <p>
        Diese AGB gelten für die Nutzung von {site.name} ({site.domain}), betrieben von <Name />{" "}
        („Anbieter“). Maßgeblich ist die bei Vertragsschluss gültige Fassung.
      </p>
      <h2>2. Leistungsbeschreibung</h2>
      <p>
        {site.name} erfasst, aggregiert und visualisiert Kennzahlen zur Nutzung von Claude Code
        (Token, geschätzte Kosten, Overhead) pro Repository. Der Anbieter schuldet die Bereitstellung
        der Plattform „wie besehen“. Ein bestimmter wirtschaftlicher Erfolg oder die Richtigkeit
        geschätzter Kostenwerte werden nicht garantiert.
      </p>
      <h2>3. Registrierung & Konto</h2>
      <p>
        Für die Nutzung ist ein Konto erforderlich. Du bist für die Geheimhaltung deiner
        Zugangs-/API-Schlüssel verantwortlich. Angaben müssen wahrheitsgemäß sein.
      </p>
      <h2>4. Verfügbarkeit</h2>
      <p>
        Der Anbieter bemüht sich um hohe Verfügbarkeit, schuldet jedoch — insbesondere im kostenlosen
        Tarif — keine bestimmte Verfügbarkeit (kein SLA). Wartung, Weiterentwicklung und Ausfälle
        können zu Unterbrechungen führen.
      </p>
      <h2>5. Pflichten der Nutzer:innen</h2>
      <ul>
        <li>keine missbräuchliche oder rechtswidrige Nutzung</li>
        <li>keine Beeinträchtigung der Verfügbarkeit (z. B. durch automatisierte Überlast)</li>
        <li>keine Umgehung von Zugangs- oder Sicherheitsmechanismen</li>
      </ul>
      <h2>6. Daten der Nutzer:innen</h2>
      <p>
        Die von dir übermittelten Nutzungsdaten bleiben dir zugeordnet. Verarbeitung und Schutz
        regelt die <a href="/de/datenschutz">Datenschutzerklärung</a>.
      </p>
      <h2>7. Preise & Zahlung</h2>
      <p>
        Kostenpflichtige Tarife und deren Preise werden im Bestellprozess transparent ausgewiesen.
        Für Verbraucher gilt zusätzlich die <a href="/de/widerruf">Widerrufsbelehrung</a>.{" "}
        <span className="text-warn">Tarifdetails ergänzen, sobald Billing live ist (#117).</span>
      </p>
      <h2>8. Haftung</h2>
      <p>
        Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung
        von Leben, Körper, Gesundheit. Bei einfacher Fahrlässigkeit haftet er nur bei Verletzung
        wesentlicher Vertragspflichten und begrenzt auf den vertragstypisch vorhersehbaren Schaden.
        <span className="text-warn"> Wording mit Anwalt prüfen.</span>
      </p>
      <h2>9. Laufzeit & Kündigung</h2>
      <p>
        Das Nutzungsverhältnis kann jederzeit durch Löschung des Kontos beendet werden. Bei
        kostenpflichtigen Tarifen gelten die im Bestellprozess angegebenen Laufzeiten.
      </p>
      <h2>10. Änderungen der AGB</h2>
      <p>
        Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern. Über wesentliche Änderungen
        wird rechtzeitig informiert.
      </p>
      <h2>11. Anwendbares Recht & Gerichtsstand</h2>
      <p>
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Zwingende
        Verbraucherschutzvorschriften des Wohnsitzstaates bleiben unberührt.{" "}
        <span className="text-warn">Gerichtsstandklausel mit Anwalt prüfen.</span>
      </p>
    </>
  );
}

export default function AGB({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  return (
    <LegalShell locale={locale} slug="agb" title={TITLE[locale]}>
      {locale === "de" ? <De /> : <En />}
    </LegalShell>
  );
}
