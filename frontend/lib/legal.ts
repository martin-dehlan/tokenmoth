// Central legal/compliance config — single source of truth for Impressum,
// Datenschutzerklärung and the subprocessor list. Operator data is filled in;
// remaining `text-warn` notes on the legal pages flag wording a lawyer should
// review (subprocessor DPAs, jurisdiction clause; tracked in #111 / #115 / #118).
//
// ⚠️ The legal page texts that consume this file are DRAFTS. Nothing here is a
// substitute for advice from a lawyer.

export const PLACEHOLDER = "TODO_AUSFÜLLEN";

/** Operator ("Verantwortlicher" / §5 DDG). */
export const operator = {
  legalName: "Martin Dehlan",
  /** Rechtsform: Einzelunternehmer / GbR / UG (haftungsbeschränkt) … */
  legalForm: "Einzelunternehmer",
  street: "Am Breiten Luch 46", // ladungsfähige Anschrift, kein Postfach
  postalCity: "13053 Berlin",
  country: "Deutschland",
  email: "legal@tokenmoth.com", // forwards to operator inbox
  phone: "", // none — fast contact via e-mail (+ contact form); see note in #118
  /** USt-IdNr. falls vorhanden, sonst Kleinunternehmer-Hinweis (§19 UStG). */
  vatId: "", // none — Kleinunternehmer §19 UStG
  kleinunternehmer: true,
} as const;

export const site = {
  name: "TokenMoth",
  domain: "tokenmoth.com",
  url: "https://tokenmoth.com",
} as const;

/** Last substantive edit of the legal texts (manually bumped). */
export const lastUpdated = "2026-06-14";

export type Subprocessor = {
  name: string;
  purpose: string;
  /** Where personal data is processed. */
  region: string;
  /** Drittlandtransfer-Mechanismus, falls außerhalb EU/EWR. */
  transfer: string;
  /** AVV/DPA status — verify and link before go-live (#115). */
  dpa: string;
};

export const subprocessors: Subprocessor[] = [
  {
    name: "Supabase",
    purpose: "Authentifizierung & Datenbank (Account, Nutzungsdaten)",
    region: "EU/USA — Hosting-Region prüfen",
    transfer: "EU-Region wählen bzw. SCC / EU-US DPF",
    dpa: "AVV abzuschließen",
  },
  {
    name: "Vercel",
    purpose: "Hosting & Auslieferung der Web-App, Server-Logs",
    region: "USA",
    transfer: "SCC / EU-US Data Privacy Framework",
    dpa: "DPA abzuschließen",
  },
  {
    name: "PostHog",
    purpose: "Produkt-Analytics (nur nach Einwilligung)",
    region: "EU (eu.i.posthog.com)",
    transfer: "EU-Region — kein Drittlandtransfer geplant",
    dpa: "AVV abzuschließen",
  },
  {
    name: "Anthropic",
    purpose:
      "Claude Code erzeugt die Nutzungsdaten lokal; TokenMoth sendet keine Transcripts/PII an Anthropic",
    region: "USA (nur clientseitig durch Nutzer:in selbst)",
    transfer: "nicht durch TokenMoth — klären",
    dpa: "Relevanz prüfen",
  },
  {
    name: "Zahlungsdienstleister (z. B. Stripe)",
    purpose: "Abwicklung kostenpflichtiger Pläne",
    region: "USA/EU",
    transfer: "SCC / EU-US DPF",
    dpa: "AVV vor Billing-Launch (#117)",
  },
];
