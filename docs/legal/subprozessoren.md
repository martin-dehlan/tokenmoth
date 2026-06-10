# Subprozessoren / Auftragsverarbeiter (#115)

Alle Drittparteien, die im Auftrag von TokenMoth personenbezogene Daten verarbeiten.
Für jede ist ein **AVV/DPA nach Art. 28 DSGVO** abzuschließen und der
**Drittlandtransfer** zu klären (EU-Region, SCC oder EU-US Data Privacy Framework).

> Quelle der Wahrheit für die App: `frontend/lib/legal.ts` (`subprocessors`).
> Diese Tabelle muss synchron gehalten werden — die Datenschutzerklärung rendert
> direkt aus `legal.ts`.

| Dienst | Zweck | Verarbeitete Daten | Region | Transfer-Mechanismus | AVV-Status | Link AVV |
|--------|-------|--------------------|--------|----------------------|------------|----------|
| **Supabase** | Auth & Datenbank | E-Mail, User-ID, Nutzungsdaten | EU/USA — prüfen | EU-Region wählen bzw. SCC/DPF | ☐ offen | TODO |
| **Vercel** | Hosting, Auslieferung, Logs | IP, User-Agent, Request-Logs | USA | SCC / EU-US DPF | ☐ offen | TODO |
| **PostHog** | Produkt-Analytics (Opt-in) | Pseudonyme Events, Geräteinfo | EU (`eu.i.posthog.com`) | EU-Region → kein Drittland | ☐ offen | TODO |
| **Anthropic** | Claude Code (clientseitig) | keine PII durch TokenMoth | USA | nicht durch TokenMoth | ☐ Relevanz prüfen | — |
| **Zahlungsdienstleister** (z. B. Stripe) | Billing | Zahlungs-/Rechnungsdaten | USA/EU | SCC / EU-US DPF | ☐ vor Billing (#117) | TODO |
| **E-Mail-Versand** (Auth-/Transaktionsmails) | Login-/Systemmails | E-Mail-Adresse | TODO | TODO | ☐ Anbieter wählen | TODO |

## To-Do vor Go-Live

- [ ] Supabase-Projekt-Region prüfen (EU bevorzugt) und AVV abschließen
- [ ] Vercel DPA abschließen, Logging/IP-Aufbewahrung klären
- [ ] PostHog AVV abschließen, EU-Cloud bestätigen
- [ ] Anthropic: bestätigen, dass TokenMoth selbst **keine** PII/Transcripts sendet
- [ ] Zahlungsdienstleister auswählen + AVV (gekoppelt an Milestone 6 / #117)
- [ ] E-Mail-Versand-Anbieter festlegen + AVV
- [ ] Alle „TODO“-Links durch echte AVV-Dokumente/URLs ersetzen, Dateien archivieren
- [ ] Tabelle mit `frontend/lib/legal.ts` abgleichen
