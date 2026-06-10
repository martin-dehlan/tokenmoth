import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
import { operator, PLACEHOLDER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Widerrufsbelehrung — TokenMoth",
  robots: { index: true, follow: true },
};

function Op({ value }: { value: string }) {
  if (value === PLACEHOLDER)
    return <span className="text-warn font-mono text-[12px]">[{PLACEHOLDER}]</span>;
  return <>{value}</>;
}

export default function Widerruf() {
  return (
    <LegalShell kicker="rechtliches" title="Widerrufsbelehrung">
      <p>
        Diese Belehrung gilt für Verbraucher:innen bei kostenpflichtigen Verträgen über digitale
        Inhalte/Dienstleistungen.
      </p>

      <h2>Widerrufsrecht</h2>
      <p>
        Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
        widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
      </p>
      <p>
        Um dein Widerrufsrecht auszuüben, musst du uns (
        <Op value={operator.legalName} />, <Op value={operator.street} />,{" "}
        <Op value={operator.postalCity} />, E-Mail:{" "}
        <a href={`mailto:${operator.email}`}>{operator.email}</a>) mittels einer eindeutigen
        Erklärung (z. B. per E-Mail) über deinen Entschluss informieren. Du kannst dafür das
        beigefügte Muster-Widerrufsformular verwenden, was nicht vorgeschrieben ist.
      </p>
      <p>
        Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des
        Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.
      </p>

      <h2>Folgen des Widerrufs</h2>
      <p>
        Wenn du diesen Vertrag widerrufst, erstatten wir dir alle erhaltenen Zahlungen unverzüglich
        und spätestens binnen vierzehn Tagen ab Eingang deiner Widerrufsmitteilung. Für die
        Rückzahlung verwenden wir dasselbe Zahlungsmittel wie bei der ursprünglichen Transaktion,
        sofern nichts anderes vereinbart wurde; Entgelte berechnen wir dir dafür nicht.
      </p>

      <h2>Vorzeitiges Erlöschen des Widerrufsrechts</h2>
      <p>
        Bei Verträgen über digitale Inhalte/Dienstleistungen erlischt das Widerrufsrecht, wenn wir
        mit der Ausführung begonnen haben, nachdem du ausdrücklich zugestimmt hast, dass wir vor
        Ablauf der Widerrufsfrist mit der Ausführung beginnen, und du deine Kenntnis vom Verlust des
        Widerrufsrechts bestätigt hast.
      </p>

      <h2>Muster-Widerrufsformular</h2>
      <p>
        (Wenn du den Vertrag widerrufen willst, fülle dieses Formular aus und sende es zurück.)
      </p>
      <ul>
        <li>
          An: <Op value={operator.legalName} />, <Op value={operator.street} />,{" "}
          <Op value={operator.postalCity} />, {operator.email}
        </li>
        <li>
          Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung
          der folgenden Dienstleistung: ____________
        </li>
        <li>Bestellt am / erhalten am: ____________</li>
        <li>Name der/des Verbraucher(s): ____________</li>
        <li>Anschrift der/des Verbraucher(s): ____________</li>
        <li>Datum, Unterschrift (nur bei Mitteilung auf Papier): ____________</li>
      </ul>

      <p className="text-warn text-[12px]">
        Diese Belehrung greift erst mit dem Live-Gang kostenpflichtiger Pläne (Milestone 6 / #117).
        Vor dem ersten echten Verkauf anwaltlich freigeben und mit der Checkout-Logik koppeln
        (Button „zahlungspflichtig bestellen“, Zustimmung zum Ausführungsbeginn).
      </p>
    </LegalShell>
  );
}
