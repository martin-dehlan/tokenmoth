import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalShell from "@/components/LegalShell";
import { operator, PLACEHOLDER } from "@/lib/legal";
import { locales, isLocale, type Locale } from "@/lib/i18n";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const TITLE: Record<Locale, string> = { en: "Right of withdrawal", de: "Widerrufsbelehrung" };

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const l = isLocale(params.locale) ? params.locale : "en";
  return { title: `${TITLE[l]} — TokenMoth`, robots: { index: true, follow: true } };
}

function Op({ value }: { value: string }) {
  if (value === PLACEHOLDER)
    return <span className="text-warn font-mono text-[12px]">[{PLACEHOLDER}]</span>;
  return <>{value}</>;
}

function En() {
  return (
    <>
      <p>
        This notice applies to consumers in the case of paid contracts for digital
        content/services.
      </p>
      <h2>Right of withdrawal</h2>
      <p>
        You have the right to withdraw from this contract within fourteen days without giving any
        reason. The withdrawal period is fourteen days from the day of conclusion of the contract.
      </p>
      <p>
        To exercise your right of withdrawal, you must inform us (<Op value={operator.legalName} />,{" "}
        <Op value={operator.street} />, <Op value={operator.postalCity} />, email:{" "}
        <a href={`mailto:${operator.email}`}>{operator.email}</a>) by means of a clear statement
        (e.g. by email) of your decision. You may use the model withdrawal form below, but it is not
        mandatory.
      </p>
      <p>
        To meet the withdrawal deadline, it is sufficient to send your communication concerning the
        exercise of the right of withdrawal before the withdrawal period has expired.
      </p>
      <h2>Consequences of withdrawal</h2>
      <p>
        If you withdraw from this contract, we will reimburse all payments received from you without
        undue delay and at the latest within fourteen days from the day on which we receive your
        notice. We use the same means of payment as in the original transaction unless otherwise
        agreed; you will not be charged any fees for this reimbursement.
      </p>
      <h2>Early expiry of the right of withdrawal</h2>
      <p>
        For contracts on digital content/services, the right of withdrawal expires if we have begun
        performance after you expressly agreed that we may begin before the end of the withdrawal
        period and you confirmed your awareness of losing the right of withdrawal.
      </p>
      <h2>Model withdrawal form</h2>
      <p>(If you want to withdraw from the contract, fill in this form and send it back.)</p>
      <ul>
        <li>
          To: <Op value={operator.legalName} />, <Op value={operator.street} />,{" "}
          <Op value={operator.postalCity} />, {operator.email}
        </li>
        <li>
          I/we hereby withdraw from the contract concluded by me/us for the provision of the following
          service: ____________
        </li>
        <li>Ordered on / received on: ____________</li>
        <li>Name of consumer(s): ____________</li>
        <li>Address of consumer(s): ____________</li>
        <li>Date, signature (only for notification on paper): ____________</li>
      </ul>
      <p className="text-warn text-[12px]">
        This notice only takes effect once paid plans go live (Milestone 6 / #117). Have it approved
        by a lawyer before the first real sale and couple it with the checkout logic (button
        &ldquo;order with obligation to pay&rdquo;, consent to start of performance).
      </p>
    </>
  );
}

function De() {
  return (
    <>
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
        Um dein Widerrufsrecht auszuüben, musst du uns (<Op value={operator.legalName} />,{" "}
        <Op value={operator.street} />, <Op value={operator.postalCity} />, E-Mail:{" "}
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
      <p>(Wenn du den Vertrag widerrufen willst, fülle dieses Formular aus und sende es zurück.)</p>
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
    </>
  );
}

export default function Widerruf({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  return (
    <LegalShell locale={locale} slug="widerruf" title={TITLE[locale]}>
      {locale === "de" ? <De /> : <En />}
    </LegalShell>
  );
}
