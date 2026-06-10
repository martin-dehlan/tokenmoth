import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
import { operator, site, PLACEHOLDER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "AGB — TokenMoth",
  robots: { index: true, follow: true },
};

export default function AGB() {
  return (
    <LegalShell kicker="rechtliches" title="Allgemeine Geschäftsbedingungen">
      <h2>1. Geltungsbereich</h2>
      <p>
        Diese AGB gelten für die Nutzung von {site.name} ({site.domain}), betrieben von{" "}
        {operator.legalName === PLACEHOLDER ? (
          <span className="text-warn font-mono text-[12px]">[{PLACEHOLDER}]</span>
        ) : (
          operator.legalName
        )}{" "}
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
        regelt die <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>

      <h2>7. Preise & Zahlung</h2>
      <p>
        Kostenpflichtige Tarife und deren Preise werden im Bestellprozess transparent ausgewiesen.
        Für Verbraucher gilt zusätzlich die <a href="/widerruf">Widerrufsbelehrung</a>.{" "}
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
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutz-
        vorschriften des Wohnsitzstaates bleiben unberührt. <span className="text-warn">Gerichtsstand-
        klausel mit Anwalt prüfen.</span>
      </p>
    </LegalShell>
  );
}
