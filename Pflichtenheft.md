# Pflichtenheft — Heizungscockpit

> Historischer Stand der ersten Produktphase. Verbindliche aktuelle
> Produktentscheide stehen in `docs/PRODUCT.md`, die Reihenfolge in
> `docs/ROADMAP.md`. Dieses Dokument bleibt nur als fachliche Ursprungsskizze.

_Stand: 2026-06-30 · Auftragsklärung abgeschlossen, vor Bauplan_

## 1. Vision
Das Heizungscockpit ersetzt fragmentierte Excel-Arbeitsmappen durch ein **lebendes Anlagenschema**: Das Schema selbst ist die Datenbank. Jede Auslegung ist eine **Eigenschaft eines Bauteils**, kein separates Dokument. → **Eine Wahrheit, immer auf einem Stand.**

## 2. Architektur — Projekt mit zwei Use Cases
Projekt anlegen (Name + Projektdaten nach SIA 2028) → Gabelung:

- **UC1 «Cockpit / Schema» (es lebt):** Schema zeichnen, Berechnungen als Bauteil-Eigenschaften, automatischer Datenfluss über die gezeichneten Verbindungen. Die Wahrheit des Projekts ist das Schema.
- **UC2 «Schnell-Tools»:** Einzelrechner (die Excels als Web), **nicht verknüpft**, easy/gamified, schneller Export, intelligenter als Excel. Für «muss schnell gehen, nur ein paar Ventile/Pumpen auslegen».

**Gemeinsamer Rechen-Kern:** dieselbe Logik (kvs, Ventilautorität, Volumenstrom, Druckverlust …) speist UC1 (automatisch aus dem Schema) **und** UC2 (manuelle Eingabe). Nicht doppelt bauen. Die heutigen Rechner (Ventil, Druckverlust, RAVEL) sind im Kern bereits UC2.

Mehrere Schemas pro Projekt im Datenmodell vorgesehen; in Phase 1 genügt eines.

## 3. Projekt-Anlage
- Pflicht: Projektname.
- SIA 2028: **Gebäudekategorie** + Klimadaten.
  - **Phase 1:** manuell / einfache (nicht intelligente) Liste.
  - **Phase 2:** Klimastation wählen → Auslegefälle Sommer/Winter automatisch aus SIA-Norm.

## 4. Schema-Editor (UC1)
- Baut auf dem bestehenden **Hydraulik-Editor** auf.
- **Bauteil-Palette** zum Reinziehen auf weisse Leinwand (Vorbild: Revit-Familienbrowser / «Tinline»). Feeling: **AutoCAD × Figma**.
- **Synoptisches Schema** (topologisch, nicht geometrisch exakt): jede Leitung verbindet definiert A↔B, jedes Bauteil sitzt auf einem Knoten → das System kennt Reihe/Parallel zuverlässig → verlässlicher automatischer Datenfluss.
- Leitungen leicht zeichnen, Bauteil **in die Leitung snappen**.
- **Eindeutige Benennung** jedes Bauteils (z. B. «Ventil 1 — Heizkreis 1 FBH», «Ventil 2 — Heizkreis 2 HK»). Wichtig zum Wiederfinden **und** als Fundament für die spätere Stückliste/Kostenschätzung.
- Phase 2: Schemas als Vorlage **speichern / überspeichern**.

## 5. Hydraulik-Kern (muss stimmen)
- **In Reihe** (innerhalb eines Kreises: Rohr → Ventil → Verbraucher): gleicher Massenstrom, **Druckverluste addieren sich**.
- **Parallel** (mehrere Heizkreise am Verteiler):
  - **Leistung** → am Verteiler **summieren**.
  - **Massenstrom** → am Verteiler **summieren**.
  - **Druckverlust** → **nicht** summieren, sondern **ungünstigster Ast** (höchster Δp) ist massgebend; übrige Kreise über Ventile darauf einregeln. Pumpenförderhöhe = gemeinsamer Teil + ungünstigster Ast.
- **Phase 1 lebt nur der Verbraucherkreislauf:** Verteiler → Heizkreis, mit **Parallelschaltung mehrerer Kreise**.
- Volumenstrom: `V' [m³/h] = Q [kW] / (1.163 × ΔT [K])`.

## 6. Bauteile & Berechnungen (Phase 1)

| Bauteil | Eigenschaften / Berechnung Phase 1 |
|---|---|
| **Heizkreis** | Q [kW], VL/RL → ΔT, V' (Quelle der Werte für alles andere) |
| **Ventil (2-/3-Weg)** | kvs, Durchfluss (aus Heizkreis), Ventilautorität inkl. **Vorschlag** & **idealer Autorität** — wie heute |
| **Pumpe** | Förderhöhe / Volumenstrom aus Kreis bzw. Verteiler |
| **Verteiler** | Aggregationsknoten: Σ Leistung, Σ Massenstrom, ungünstigster Δp |
| **Speicher, Rohr VL/RL** | im Schema zeichenbar |
| **Wärmepumpe** | vorerst **«dummes» Bauteil** — nur platzierbar, keine Intelligenz |

- **1 Klick** = Berechnung ansehen. **Doppelklick** = öffnen / rechnen / bearbeiten.

## 7. PDF-Export
- Ein **Häkchen** beim Druck: **Nur Schema** / **Nur Berechnungen** / **Beides**.
- **Keine** Auswahl pro Bauteil.

## 8. Roadmap / geparkt (jetzt vorbereiten, keine Prio)
- **Kosten-Level (UC1, 2. Stufe nach der Auslegung):** Stückliste aller Bauteile mit **Einzelpreis-Eingabe** → **Kostenvoranschlag / Ausschreibung**. _Vorbereiten:_ Datenmodell so, dass jedes Bauteil als benannter Datensatz existiert → Stückliste = weitere Sicht auf dieselbe Wahrheit (Schema → Mengen → Preise).
- **WP-Intelligenz** + **Variantenvergleich** (Luft/Wasser vs. Sole/Wasser) + **RAVEL-Wirtschaftlichkeit** bei Doppelklick.
- **SIA-Klimastationen** intelligent (Auslegefälle automatisch).
- **Siemens / Grundfos API** (Produktdaten/Auswahl) — Phase 2/3.
- Schema-**Vorlagen** speichern / überspeichern.

## 9. Nicht-Ziele Phase 1
- Keine WP-Auslegung / -Intelligenz.
- Keine automatischen Klimadaten.
- Keine Kostenschätzung (nur Datenmodell vorbereiten).
- Keine Hersteller-APIs.
- Primärseite (Erzeuger ↔ Verteiler) ist zeichenbar, «lebt» aber noch nicht.

---

## 10. Synoptik-Ausbau (verschärftes Ziel — Dominic-Feedback + CAD)
Ziel: ein **echtes synoptisches Schema wie im CAD**, mit Intelligenz (nicht nur Optik).
- **Verteiler synoptisch:** breit, **wählbare Anzahl Abgänge**; Hauptanschlüsse links (dort summiert); VL oben / RL unten.
- **Verbrauchergruppe = ein Block (rotes Rechteck)** mit Q, VL/RL, Typ (FBH, Lüftung …). Einspritz/Bypass wird **im Block** gerechnet (keine fragilen T-Stücke von Hand). Speicher bleibt grün.
- **Mischtemperatur am Verteiler:** verbindlich nach **[PHYSIK.md](PHYSIK.md) §4** (VL = höchste Gruppen-VL; Misch-RL mengengewichtet über die Primär-Flüsse).
- **Nummerierung + Legende:** jedes Bauteil eine Nummer + Eigenschaftstabelle unten (Fabrikat, Kvs, Massenstrom …), wie im CAD.
- **Bauteil-Klassen:** *auszulegen* (WP, Pumpe, 2-/3-Weg-Ventil, Expansionsgefäss, Speicher, Wärmezähler [übernimmt Leitungs-Durchfluss + Typ]) vs. *nur Symbol + Fabrikat* (STAD, Temperaturfühler).
- **Editor-UX:** Leitungen greifen & Segmente verschieben (AutoCAD × Figma-Snapping); Bauteil in eine Leitung ziehen → snappt rein. Bauteil-Symbole liefert Dominic als **SVG** → 1:1 einsetzen.
- **Projekt-Start:** zwei grosse Kacheln «Schnellauslegung» / «Schema-Tool».
