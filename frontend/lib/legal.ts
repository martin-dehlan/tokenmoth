// Central legal/compliance config — single source of truth for Impressum,
// Datenschutzerklärung and the subprocessor list. Operator data, retention
// periods and subprocessor DPAs are filled in (provider DPAs are standard
// Art. 28 GDPR agreements accepted in each provider's dashboard).

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
  /** AVV/DPA basis under Art. 28 GDPR. */
  dpa: string;
};

export const subprocessors: Subprocessor[] = [
  {
    name: "Supabase",
    purpose: "Authentifizierung & Datenbank (Account, Nutzungsdaten)",
    region: "EU (Frankfurt, eu-central-1)",
    transfer: "EU-Region — kein Drittlandtransfer",
    dpa: "AVV nach Art. 28 DSGVO (Supabase DPA)",
  },
  {
    name: "Vercel",
    purpose: "Hosting & Auslieferung der Web-App, Server-Logs",
    region: "USA",
    transfer: "SCC / EU-US Data Privacy Framework",
    dpa: "AVV nach Art. 28 DSGVO (Vercel DPA)",
  },
  {
    name: "PostHog",
    purpose: "Produkt-Analytics (nur nach Einwilligung)",
    region: "EU (eu.i.posthog.com)",
    transfer: "EU-Region — kein Drittlandtransfer",
    dpa: "AVV nach Art. 28 DSGVO (PostHog DPA)",
  },
  {
    name: "Anthropic",
    purpose:
      "Claude Code erzeugt die Nutzungsdaten lokal; TokenMoth sendet keine Transcripts/PII an Anthropic",
    region: "USA (nur clientseitig durch Nutzer:in selbst)",
    transfer: "kein Transfer durch TokenMoth",
    dpa: "keine Auftragsverarbeitung durch TokenMoth",
  },
  {
    name: "Zahlungsdienstleister (Stripe)",
    purpose: "Abwicklung kostenpflichtiger Pläne",
    region: "USA / EU",
    transfer: "SCC / EU-US Data Privacy Framework",
    dpa: "AVV nach Art. 28 DSGVO (Stripe DPA)",
  },
];
