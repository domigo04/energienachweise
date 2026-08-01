# Offene Entscheide

Fragen, die **Dominic** beantworten muss, bevor jemand sie im Code beantwortet.
Nicht raten — Widersprüche zwischen dieser Datei und dem Code sind ein Fehler,
kein Spielraum.

Erledigte Punkte kommen hier raus und in die Commit-Historie, nicht ins Archiv.

---

## 1 · LV-Daten an OpenAI — Datenschutz und Geschäftsgeheimnis

**Stand: offen. Aufgenommen 2026-08-01 aus der Sicherheitsprüfung.**

### Was heute passiert

Zwei Pfade schicken Daten an OpenAI, und sie unterscheiden sich grundlegend:

| Pfad | Was rausgeht | Bewertung |
|---|---|---|
| `llm/base.py` — Kostenzuordnung | Positionsnummer, Titel, BKP-Pfad, Kandidaten. **Keine Beträge, keine Namen, kein PDF.** Steht so im Modulkopf und stimmt. | unbedenklich |
| `llm/visual_review.py` — visuelle Prüfung | **Bis zu acht Originalseiten des Unternehmer-LV als PDF.** Der Systemprompt verlangt ausdrücklich Projektname, Projektnummer, Ort, Unternehmer, Offertdatum. Mit dabei: Briefkopf, Kontaktperson, Telefon, und alle Preise dieser Seiten. | **hier liegt das Problem** |

Der Client läuft heute über den US-Standardendpunkt (`openai.OpenAI()` ohne
`base_url`). `LV_LLM_STORE_RESPONSES` steht auf `false` — Antworten werden also
nicht in der OpenAI-Kontoablage gespeichert.

### Rechtlicher Rahmen (Recherche 2026-08-01, keine Rechtsberatung)

- **revDSG seit 1.9.2023:** geschützt sind nur noch natürliche Personen. Der
  Firmenname eines Unternehmers ist damit kein Personendatum — die Kontaktperson
  im Briefkopf sehr wohl.
- **Swiss-U.S. Data Privacy Framework:** seit 15.8.2024 dürfen Personendaten
  ohne Zusatzgarantien an zertifizierte US-Firmen. **Ob OpenAI aktuell gelistet
  ist, ist noch nicht verifiziert** — auf dataprivacyframework.gov nachschlagen.
- **OpenAI-Zusagen:** API-Daten werden nicht fürs Training verwendet;
  Aufbewahrung bis 30 Tage zur Missbrauchserkennung; DPA mit
  Standardvertragsklauseln vorhanden; Vertragspartei für Schweizer Kunden ist
  OpenAI Ireland Ltd.

### Das grössere Risiko ist nicht das DSG

Preise fremder Unternehmer sind Betriebsgeheimnisse, und die Offerte gehört dem
Unternehmer, nicht uns. **Regel 5 sagt, dass Kosten die Firma nicht verlassen** —
`visual_review.py` verletzt das, unabhängig von Personendaten. Das ist eine
vertragliche Frage. Kundenverträge können die Weitergabe an Dritte verbieten.

### Zu entscheiden

| # | Massnahme | Aufwand | Status |
|---|---|---|---|
| 1 | **DPA mit OpenAI abschliessen** (revDSG Art. 9) | organisatorisch | **Dominic** |
| 2 | **EU-Endpunkt** `eu.api.openai.com`, Region «Europe (EEA + Switzerland)», bündelt Zero Data Retention | Einzeiler im Code, braucht neues OpenAI-Projekt + Freigabe | **entscheiden** |
| 3 | `LV_LLM_STORE_RESPONSES=false` lassen | erledigt | ok |
| 4 | Datenschutzerklärung ergänzen (Art. 19: Bekanntgabe ins Ausland, Empfängerstaat, Zweck) | organisatorisch | **Dominic** |
| 5 | **Visuelle Prüfung pro Firma freischaltbar** statt global — jeder Kunde entscheidet selbst, dokumentiert | mittel | **entscheiden** |
| 6 | **Briefkopf maskieren**, bevor Seiten hochgehen — der obere Seitenrand trägt fast alle Personendaten und wird für die Kostenprüfung nicht gebraucht | mittel | **entscheiden** |

**2, 5 und 6 sind technisch lösbar und warten auf ein Ja.** 1 und 4 kann kein
Code erledigen.

Vor einer Zusicherung gegenüber Kunden sollte eine Schweizer
Datenschutzjuristin draufschauen.

---

## 2 · Firmenbeitritt ohne Einladung

**Stand: offen. Aufgenommen 2026-08-01 aus der Sicherheitsprüfung (Befund M2).**

Wer sich mit `konto_typ="firma"` und dem richtigen Firmennamen registriert,
landet im Mandanten dieser Firma (`hc_auth.py::_firma_fuer_registrierung`) und
wartet nur noch auf die Freischaltung durch den Firmenadmin. Es gibt keine
Einladung und keinen Abgleich der E-Mail-Domain. Wer «Muster AG» errät, steht in
deren Benutzerliste.

Die E-Mail-Verifikation (umgesetzt) schliesst die halbe Lücke: ohne bestätigte
Adresse taucht niemand in der Freischaltliste auf. **Offen bleibt die Frage, ob
der Beitritt überhaupt über den Firmennamen laufen soll** oder nur über einen
Einladungslink des Firmenadmins.

Zu entscheiden: Einladungslink, Domain-Abgleich, oder beim heutigen Verfahren
bleiben und auf die Sorgfalt des Firmenadmins setzen.

---

## 3 · Veralteter Browsertest `geometrie` N2

**Stand: offen, klein.**

`e2e/geometrie.mjs` prüft mit N2, dass eine mit Escape beendete Leitung
*verworfen* wird. Der Editor schliesst sie laut `EDITOR_CAD.md` bewusst am
letzten Punkt ab. Der Test ist veraltet, nicht der Code — aber welches Verhalten
gelten soll, ist eine fachliche Frage.
