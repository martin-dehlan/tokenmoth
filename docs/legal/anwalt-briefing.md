# Anwalts-Briefing & Go-Live-Freigabe (#118)

Briefing für die anwaltliche Prüfung aller Rechtstexte **vor** der Veröffentlichung
von tokenmoth.com. Ziel: schriftliche Freigabe, dann Go-Live ohne Abmahnrisiko.

> **Grundsatz:** Die vorhandenen Texte sind Entwürfe von Entwicklerseite. Nichts
> davon ist final formuliert. Bitte prüfen, korrigieren und freigeben.

## 1. Was ist TokenMoth?

Web-App + CLI, die Token-Verbrauch und geschätzte Kosten von „Claude Code“ pro
Repository erfasst und visualisiert.

- **Datenfluss:** Ein lokal installierter Hook sendet **Kennzahlen** (Token-Counts,
  Kosten, Modell, Repo-Name, Session-Metadaten, Plugin-Overhead) über einen
  API-Key an die TokenMoth-API. **Transcripts/Quellcode werden nicht übertragen.**
- **Auth:** OAuth-Login über Supabase.
- **Analytics:** PostHog (EU), nur nach Einwilligung.
- **Billing:** geplant (Milestone 6), noch nicht live.

## 2. Tech-Stack / Subprozessoren

Siehe [`subprozessoren.md`](./subprozessoren.md) und [`vvt.md`](./vvt.md).
Kurz: Supabase (Auth/DB), Vercel (Hosting), PostHog (Analytics, EU),
Zahlungsdienstleister (später). US-Transfer bei Vercel.

## 3. Zu prüfende Dokumente (Entwürfe im Repo)

| Dokument | Pfad |
|----------|------|
| Impressum | `frontend/app/impressum/page.tsx` |
| Datenschutzerklärung | `frontend/app/datenschutz/page.tsx` |
| AGB | `frontend/app/agb/page.tsx` |
| Widerrufsbelehrung | `frontend/app/widerruf/page.tsx` |
| Stammdaten | `frontend/lib/legal.ts` |

## 4. Konkrete Fragen an die Anwältin / den Anwalt

1. **Rechtsform & Impressum:** Reicht Einzelunternehmer-Angabe? Pflichtangaben vollständig?
2. **Kleinunternehmer (§19 UStG):** korrekt ausgewiesen? USt-Hinweis nötig?
3. **B2C vs. B2B:** Wenn auch an Verbraucher verkauft wird — Widerrufsrecht, Button-Lösung,
   Preisangabenverordnung korrekt umgesetzt?
4. **Drittlandtransfer:** Vercel (USA) — Formulierung zu SCC/EU-US DPF in der
   Datenschutzerklärung ausreichend? Supabase-Region (EU vs. US) erforderlich?
5. **Was ist personenbezogen?** Sind Repo-Namen / Nutzungsdaten kritisch genug, dass
   Datenminimierung (Hashing/Alias) empfohlen wird?
6. **Consent:** Genügt das Opt-in-Banner (§25 TDDDG) für PostHog? Ist die Einordnung
   „Supabase-Auth-Cookies = technisch notwendig“ haltbar?
7. **Anthropic:** Muss Anthropic als Empfänger genannt werden, obwohl TokenMoth selbst
   keine Daten an Anthropic sendet (Claude Code läuft lokal beim Nutzer)?
8. **Haftung/AGB:** Haftungsbeschränkung und Gerichtsstandklausel zulässig?
9. **EU-Streitschlichtung:** Hinweis im Impressum nötig/korrekt?

## 5. Freigabe-Workflow

1. [ ] Anwält:in für IT-/Datenschutzrecht beauftragen
2. [ ] Dieses Briefing + Entwürfe + Datenflüsse übergeben
3. [ ] Feedback in `legal.ts` und die Page-Texte einarbeiten
4. [ ] Platzhalter (`TODO_AUSFÜLLEN`) durch echte Daten ersetzen
5. [ ] Draft-Banner deaktivieren: `LegalShell` mit `draft={false}` rendern, sobald freigegeben
6. [ ] **Schriftliche Freigabe** ablegen
7. [ ] Erst danach Domain öffentlich schalten

## 6. Status der technischen Umsetzung (erledigt)

- ✅ Rechtsseiten + Footer-Links auf jeder Seite
- ✅ Consent-Banner gated PostHog (lädt erst nach Opt-in, Widerruf via Footer)
- ✅ Account-Löschung (`DELETE /v1/me`, Cascade) + Datenexport (CSV/JSON)
- ✅ Subprozessor-Liste zentral in `legal.ts`, gespiegelt in Datenschutz + `subprozessoren.md`
- ✅ Öffentliche Erreichbarkeit der Rechtsseiten ohne Login (Middleware-Allowlist)
- ⏳ Offen: Supabase-Auth-User-Löschung via Admin-API (aktuell nur lokale Daten),
  Inhalte/Platzhalter, anwaltliche Freigabe
