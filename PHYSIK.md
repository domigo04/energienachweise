# Physik & Hydraulik — verbindliche Regeln (Heizungscockpit)

Dieses Dokument sammelt alle physikalischen/hydraulischen Regeln, die **stimmen müssen**.
Es **wächst** mit dem Projekt: bei jedem Physik-Feature hier nachschlagen und Erkenntnisse
ergänzen. Diese Regeln ändern sich nicht — sie sind die Wahrheit, gegen die geprüft wird.

## 1. Volumenstrom
`V' [m³/h] = Q [kW] / (1.163 · ΔT [K])`, mit `ΔT = VL − RL`.
(1.163 = c·ρ Wasser in kWh/(m³·K).) Beispiel: 8.5 kW, 35/30 (ΔT 5 K) → 1.462 m³/h.
_(Tippfehler korrigiert: vorher stand hier «35/28» — mit ΔT 7 K wären es 1.044 m³/h.
Auch der Auftrag v3.0 rundet falsch auf «1.464»; exakt sind 8.5 / 5.815 = 1.4617.)_

## 2. Rücklauf-Zählung im Netz (Bug-Historie)
- Jede Leitung wird beim Aufsummieren nur **einmal** gezählt (beim Entdecken eines neuen
  Knotens). Sonst Doppelzählung (40.585 statt 20.292 direkt nach dem Heizkreis).
- Bei Parallelkreisen trägt **jede Rücklauf-Leitung den Fluss IHRES Kreises**, nicht die Summe.
  Erst am Verteiler-Hauptanschluss (links, zum Erzeuger) wird summiert.
- Robust: jede Rücklauf-Leitung sucht ihren Kreis selbst (Rückwärts-Suche über die blauen
  Leitungen), unabhängig davon, welchen Verteiler-Stutzen man trifft.

## 3. Ventil (2-Weg-Regelventil)
- `kvs_theor = V' / √(Δpvar [bar])`  (Δpvar von kPa → bar = /100).
- kvs-Vorschlag = nächstgrösserer Wert der Norm-Reihe.
- **Druckverlust über Ventil**: `Δpv = (V' / kvs_gewählt)² [bar] → ×100 = kPa`.
- **Ventilautorität**: `Pv = Δpv / (Δpv + Δpvar) · 100 %`. Ideal 30–80 %.

## 4. Verteiler mit Einspritzgruppen — Mischtemperatur (NEU, essenziell)
Jede Verbrauchergruppe ist eine **Einspritzschaltung mit Bypass**. Zwei Seiten mit
unterschiedlichem Durchfluss:
- **Sekundär** (Gruppenseite, über dem Bypass): läuft mit Gruppen-VL/RL/ΔT_sek,
  `ṁ_sek = Q / (1.163 · ΔT_sek)`.
- **Primär** (Verteilerseite, unter dem Bypass): grösseres ΔT → **kleinerer** Massenstrom.

Regeln am Verteiler:
- **VL_Verteiler = höchste VL aller Gruppen** (`max(VL_sek,i)`). Gruppen mit tieferer VL
  mischen über den Bypass herunter (Einspritzung).
- **Primär-Massenstrom je Gruppe**: `ṁ_prim,i = Q_i / (1.163 · (VL_Verteiler − RL_i))`.
- **Primär-Rücklauf je Gruppe = Gruppen-Rücklauf RL_i**.
- **Misch-Rücklauf am Verteiler** (mengengewichtet mit den PRIMÄR-Flüssen):
  `RL_misch = Σ(ṁ_prim,i · RL_i) / Σ(ṁ_prim,i)`.
- **Gesamt-Primärfluss** = `Σ ṁ_prim,i`. **Leistung** `Q_total = Σ Q_i`
  (Energieerhaltung: `Q_total = ṁ_prim_total · 1.163 · (VL_Verteiler − RL_misch)`).
- Der Bypass trägt intern `(ṁ_sek − ṁ_prim)`; für den Verteiler zählen nur `ṁ_prim` und `RL_i`.
- Konsequenz fürs Tool: eine Verbrauchergruppe = **ein Block** (rotes Rechteck) mit
  Q, VL/RL. Das Einspritz-/Bypass-Verhalten wird im Block gerechnet — der Anwender muss
  keine fragilen T-Stücke von Hand verdrahten.

### Beispielrechnung (2 Gruppen) — von Claude gerechnet, von Dominic zu prüfen
| Gruppe | Q [kW] | VL/RL [°C] | ΔT_sek | ṁ_sek [m³/h] | Primär-ΔT | ṁ_prim [m³/h] |
|---|---|---|---|---|---|---|
| 1 FBH | 5 | 35 / 28 | 7 | 0.614 | 40−28 = 12 | **0.358** |
| 2 Lufterhitzer | 10 | 40 / 30 | 10 | 0.860 | 40−30 = 10 | **0.860** |

- `VL_Verteiler = max(35, 40) = 40 °C`
- `ṁ_prim,total = 0.358 + 0.860 = 1.218 m³/h`
- `RL_misch = (0.358·28 + 0.860·30) / 1.218 = 35.83 / 1.218 = 29.4 °C`
- Energie-Kontrolle: `1.218 · 1.163 · (40 − 29.4) = 15.0 kW = Q1 + Q2` ✓

**Ergebnis:** Verteiler VL **40 °C**, RL **29.4 °C**, Primärfluss **1.218 m³/h**, Leistung **15 kW**.
(Merke: Gruppe 2 braucht 40 = VL_Verteiler → keine Einspritzung, Primär = Sekundär.)

## 5. Druckverlust im Netz
- **In Reihe** (Rohr → Ventil → Verbraucher im selben Kreis): Druckverluste **addieren**.
- **Parallel** (mehrere Äste am Verteiler): **nicht** addieren — der **ungünstigste Ast**
  (höchstes Δp) ist massgebend. Die übrigen Kreise werden über Ventile darauf eingeregelt.
- **Pumpenförderhöhe = Δp gemeinsamer Teil + Δp ungünstigster Ast.**
  (Der Verteiler kennt seinen ungünstigsten Ast seit Loop A; die Pumpen-Verknüpfung folgt in Loop C.)

## 6. Schaltungsarten der Verbrauchergruppen (Dominic, 2026-07-04)
Jede Verbrauchergruppe hat genau EINE Schaltungsart:
- **Einspritzschaltung** (Standard): **2-Weg-Ventil**, Bypass mündet **über** dem Ventil
  in die Strangleitung. **Druckbehaftet** — braucht eine **Hauptpumpe** nach dem
  Erzeuger/Speicher (die Hauptpumpe zeichnet Dominic selbst als eigenes Bauteil).
  Gruppenpumpe im Strang: **ja**.
- **Beimischschaltung**: **3-Weg-Ventil**, Bypass mündet **direkt in den dritten
  Anschluss** des Ventils. **Drucklos** primärseitig — **keine Hauptpumpe**.
  Gruppenpumpe im Strang: **ja**.
- **Drosselschaltung**: **nur Ventil** (2-Weg), **keine Gruppenpumpe**, kein Bypass —
  kann **nicht mischen** (Gruppen-VL = Verteiler-VL). Druckbehaftet.

**Mischregeln am selben Verteiler:**
- Einspritz + Drossel **dürfen** gemischt werden (beide druckbehaftet, Hauptpumpe).
- Beimisch **NIE** mit Einspritz/Drossel mischen (drucklos vs. druckbehaftet).
- Mehrere Gruppen derselben Art sind immer zulässig.

Die Mengenbilanz (§4) gilt für Einspritz- **und** Beimischgruppen gleich;
bei Drossel gilt m_prim = m_sek und VL_Gruppe = VL_Verteiler.

## 7. Bauteil-Klassen
- **Auszulegen**: Wärmepumpe, Umwälzpumpe, 2-/3-Weg-Ventil, Expansionsgefäss,
  technischer Speicher (grün), **Wärmezähler** (übernimmt den Durchfluss der Leitung,
  in der er sitzt, + Typ). **BWW-Speicher** (grün, wie Speicher) — Auslegung nach
  SIA 385 ist geplant, aktuell nur Symbol.
- **Nur Symbol + Fabrikat** (nicht ausgelegt): STAD / Strangregulierventil, Temperaturfühler.

## 8. Expansionsgefäss — Methode aus Dominics Excel («Expanion_dominic_goulon.xlsx»)
_Quelle: Dominics eigene Berechnung (OneDrive → Planungshilfe/Berechnungen). Die frühere
EN-12828-Annahme wurde durch diese Methode ersetzt._
- **Ausdehnung e** aus Stufentabelle nach **Mitteltemperatur** und Medium (grösste Stufe ≤ t):
  Heizungswasser: 15°→0.002 · 20°→0.0027 · 25°→0.0033 · 30°→0.004 · 35°→0.00575 · 40°→0.0075 ·
  45°→0.00975 · 50°→0.012 · 55°→0.0145 · 60°→0.017 · 65°→0.02 · 70°→0.023 · 75°→0.026 · 80°→0.029 ·
  85°→0.0325 · 90°→0.036 · 95°→0.0397 · 100°→0.0434 · 105°→0.0477 · 110°→0.052
  (eigene Spalten für Frostschutz 30 %/40 %).
- **Faktor X** (Wasserreserve) aus der Erzeugerleistung: ≤10 kW → **3.0**,
  dann linear fallend (−1.5/140 pro kW) bis 150 kW → **1.5**, darüber konstant 1.5.
- **EWS (Erdsonden):** e = **0.016** und X = **2.5** fix.
- `Vex = Vsys · e` · `Vwr = Vex · (X − 1)` · **`Vex,tot = Vsys·e·X + Vsto·e`**
  (Vsys = Anlageinhalt, Vsto = Speicherinhalt separat; bei EWS nur Vsys·e·X).
- **pfin = pSV / 1.15** (Ventilgenauigkeit) · **p0 = Höhe · 9.81 · 1050 · 10⁻⁵ + 0.3 bar**.
- **`VN,min = Vex,tot · (pfin + 1) / (pfin − p0)`** → nächstgrössere Norm-Grösse
  (8, 12, 18, 25, 35, 50, 80, 100, 140, 200, 250, 300, 400, 500, 600, 800, 1000 l).
- Beispiel aus dem Excel: Vsys 2133.2 l, 35 °C, 91 kW, Höhe 29 m, pSV 4 bar →
  e 0.00575, X 2.132, Vex,tot 26.15 l, p0 3.287, pfin 3.478 → **VN ≈ 613 l**.
- Fehlerfall: `pfin ≤ p0` → Warnung (SV-Ansprechdruck zu klein / Anlage zu hoch).
- **Anschluss unten** am Gefäss (nicht oben) — Bauteil-Zeichnung entsprechend angepasst.

## 9. Anschluss-Marker (Dominic-Feedback 2026-07-04)
Ersetzt eine lang quer durchs Schema gezeichnete Leitung durch zwei kurze Pfeil-Marker
(rot VL raus, blau RL rein, gleicher Buchstabe) — wie im CAD ein Verweis «geht weiter bei A».
- **Echte hydraulische Verbindung**, kein reiner Zeichnungs-Schmuck: zwei Anschluss-Marker mit
  demselben Buchstaben werden vom Backend **virtuell verbunden** (je eine VL- und eine
  RL-farbige virtuelle Kante) — Fluss und Temperatur fliessen genau so durch, als wäre eine
  echte Leitung gezeichnet (`_mit_virtuellen_anschluss_kanten` in `hydraulik.py`).
- Ein Marker ohne Gegenstück (nur 1× derselbe Buchstabe) → Warnung «kein Gegenstück gefunden».
- Mehr als 2 Marker mit demselben Buchstaben → nur die ersten beiden werden verbunden, Warnung.
- Damit lassen sich auch Leitungen zeichnen, die an keinem realen Bauteil-Fangpunkt enden,
  sondern an einem Anschluss-Marker (einem generischen, leichten Fangpunkt).

## 10. Automatische Leitungsdimensionierung (Dominics Rohr-Tabelle)
- Eingabe: Durchfluss der Leitung in m³/h (aus dem Schema) → **× 1000 = kg/h**
  (Dominics Tabelle ist in kg/h).
- Für jede DN-Stufe gibt die Tabelle die Kapazität [kg/h] bei R = 25…75 Pa/m (5er-Schritte).
- **Regel:** kleinste DN wählen, bei der die Kapazität bei **R = 70 Pa/m** (Dominics Maximalwert,
  nie darüber dimensionieren) ≥ tatsächlicher Durchfluss ist.
- Der tatsächliche Pa/m-Wert wird zwischen den beiden nächsten Tabellen-Stufen linear interpoliert.
- Beispiel (Dominic): 700 kg/h → **DN25**, interpoliert **≈ 65 Pa/m** (Tabellenwert bei R=65: 702 kg/h,
  sehr nah an 700).
- Leitung anklicken → Länge [m] eintragen → `Δp = Pa/m · Länge / 1000 [kPa]` (gleiche Formel wie
  bei Pumpe/Gruppe, PHYSIK §5).

## 11. Plattentauscher / Systemtrennung (Dominic-Feedback 2026-07-07)
Der Plattentauscher (PWT) trennt zwei Kreise hydraulisch. **Links = Primär** (kommt von einer
Verbrauchergruppe: oben Eintritt = Gruppen-VL, unten Austritt = Gruppen-RL). **Rechts = Sekundär**
im **Gegenstrom** (unten Eintritt kalt, oben Austritt warm).
- **Leistung Q wird von der Gruppe übernommen** (das PWT sucht über die Primärseite die speisende Gruppe).
- **Sekundär-Temperaturen gibt der Anwender selbst ein** (mind. 1 K Verlust über den Tauscher).
- **Q bleibt gleich** → Sekundär-Massenstrom `ṁ_sek = Q / (1.163 · (VL_sek − RL_sek))`.
  Grösseres ΔT_sek → kleinerer Fluss, kleineres ΔT_sek → grösserer Fluss. Die Sekundär-Leitungen
  tragen ṁ_sek (→ Dimensionierung).
- **Warnung**, wenn Sekundär-VL > Primär-VL — über den Tauscher physikalisch nicht möglich.

## 12. Untergruppe an einer Verbrauchergruppe (Anschluss-Marker, Dominic 2026-07-07)
Eine Verbrauchergruppe kann «Anschluss für separate Gruppe» aktivieren (Buchstabe). Damit hängen
hydraulisch **Hauptgruppe → Untergruppe(n) seriell** aneinander (z.B. Hauptlüftungsgruppe →
mehrere Lufterhitzer-Monoblöcke). Fluss (ṁ_sek) **plus** Leistung Q und VL/RL der Gruppe werden an
den gleichnamigen Anschluss-Marker übertragen; die Leitung ab dem Marker trägt diesen Fluss (→
Dimensionierung), ohne dass eine lange Leitung quer durchs Schema gezeichnet werden muss.

## 13. Medien-Layer und CAD-Topologie (2026-07-20)
- Eine Leitung besitzt optional `data.layer_id`. Unterstützte Standard-Layer sind Heizung,
  Kälte und Sole (je VL/RL), Brauchwarmwasser und Allgemein.
- Die sichtbaren Farben unterscheiden die Medien. Für die Berechnung bleibt die fachliche Rolle
  eindeutig: Ein Layer mit Suffix `_vl` wird wie Vorlauf, `_rl` wie Rücklauf behandelt. Damit
  funktionieren Fluss, Dimensionierung und PDF auch bei Kälte und Sole unverändert korrekt.
- Ausblenden ist ausschliesslich eine Zeichenansicht. Unsichtbare Layer bleiben gespeichert und
  werden weiterhin berechnet.
- Eine optische Leitungskreuzung erzeugt **keine** hydraulische Verbindung. Erst das bewusste
  Ablegen eines Leitungsendes auf der Mitte einer Leitung teilt diese Leitung und erzeugt ein
  echtes T-Stück im Graphen.
- Der produktive Editor verwendet dieselbe CAD-Zeichenlogik wie der React-Flow-Probeeditor:
  Polylinie wählen, frei in der Fläche beginnen, Klick setzt einen Stützpunkt, Enter oder
  Rechtsklick beendet die Leitung. Shift fängt auf 0°, 45° und 90°.
- Rechtsklick auf den Anfangs- oder Endgriff einer bestehenden Leitung bietet
  **«Linie weiterziehen»** an. Die neuen Klickpunkte werden an `data.points` derselben Kante
  angefügt (am Anfang in umgekehrter Reihenfolge); es entstehen keine unabhängigen
  Einzelsegmente. Anschluss- und T-Snap gelten auch beim Weiterziehen.
- `data.cad_polyline=true` kennzeichnet eine bewusst gezeichnete Polylinie; `data.points`
  speichert ihre inneren Stützpunkte. Beides ändert nur die Leitungsführung, nicht die
  hydraulische Verbindung. Der PDF-Export übernimmt dieselbe Polylinie.
- Freie Enden und T-Punkte werden intern als `junction` mit `data.cad_anchor=true` gespeichert.
  Diese Nodes sind reine Topologie-Anker und weder im Editor noch im Export als Bauteile sichtbar.
  Bearbeitet werden sie ausschliesslich über die Endgriffe der Leitung. Nur eine echte
  T-Verbindung erhält einen kleinen Verbindungspunkt.
