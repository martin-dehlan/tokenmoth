import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
import { operator, subprocessors, site, PLACEHOLDER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — TokenMoth",
  robots: { index: true, follow: true },
};

function Op({ value }: { value: string }) {
  if (value === PLACEHOLDER)
    return <span className="text-warn font-mono text-[12px]">[{PLACEHOLDER}]</span>;
  return <>{value}</>;
}

export default function Datenschutz() {
  return (
    <LegalShell kicker="rechtliches" title="Datenschutzerklärung">
      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung auf {site.domain} im Sinne der DSGVO:
        <br />
        <Op value={operator.legalName} />, <Op value={operator.street} />,{" "}
        <Op value={operator.postalCity} />, {operator.country}
        <br />
        E-Mail: <a href={`mailto:${operator.email}`}>{operator.email}</a>
        <br />
        Die vollständigen Angaben finden sich im <a href="/impressum">Impressum</a>.
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
        (bzw. werden vor Go-Live geschlossen) Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO:
      </p>
      <table>
        <thead>
          <tr>
            <th>Dienst</th>
            <th>Zweck</th>
            <th>Region</th>
            <th>Transfer</th>
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
      <p className="text-warn text-[12px]">
        Hinweis: Regionen, Drittlandtransfer-Mechanismen (SCC / EU-US DPF) und AVV-Abschlüsse vor
        Go-Live verifizieren (siehe docs/legal/subprozessoren.md).
      </p>

      <h2>5. Speicherdauer</h2>
      <p>
        Account- und Nutzungsdaten speichern wir, solange dein Konto besteht. Nach Löschung des
        Kontos werden die zugehörigen Daten gelöscht; gesetzliche Aufbewahrungsfristen (z. B.
        steuerrechtlich für Rechnungen) bleiben unberührt. Konkrete Löschfristen:{" "}
        <span className="text-warn">[{PLACEHOLDER}]</span>.
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
    </LegalShell>
  );
}
