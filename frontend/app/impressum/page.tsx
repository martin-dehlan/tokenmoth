import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
import { operator, PLACEHOLDER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Impressum — TokenMoth",
  robots: { index: true, follow: true },
};

function Field({ value }: { value: string }) {
  if (value === PLACEHOLDER) {
    return <span className="text-warn font-mono text-[12px]">[{PLACEHOLDER}]</span>;
  }
  return <>{value}</>;
}

export default function Impressum() {
  return (
    <LegalShell kicker="rechtliches" title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
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
    </LegalShell>
  );
}
