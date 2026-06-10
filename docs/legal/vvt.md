# Verzeichnis von Verarbeitungstätigkeiten (VVT) — Art. 30 DSGVO (#115)

Internes Dokument (nicht öffentlich). Auf Anforderung der Aufsichtsbehörde vorzulegen.
Platzhalter `TODO` vor Go-Live ausfüllen.

## Verantwortlicher

- Name / Anschrift: **TODO** (siehe `frontend/lib/legal.ts`)
- Kontakt Datenschutz: **TODO** (`legal@tokenmoth.com` bestätigen)
- Datenschutzbeauftragter: i. d. R. nicht erforderlich bei Einzelunternehmer — **prüfen**

## Verarbeitungstätigkeiten

### 1. Nutzerkonto & Authentifizierung
- **Zweck:** Registrierung, Login, Kontoverwaltung
- **Betroffene:** registrierte Nutzer:innen
- **Datenkategorien:** E-Mail, User-ID, OAuth-Identität
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b (Vertrag)
- **Empfänger:** Supabase
- **Drittland:** abhängig von Supabase-Region — **TODO**
- **Löschfrist:** mit Kontolöschung; **konkrete Frist TODO**

### 2. Nutzungs-/Telemetriedaten
- **Zweck:** Erfassung & Visualisierung der Claude-Code-Nutzung
- **Betroffene:** registrierte Nutzer:innen
- **Datenkategorien:** Token-Counts, Kosten, Modell, Repo-Namen, Session-Metadaten, Hook-Overhead
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b (Vertrag)
- **Empfänger:** Supabase (DB), Vercel (Hosting)
- **Drittland:** Vercel USA → SCC/DPF
- **Löschfrist:** mit Kontolöschung (Cascade auf `token_logs`)
- **Hinweis Datenminimierung:** prüfen, ob Repo-Namen statt Klartext gehasht/aliasiert werden können

### 3. Server-Logs
- **Zweck:** Betrieb, Sicherheit, Fehleranalyse
- **Datenkategorien:** IP, Zeitstempel, User-Agent
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f (berechtigtes Interesse)
- **Empfänger:** Vercel
- **Löschfrist:** **TODO** (Vercel-Default prüfen)

### 4. Produkt-Analytics
- **Zweck:** Produktverbesserung
- **Datenkategorien:** pseudonyme Events, Geräte-/Browserdaten
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. a (Einwilligung), § 25 TDDDG
- **Empfänger:** PostHog (EU)
- **Löschfrist:** PostHog-Retention — **TODO**

### 5. Zahlungsabwicklung (ab Billing-Launch, #117)
- **Zweck:** Abwicklung kostenpflichtiger Pläne
- **Datenkategorien:** Rechnungs-/Zahlungsdaten
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b (Vertrag) + steuerliche Aufbewahrung
- **Empfänger:** Zahlungsdienstleister
- **Löschfrist:** gesetzliche Aufbewahrungsfristen (i. d. R. 10 Jahre für Rechnungen)

## Technische & organisatorische Maßnahmen (TOM) — Kurzüberblick
- Transportverschlüsselung (TLS)
- Zugriffsschutz über JWT-Auth (Supabase) + API-Keys für Ingestion
- Mandantentrennung über `user_id` mit Cascade-Delete
- **TODO:** Backup-Konzept inkl. Löschkonzept dokumentieren
