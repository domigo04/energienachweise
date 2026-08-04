# Pitchdeck

Route: `/admin/pitchdeck/:slideId` (nur Admin).
Dateien: `frontend/src/pages/admin/PitchDeck.jsx`, `pitchDeckContent.js`,
`PitchDeck.css`, Bildmaterial in `frontend/src/assets/pitchdeck/`.

Das Deck ist ein Verkaufsdokument. Es darf nur behaupten, was in
`docs/PILOT_SCOPE_V1.md`, `docs/PILOT_PLAN.md`, `docs/PITCH_READINESS.md` und
`PHYSIK.md` belegt ist.

## Zwei Varianten

Eine Komponente, zwei Foliensätze aus `PITCH_DECKS`:

| Variante | Route | Publikum |
| --- | --- | --- |
| Kunde (Standard) | `/admin/pitchdeck/:slideId?` | ein bereits ausgewähltes Heizungsplanungsbüro: heute Pilotkunde, nach dem Marktstart Lizenznehmer |
| Investor | `/admin/pitchdeck/investor/:slideId?` | Kapitalgeber, die Anteile kaufen |

Die Investorenvariante trägt oben rechts einen amberfarbenen Hinweis
«Investoren», damit im Termin nie der falsche Satz läuft.

**Die Trennlinie ist inhaltlich, nicht kosmetisch.** Marktgrösse in Lizenzen,
wiederkehrender Jahresumsatz, Entwicklungskosten und Unternehmensbewertung
stehen ausschliesslich in der Investorenvariante. Ein Büro, das eine Lizenz
kauft, will wissen, was es ihm bringt und was es kostet — nicht, wie viele
Lizenzen sich theoretisch verkaufen liessen.

### Kundenvariante (12 Folien)

1. SIREGO – wer dahinter steht, mit Porträt
2. Eine Änderung. Fünf Excel neu. – das Problem
3. Eine Änderung. Das System reagiert. – die Lösung am Beispiel
4. Ein Kreislauf statt einer Dateikette – der Workflow als Diagramm
5. Das Heizungscockpit erklärt
6. Der Weg zum Marktstart – MVP-Timeline
7. Was Sie bekommen – Leistungen im Piloten
8. Der Bedarf verschwindet nicht
9. Was es Ihnen bringt – Nutzen pro Planer
10. Was als Nächstes kommt – Ausbaustufen
11. Pilot und Lizenz – Preise
12. Heizungscockpit näher kennenlernen – Kontakt und QR-Code

Anhang: Funktionsstatus heute, LV und Kostenintelligenz, technische Gates,
Daten und Datenschutz, Berechnungsannahmen. Der Funktionsstatus liegt bewusst
im Anhang: im Hauptteil wird das Zielbild gezeigt, für Rückfragen steht die
ehrliche Abgrenzung bereit.

### Investorenvariante (12 Folien)

SIREGO · Problem · Lösung · Heizungscockpit erklärt · **Marktgrösse** ·
Nutzen beim Kunden · Preismodell · Ausbaustufen · **Entwicklungskosten** ·
**Bewertung** · MVP-Timeline · Kontakt. Anhang zusätzlich mit «Der Bedarf» als
Grundlage der Marktzahlen.

## Kaufmännische Angaben

Alle Zahlen stehen in `pitchDeckContent.js`: `PITCH_ZAHLEN` für die
Kundenvariante, `PITCH_INVESTOR` für die Investorenvariante. Leere Felder
erscheinen im Deck sichtbar als amber gestricheltes «einzutragen» — nichts wird
geschätzt.

Kundenseitig: 25'000 Heizungsplanungs-Workflows pro Jahr (Bandbreite
17'000–35'000), 936'000 noch fossil beheizte Wohngebäude, 15 Projekte pro
Planer und Jahr, 8 Stunden Einsparung je Projekt, CHF 600 interne Einsparung
und CHF 1'120 freigesetzte verrechenbare Kapazität je Projekt, Amortisation
nach rund vier Projekten. Preise: Pilot CHF 7'500 für zwölf Wochen und zwei
reale Projekte; Lizenz pro Nutzer und Jahr CHF 1'680 / 2'640 / 3'600–4'800.

Investorenseitig zusätzlich: 900–1'800 Firmenkunden, 2'800–6'000 Lizenzen
(Basis rund 4'200 Nutzer), CHF 5–20 Mio. wiederkehrender Jahresumsatz (Basis
rund 12 Mio.), CHF 15 Mio. Effizienzpotenzial beim Kunden, Entwicklungskosten
und Bewertung.

**Nicht mit `docs/PILOT_PLAN.md` deckungsgleich:** Der Plan nennt CHF 5'000 für
drei begleitete Monate und eine Core-Lizenz von CHF 4'000–6'000 pro Büro und
Jahr. Das Deck folgt der neueren Vorgabe: CHF 7'500 für zwölf Wochen und ein
Lizenzmodell pro Nutzer. Ob der Pilotplan nachgezogen wird, entscheidet
Dominic.

Die Fusszeile zählt Hauptteil und Anhang getrennt (`pitchPosition`). Anhangfolien
haben in der Punktleiste eckige statt runde Punkte.

## Zahlen der Beispielfolie

Grundlage ist das Pilotschema aus dem Screenshot: Verteiler-VL 50 °C, FBH 30 kW
bei 35/28 °C, Lufterhitzer 15 kW bei 50/40 °C, Σ 45.00 kW, 2.462 m³/h,
Misch-Rücklauf 34.3 °C, Erdsondenfeld 5 × 180 m.

Geändert wird die Verbrauchergruppe «Lufterhitzer» von 15 kW auf 21 kW. Alle
Folienwerte stammen aus dem Backend-Rechenkern und lassen sich so nachrechnen:

```bash
cd backend && python3 -c "
import sys; sys.path.insert(0,'.')
from app.calculations.leitungsdimension import automatische_dimension
CE = 1.163
fbh = 30/(CE*(50-28))
for q in (15.0, 21.0):
    luft = q/(CE*(50-40)); tot = fbh + luft
    print(q, round(luft,4), automatische_dimension(luft),
          round(tot,4), round((fbh*28 + luft*40)/tot, 2))
for q in (45.0, 51.0):
    q0 = q*(1-1/4.5); print(q, round(q0,2), round(q0*1000/45*1.10))
"
```

Ergebnis und Folienwert: Volumenstrom 1.29 → 1.81 m³/h, Rohr DN32 · 50 Pa/m →
DN40 · 44 Pa/m (Grenze 70 Pa/m), Verteiler 45.00 → 51.00 kW, Misch-Rücklauf
34.3 → 35.3 °C, Quellenleistung 35.0 → 39.7 kW (COP 4.5), Bohrmeterbedarf
856 → 970 m bei 900 m gebohrt (qE 45 W/m, Sicherheitsfaktor 1.10) – deshalb die
rote Warnzeile.

COP, Entzugsleistung und Sicherheitsfaktor sind Eingaben und stehen als Annahme
auf der Folie. `PHYSIK.md` §17 verbietet einen versteckten Standardwert für qE.

Die Nutzenhypothese (240–600 h pro Büro und Jahr) ist eine Modellrechnung aus
40 Prinzipschemata pro Jahr; die Bandbreiten und die Umrechnung in CHF stehen
auf der Anhangfolie «Berechnungsannahmen». Sie ist ausdrücklich nicht gemessen.

## Bildmaterial

Alle Ausschnitte sind aus den Screenshots im selben Ordner geschnitten, damit
keine Folie das vollständige Editorfenster zeigt:

| Datei | Quelle | Bildausschnitt (x0 y0 x1 y1) |
| --- | --- | --- |
| `schema-uebersicht.png` | `pilot-schema.png` | 1455 409 3410 1591 |
| `detail-gruppe.png` | `pilot-schema.png` | 2818 500 3364 1460 |
| `detail-verteiler.png` | `pilot-schema.png` | 2600 430 3350 800 |
| `detail-excel.png` | `excel-chaos.png` | 485 35 1660 900 |

`excel-chaos.png` trägt eine eigene, eingebrannte Überschrift links im Bild.
Der Ausschnitt beginnt deshalb rechts davon, sonst stehen zwei Titel übereinander.

`connected-system.png` wird vom Deck nicht mehr verwendet und bleibt nur als
Ausgangsmaterial liegen.

`portrait.jpg` ist das Teamfoto von Dominic aus `domigo04/dominic-goulon`
(`public/assets/images/team-dominic.jpg`). Ein anderes Foto ersetzt einfach die
Datei; steht `PORTRAIT` in `PitchDeck.jsx` auf `null`, zeigt die Folie ein
Monogramm.

## Farbschema

Eine Palette für das ganze Deck, definiert als Variablen am `.pitch-deck`:

| Variable | Wert | Herkunft |
| --- | --- | --- |
| `--pitch-blue` | `#087fe5` | SIREGO-Aktionsfarbe aus `src/index.css` |
| `--pitch-blue-deep` | `#066fc7` | SIREGO-Hover aus `src/index.css` |
| `--pitch-ink` | `#082f49` | `--color-ink` aus `src/index.css` |
| `--pitch-auto` | `#d97706` | Amber aus der Chartpalette |
| `--pitch-ok` | `#15803d` | Grün des Editors für geprüfte Werte |
| `--pitch-warn` | `#dc2626` | Rot des Editors für Warnungen |

Funktionale Bedeutung: Blau ist eine Eingabe, Amber ein automatisch neu
berechneter Wert oder eine offene Stelle, Grün ein geprüfter Stand, Rot eine
Warnung. Die Farben werden nur so verwendet, nicht dekorativ. Abgeleitete Töne
entstehen mit `color-mix`, damit es keine zweite Palette gibt. Alle Folien
haben denselben hellen Hintergrund; dunkle Akzentfolien gibt es bewusst nicht.

## Kontakt und QR-Code

Kontaktdaten stehen ausschliesslich in `PITCH_KONTAKT` in `pitchDeckContent.js`.
Der QR-Code `assets/pitchdeck/kontakt-qr.svg` zeigt auf
`mailto:<mail>?subject=<betreff>` und muss nach einer Änderung neu erzeugt
werden:

```bash
npx qrcode -t svg -e M -d 082f49ff -l 0000 \
  -o frontend/src/assets/pitchdeck/kontakt-qr.svg \
  "mailto:dominic.goulon@sirego.ch?subject=Pilotprojekt%20Heizungscockpit"
```

`-d 082f49ff` ist `--pitch-ink`, `-l 0000` macht den Hintergrund transparent;
die weisse Fläche kommt aus der Folie. Der erzeugte Code hat 37 Module plus
Ruhezone. Nach dem Erzeugen einmal mit dem Telefon scannen.

## Bewegung

Folien blenden in 220 ms ein. Nur die Berechnungskette leuchtet gestaffelt auf,
weil dort eine technische Abhängigkeit erklärt wird. `prefers-reduced-motion`
schaltet beides ab.
