# Legal & Compliance — Go-Live-Mappe

Sammelmappe für alles, was vor der öffentlichen Veröffentlichung von **tokenmoth.com**
rechtlich nötig ist. Gehört zu **Milestone 9** und den Issues **#111–#118**.

> ⚠️ **Kein Ersatz für Rechtsberatung.** Alle Texte in dieser Mappe und die
> Rechtsseiten in der App (`/impressum`, `/datenschutz`, `/agb`, `/widerruf`) sind
> **Entwürfe**. Vor Go-Live anwaltlich prüfen lassen → [`anwalt-briefing.md`](./anwalt-briefing.md).

## Inhalt

| Datei | Zweck | Issue |
|-------|-------|-------|
| [`subprozessoren.md`](./subprozessoren.md) | Liste aller Auftragsverarbeiter + AVV-/Transfer-Status | #115 |
| [`vvt.md`](./vvt.md) | Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) | #115 |
| [`anwalt-briefing.md`](./anwalt-briefing.md) | Briefing-Dokument für die anwaltliche Prüfung | #118 |

## Umsetzung im Code

| Bereich | Ort |
|---------|-----|
| Operator-/Subprozessor-Stammdaten | `frontend/lib/legal.ts` |
| Rechtsseiten | `frontend/app/{impressum,datenschutz,agb,widerruf}/page.tsx` |
| Consent-Banner (PostHog-Gating) | `frontend/components/ConsentBanner.tsx`, `lib/consent.ts`, `components/PostHogProvider.tsx` |
| Footer mit Rechts-Links | `frontend/components/Footer.tsx` |
| Account-Löschung / Export | `backend` `DELETE /v1/me`, `frontend/app/api/account/route.ts`, `components/DangerZone.tsx` |
| Öffentliche Rechtsseiten (kein Login) | `frontend/middleware.ts` (Public-Allowlist) |

## Go-Live-Checkliste

- [ ] Platzhalter in `frontend/lib/legal.ts` mit echten Daten füllen (Name, Anschrift, Kontakt, USt/Kleinunternehmer)
- [ ] Kleinunternehmer-Status (§19 UStG) bestätigen → Impressum/AGB anpassen
- [ ] Alle Subprozessor-Regionen + AVV/DPA verifiziert (`subprozessoren.md`)
- [ ] VVT (`vvt.md`) ausgefüllt und aktuell
- [ ] Löschfristen in Datenschutzerklärung konkretisiert
- [ ] Consent-Banner getestet: PostHog lädt **erst** nach „Akzeptieren“, Widerruf funktioniert
- [ ] Account-Löschung End-to-End getestet (inkl. Supabase-Auth-User, siehe Briefing)
- [ ] Datenexport (CSV/JSON) getestet
- [ ] Widerruf/AGB nur aktiv schalten, sobald Billing live (#117 ↔ Milestone 6)
- [ ] **Anwaltliche Freigabe schriftlich erhalten** → Draft-Banner aus `LegalShell` entfernen (`draft={false}`)
- [ ] Erst danach öffentlich schalten
