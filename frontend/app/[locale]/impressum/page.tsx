import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalShell from "@/components/LegalShell";
import { operator, PLACEHOLDER } from "@/lib/legal";
import { locales, isLocale, type Locale } from "@/lib/i18n";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const TITLE: Record<Locale, string> = { en: "Legal notice (Impressum)", de: "Impressum" };

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const l = isLocale(params.locale) ? params.locale : "en";
  return { title: `${TITLE[l]} — TokenMoth`, robots: { index: true, follow: true } };
}

function Field({ value }: { value: string }) {
  if (value === PLACEHOLDER)
    return <span className="text-warn font-mono text-[12px]">[{PLACEHOLDER}]</span>;
  return <>{value}</>;
}

function Address() {
  return (
    <p>
      <Field value={operator.legalName} />
      <br />
      {operator.legalForm}
      <br />
      <Field value={operator.street} />
      <br />
      <Field value={operator.postalCity} />
      <br />
      {operator.country}
    </p>
  );
}

function En() {
  return (
    <>
      <h2>Provider identification (§ 5 DDG)</h2>
      <Address />
      <h2>Contact</h2>
      <p>
        Email: <a href={`mailto:${operator.email}`}>{operator.email}</a>
        <br />
        Phone: <Field value={operator.phone} />
      </p>
      <h2>VAT</h2>
      <p>
        {operator.kleinunternehmer ? (
          <>
            Pursuant to § 19 German VAT Act (UStG, small-business rule) no VAT is charged or shown.{" "}
            <span className="text-warn">Confirm status before go-live.</span>
          </>
        ) : (
          <>
            VAT identification number under § 27 a UStG: <Field value={operator.vatId} />
          </>
        )}
      </p>
      <h2>Responsible for content</h2>
      <p>
        <Field value={operator.legalName} />, address as above.
      </p>
      <h2>EU dispute resolution</h2>
      <p>
        The European Commission provides a platform for online dispute resolution (ODR):{" "}
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">
          https://ec.europa.eu/consumers/odr/
        </a>
        . We are neither willing nor obliged to participate in dispute resolution proceedings before a
        consumer arbitration board. <span className="text-warn">Verify obligation/wording with a lawyer.</span>
      </p>
    </>
  );
}

function De() {
  return (
    <>
      <h2>Angaben gemäß § 5 DDG</h2>
      <Address />
      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${operator.email}`}>{operator.email}</a>
        <br />
        Telefon: <Field value={operator.phone} />
      </p>
      <h2>Umsatzsteuer</h2>
      <p>
        {operator.kleinunternehmer ? (
          <>
            Gemäß § 19 UStG wird keine Umsatzsteuer berechnet und daher nicht ausgewiesen
            (Kleinunternehmerregelung). <span className="text-warn">Status vor Go-Live bestätigen.</span>
          </>
        ) : (
          <>
            Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: <Field value={operator.vatId} />
          </>
        )}
      </p>
      <h2>Verantwortlich für den Inhalt</h2>
      <p>
        <Field value={operator.legalName} />, Anschrift wie oben.
      </p>
      <h2>EU-Streitschlichtung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">
          https://ec.europa.eu/consumers/odr/
        </a>
        . Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.{" "}
        <span className="text-warn">Pflicht/Wording mit Anwalt prüfen.</span>
      </p>
    </>
  );
}

export default function Impressum({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  return (
    <LegalShell locale={locale} slug="impressum" title={TITLE[locale]}>
      {locale === "de" ? <De /> : <En />}
    </LegalShell>
  );
}
