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
- Der produktive Editor besitzt zwei CAD-Zeichenmodi mit derselben Geometrie: **Leitung** beginnt
  zwingend an einem Bauteil-Fangpunkt und endet nach beliebig vielen Eckpunkten an einem zweiten
  Fangpunkt; **Polylinie** darf zusätzlich frei in der Fläche beginnen und enden. Enter oder
  Rechtsklick beendet die Leitung. Shift fängt auf 0°, 45° und 90°.
- Alle bewusst gesetzten Ecken werden im Editor und PDF mit einem einheitlichen technischen Bogen
  gezeichnet. `data.corner_radius` speichert dessen Radius pro Leitung; die globale
  `drawing_config` speichert Standardradius, Zeichenraster und die frei wählbaren Shortcuts für
  Leitung und Polylinie. Direkte Fangpunkt-Verbindungen ohne eigene Eckpunkte verwenden weiterhin
  die automatische React-Flow-Winkelroute und passen sich beim Verschieben der Bauteile vollständig an.
- Ist **Auto-RL** in der `drawing_config` aktiv, erzeugt eine neu gezeichnete VL-Leitung automatisch
  eine fachlich entgegengesetzt gerichtete Leitung auf dem zugehörigen RL-Layer. Semantische
  Fangpunkte (`vl`/`rl`, Verteilerabgänge, Speicher- und PWT-Paare) werden direkt zugeordnet; für
  nicht eindeutig zuordenbare Anschlüsse entsteht ein sichtbarer Hinweis und ein freier RL-Endgriff.
  VL und RL speichern gegenseitig `data.paired_edge_id`, bleiben danach aber vollständig unabhängige
  Edges: Stützpunkte, Endgriffe, Layer und hydraulische Länge lassen sich separat bearbeiten.
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

## 14. Wärmepumpe — Erzeugerkreis und Quellenkreis (2026-07-26)
Eine Wärmepumpe hat **zwei getrennte hydraulische Seiten**. Beide werden im Backend
gerechnet (`calculations/waermepumpe.py`, Topologie in `hydraulik.py`).

**Anschlusssemantik (nicht die Strichfarbe!)** — vier fachliche Anschlüsse:
`heating_flow`, `heating_return`, `source_flow`, `source_return`. Die alten Handle-IDs
bleiben gültig und werden abgebildet (`vl`→heating_flow, `rl`→heating_return,
`sole-vl`→source_flow, `sole-rl`→source_return). Nur wenn ein Bestandsschema an einem
generischen Anschluss (Anschlusszone, `left`/`right`) hängt, entscheidet ersatzweise der
Medien-Layer; das Resultat weist das als `*_port_quelle: "layer"` aus — es ist eine
Notzuordnung, keine gesicherte.

**Heizseite:** `ΔT = VL − RL`, `V' = Q_heat / (1.163 · ΔT)` (§1).

**Quellenseite:** `Q_source = Q_heat − P_el`. `P_el` kommt aus der expliziten Eingabe
(hat Vorrang) oder aus `P_el = Q_heat / COP`. Fehlen COP **und** P_el, ist die
Quellenleistung **nicht berechenbar** — sie wird nie der Heizleistung gleichgesetzt,
sondern bleibt leer, mit Hinweis. Beispiel: 50 kW, COP 4 → P_el 12.5 kW,
**Q_source 37.5 kW** (nicht 50).

**Sole-Temperaturkonvention:** wie bei Wasser `ΔT = VL − RL` (§13). Sole-VL ist die
wärmere Sole **zur** Wärmepumpe, Sole-RL die kältere **zurück zur Quelle**. Ein
negatives ΔT ist ein Eingabefehler und wird gemeldet, nicht umgedreht.

**Stoffwert Sole:** es gibt bewusst **keine erfundene Glykol-Stoffwerttabelle**. Ohne
Eingabe wird mit der Wasserkonstante 1.163 kWh/(m³·K) gerechnet und das im Resultat
ausgewiesen (`source_ce_quelle: "wasser"`) **plus Warnung**. Der Planer kann `c·ρ`
seines Gemisches bei der Wärmepumpe eintragen (`source_ce_quelle: "eingabe"`).
Keine versteckte Wasserannahme.

**Kreisgrenzen:** Ein **Speicher trennt** Erzeuger- und Verbraucherkreis — beide Seiten
dürfen unterschiedliche Volumenströme führen. Die WP-Traversierung endet an Speicher,
Verteiler, Erdsondenfeld, Verbrauchern und weiteren Erzeugern; die Grenzleitung selbst
gehört noch zum Kreis. Auch die Hauptstrang-Propagierung des Verteilers stoppt am
Speicher. Reihenfolge: Verbraucher-/Verteilerkreise → WP-Erzeugerkreis →
WP-Quellenkreis → freie Topologie. Keine Leitung wird von zwei Kreisen beschrieben.

**Luft/Wasser-Wärmepumpe:** Die Umweltleistung wird aus Heizleistung und COP
beziehungsweise elektrischer Leistung bilanziert, jedoch entsteht kein
hydraulischer Quellenvolumenstrom. Aussenluft (AUL) und Fortluft (FOL) werden
ausschliesslich am Erzeugersymbol dargestellt und bilden keine Kanten des
Wassernetzes.

## 15. Anschlussverhalten der Bauteile (2026-07-26)
`frontend/src/pages/hc/schema/componentRegistry.js` ist die einzige Quelle:
- `free` — frei platzieren, bestehende Leitungen bleiben unberührt.
- `inline` — teilt die Leitung, zwei gegenüberliegende Anschlüsse (Pumpe, Ventile,
  STAD, Absperrung, Rückschlagventil, Wärmezähler).
- `inline_threeway` — 3-Weg-Ventil: die Hauptachse liegt inline, der dritte Anschluss
  bleibt bewusst frei.
- `branch` — Sicherheitsventil und Expansionsgefäss hängen mit **einem** Anschluss an
  der Leitung. Beim Setzen entsteht dort eine **echte Junction**
  (`A → J`, `J → B`, `J → Bauteil`), nicht nur ein optischer Punkt.

Ein Leitungsende, das bewusst auf einer Leitung, auf deren Mitte **oder auf einem
bestehenden Polylinien-Eckpunkt** abgelegt wird, teilt die getroffene Leitung und
erzeugt eine echte Junction. Beide Teilstücke behalten Layer, Medium, DN, Länge
(anteilig) und übrige Metadaten. Existiert an der Zielposition bereits eine Junction,
wird sie wiederverwendet. Eine reine **optische Kreuzung erzeugt weiterhin keine**
Verbindung.

## 16. Technischer Speicher (2026-08-03)
Quelle: `Speicher_Auslegung.xlsx`, Blatt `WP`. Der Auslegungsvorschlag wird im
Backend gerechnet; ein manuell gewählter Speicherinhalt wird nicht still überschrieben.

- Leistung `Q`: manuelle Übersteuerung, sonst Leistung des einen unterstützten
  Erzeugers; fehlt diese, Summe der Verbraucherleistungen. Mehrere/bivalente
  Erzeuger werden bis zur Betriebszustandslogik nicht still addiert.
- Speichertemperatur oben: höchste Verbraucher-VL + Überdeckung (Standard 2 K).
- Speichertemperatur unten: berechneter Misch-Rücklauf des massgebenden Verteilers;
  ohne Verteiler tiefste erfasste Verbraucher-RL. Manuell kontrolliert überschreibbar.
- Überbrückungszeit: Standard 15 min.
- `V [l] = Q [kW] · t [min] · 60 / (c [kJ/kgK] · ΔT [K] · ρ [kg/m³]) · 1000`
- Stoffwerte der Vorlage: `c = 4.187 kJ/(kg·K)`, `ρ = 988 kg/m³`.
- Referenzfall: 29.88 kW, 15 min, ΔT 12 K → rund 650 l.

## 17. Erdsondenfeld – erste Auslegungsstufe (2026-08-03)
Quelle: `Erdsonden.xlsx`, Blätter `glykol_Erdsonden` und
`Druckverlustberechnung_erdsonde`.

- Quellenleistung `Q0`: manuelle Übersteuerung, sonst Energiebilanz der Wärmepumpe
  gemäss §14. Die Heizleistung darf nicht ersatzweise als Quellenleistung gelten.
- Die spezifische Entzugsleistung `qE [W/m]` ist eine sichtbare, standortbezogene
  Eingabe. Es gibt keinen versteckten Standardwert.
- Erforderliche Gesamtbohrmeter:
  `Lerf [m] = Q0 [kW] · 1000 / qE [W/m] · Sicherheitsfaktor`.
- Sicherheitsfaktor: Standard 1.10 aus der Vorlage, sichtbar überschreibbar.
- Duplexsonde: zwei U-Rohre = vier Rohrstränge je Sondenmeter.
- Rohrinhalte der Vorlage: 25 mm → 0.327 l/m, 32 mm → 0.531 l/m,
  40 mm → 0.835 l/m.
- `Vsonde = Anzahl · 4 · Sondenlänge · Rohrinhalt`.
- `mGlykol = (Vsonde + Zusatzinhalt) · Konzentration / 100 · ρGlykol`,
  mit `ρGlykol = 1.14 kg/l` aus der Vorlage.

Die EED-Tabellen der Vorlage gelten nur für deren dokumentierte Standorte und
Randbedingungen (u.a. 1800 Betriebsstunden und ohne BWW). Sie werden deshalb nicht
als allgemeine Bohrtiefenautomatik übernommen. Die Druckverlust-/Pumpenauslegung
folgt erst, wenn Einzellänge, Anschlussleitung und Hauptleitung topologisch eindeutig
definiert sind. Bohrmeter bleiben eine Planungshilfe; geologische und behördliche
Nachweise sind extern zu prüfen.

## 18. Solekreis der Erdsondenanlage – Füllinhalt, Druckverlust, Pumpe (2026-08-04)
Quelle: `Erdsonden.xlsx`, Blatt `Druckverlustberechnung_erdsonde` (Version 1.0 db),
Rohrinhalte aus `glykol_Erdsonden`, Innendurchmesser aus `infoblatt3_Normsonden`.
Umgesetzt in `backend/app/calculations/sole_druckverlust.py`.

Der Kreis wird in drei Teilstücke zerlegt, weil sie unterschiedliche Durchmesser und
damit unterschiedliche Strömungszustände haben: Erdwärmesonde, Zuleitung Sonde bis
Verteiler, Zuleitung Verteiler bis Wärmepumpe.

### Füllinhalt
- `V_Sonde = π/4 · d² · Stränge · Tiefe · Anzahl` — Duplex = 4 Stränge je Sondenmeter,
  Einfach-U = 2.
- Der kritische Weg Sonde–Verteiler ist die einfache Strecke zur entferntesten
  Bohrung; für den Druckverlust gilt `L(VL+RL) = 2 · L(kritisch)`.
- Der Füllinhalt verwendet separat die gesamten tatsächlich installierten
  Anschlussrohrmeter als Summe VL+RL. Fehlen sie, wird die vorläufige Annahme
  `2 · L(kritisch)` sichtbar gewarnt.
- `V_Zuleitung = π/4 · d² · L_gesamt(VL+RL)`.
- `V_total = V_Sonde + V_ZulVerteiler + V_ZulWP + V_WP/Expansion`.
- Der Innendurchmesser ist **keine freie Eingabe**, sondern folgt aus der Rohrauswahl.
  Ein Durchmesser ohne zugehöriges Rohr wäre nicht bestellbar und hätte keine
  Nenndruckstufe. Tabelle in `backend/app/calculations/sole_rohre.py`.

### Wärmeträger
- Vorlagenformel (B25): `V_Glykol = V_total · 1000 / 100 · Konzentration / ρ`.
- Volumetrische Kontrolle: `V_Konz = V_total · Konzentration / 100`.
- Beide Werte werden ausgewiesen. Weichen sie um mehr als 5 % ab, erscheint eine
  Warnung: die Bestellmenge ist fachlich festzulegen. Die Vorlage mischt an dieser
  Stelle Volumen und Masse; der Entscheid gehört zum Fachplaner, nicht ins Tool.
- Der Zuschlag `+2 l` der Vorlage wurde nicht übernommen, weil er nicht hergeleitet
  ist. Er lässt sich über «Inhalt WP + Expansion» sichtbar eingeben.
- Konzentratdichte Antifrogen N: 1.14 kg/l (Blatt `glykol_Erdsonden`).

### Volumenstrom
- Erste Wahl: Fördermenge Verdampfer aus dem Wärmepumpen-Datenblatt; fehlt sie
  am Erdsondenbauteil, wird der berechnete Quellenstrom genau einer verbundenen
  Wärmepumpe übernommen.
- Ersatzweise `V̇ [m³/h] = Q0 [kW] · 3600 / (c [kJ/kgK] · ΔT [K] · ρ [kg/m³])`.
- Fehlt beides, wird gewarnt statt geschätzt.
- Aufteilung: jede Sonde hat `Stränge/2` parallele Kreise; die Sonde und die Zuleitung
  bis zum Verteiler führen `V̇ / Kreise`, die Leitung zur Wärmepumpe den vollen Strom.

### Strömung und Druckverlust je Teilstück
- `w = V̇ / (π/4 · d²)`
- `Re = w · d / ν`
- `dk = d / Rohrrauheit`, Rauheit PE 0.015 mm
- Strömungsart: `Re < 2340` laminar; `Re < 65 · dk` turbulent glatt;
  `Re > 1300 · dk` turbulent rauh; dazwischen Übergangsgebiet.
- `λ`: laminar `64/Re`; turbulent glatt `0.3164/Re^0.25` (Blasius, `Re < 100 000`),
  sonst `0.0032 + 0.221/Re^0.237` (Nikuradse); turbulent rauh
  `1/(2·log₁₀(3.715·dk))²` (Prandtl-Kármán). Im Übergangsgebiet ist `λ` nicht
  definiert; dann wird kein Druckverlust ausgegeben.
- `Δp = λ · (ρ · w²/2) / d · L · Stränge`, mit 2 Strängen je Teilstück
  (Sonde hinunter und hinauf, Zuleitung Vor- und Rücklauf).
- `H [mWs] = Δp [Pa] / (ρ · g)` mit `g = 9.81 m/s²`.

### Pumpenbetriebspunkt
- `H_Verteiler = ζ · (ρ · w²/2) / (ρ · g) · Anzahl`, ζ Vorgabe 12.
- `H = Δp_Leitungen + Δp_Verteiler + Δp_Wärmepumpe`
- Fördervolumen = Solevolumenstrom.
- Die Pumpenauswahl selbst bleibt aussen vor: die Kennlinien der Vorlage gelten für
  bestimmte Fabrikate und würden im Tool veralten. Ausgegeben wird der Betriebspunkt.

### Bewusste Abweichungen von der Vorlage
- Die Vorlage rechnet Querschnitte teils mit 3.14 statt π. Hier gilt durchgehend π;
  die Abweichung liegt unter 0.2 %.
- Die Vorlage wandelt Pascal mit dem festen Wasserfaktor `0.000102` in mWs um.
  Das Backend verwendet die tatsächliche Soledichte über `H = Δp/(ρ·g)`.
- Die Vorlage prüft in den Zuleitungsspalten die Strömungsart versehentlich über `dk`
  statt über `Re` und meldet dort immer «Turbulent glatt», obwohl die Lambda-Formel
  daneben bereits laminar rechnet. Hier wird durchgehend `Re` geprüft.
- Die Konzentration steckt in der Vorlage fest im Glykol-Term (30), während die
  Bezeichnung 28 % nennt. Hier ist die Konzentration eine Eingabe.

### Grenzen
- In der Erdwärmesonde ist mindestens «turbulent glatt» gefordert, sonst stimmt der
  Wärmeübergang zum Erdreich nicht. Laminare Sonden werden gewarnt; in den Zuleitungen
  ist Laminarströmung zulässig.
- Stoffwerte stammen vollständig aus den Zellkommentaren der Vorlage (siehe §19).
  Die spezifische Wärmekapazität steht dort nicht und bleibt ein Richtwert.
- Einzelwiderstände ausser dem Verteiler (Bögen, Armaturen, Sondenfuss) sind nicht
  enthalten und über den Zeta-Wert oder einen Zuschlag zu berücksichtigen.
- Alle Zahlen sind eine Planungshilfe. Die Verantwortung für die Auslegung bleibt beim
  Fachplaner; der Rechenweg ist deshalb im Bauteil und im PDF vollständig ausgewiesen.

## 19. Rohre, Druckstufen und Wärmeträger der Erdsonden (2026-08-04)
Quellen: SIA 384/6:2021 «Erdwärmesonden», wiedergegeben in der FWS-Präsentation
«WP-/EWS-Technik Update 2021» (Dr. Walter J. Eugster), sowie die Zellkommentare
in `Erdsonden.xlsx`. Tabelle in `backend/app/calculations/sole_rohre.py`,
Auswahlliste gespiegelt in `frontend/src/pages/hc/schema/soleTabellen.js`
(Abgleich durch `test_frontend_auswahllisten_bleiben_deckungsgleich`).

### Rohrmasse (SIA 384/6:2021 Tabelle 10)

| Aussen | Innen | Wand | Nenndruck | SDR |
| --- | --- | --- | --- | --- |
| 32 mm | 26.0 mm | 3.0 mm | PN 16 | SDR 11 |
| 32 mm | 24.8 mm | 3.6 mm | PN 20 | SDR 9 |
| 40 mm | 32.6 mm | 3.7 mm | PN 16 | SDR 11 |
| 40 mm | 31.0 mm | 4.5 mm | PN 20 | SDR 9 |
| 40 mm | 29.2 mm | 5.4 mm | PN 25 | SDR 7.4 |
| 50 mm | 40.8 mm | 4.6 mm | PN 16 | SDR 11 |
| 50 mm | 38.8 mm | 5.6 mm | PN 20 | SDR 9 |
| 50 mm | 36.4 mm | 6.9 mm | PN 25 | SDR 7.4 |
| 50 mm | 32.0 mm | 8.9 mm | PN 32 | SDR 5.6 |

Die 32-mm-Zeile für PN 20 steht nicht in Tabelle 10; sie folgt der Rohrreihe
SDR 9 (Wanddicke 32/9 = 3.56 mm, aufgerundet auf 3.6 mm) und damit derselben
Systematik wie die dort aufgeführten Zeilen 40 × 4.5 und 50 × 5.6. Tiefere Sonden
brauchen die höhere Druckstufe auch im 32er-Durchmesser.

Zusätzlich wählbar bleiben die beiden Masse der Excel-Vorlage, damit bestehende
Berechnungen nachvollziehbar bleiben: `PE 32 × 2.9` mit innen 26.2 mm und
`PE 50 × 4.7` mit innen 40.6 mm. **Offener Punkt:** Die Norm nennt für das
32er-Sondenrohr 26.0 mm, die Vorlage rechnet mit 26.2 mm. Die Zellkommentare der
Vorlage widersprechen sich hier selbst (26.20 beim Sondenrohr, 26.00 bei den
Zuleitungen). Fachlicher Entscheid offen; der Unterschied bewegt Re um rund 1 %.

Die Tabelle 10 nennt für das 50er-PN-32-Rohr eine Wanddicke von 7.2 mm, was zum
angegebenen Innendurchmesser von 32 mm nicht passt. Übernommen wird der
Innendurchmesser (massgebend für die Strömung); die Wanddicke folgt SDR 5.6.

### Nenndruckstufe nach Sondentiefe (SIA 384/6:2021, informativ)

| Tiefenbereich | Max. Überdruck am Sondenfuss | Nenndruckstufe |
| --- | --- | --- |
| 0–170 m | 20 bar | PN 16 |
| 171–200 m | 24 bar | PN 20 |
| 201–260 m | 30 bar | PN 25 |
| 261–360 m | 41 bar | PN 32 |

Der Überdruck enthält 3 bar Betriebsdruck. Das gewählte Sondenrohr bringt seine
Nenndruckstufe mit; liegt sie unter der für die Tiefe geforderten, wird gewarnt.
Über 360 m endet die Tabelle — dort ist die Druckstufe fachlich festzulegen.

Zulässige Differenzdrücke je Druckstufe (Tabelle 8) sind in `DRUCKSTUFEN`
hinterlegt: PN 16/SDR 11 bis PN 40/SDR 5, je mit Prüf- und Betriebsgrenzen.

### Wärmeträger (Zellkommentare `Erdsonden.xlsx`)

| Produkt | Anteil | ρ [kg/m³] | ν [mm²/s] | Frostschutz |
| --- | --- | --- | --- | --- |
| Antifrogen L (Propylenglykol) | 21.4 % | 1028 | 5.03 | −8.0 °C |
| Antifrogen L | 25 % | 1033 | 5.98 | −10.1 °C |
| Antifrogen L | 30 % | 1039 | 7.65 | −13.5 °C |
| Antifrogen N (Ethylenglykol) | 20 % | 1040 | 3.49 | −10.4 °C |
| Antifrogen N | 25 % | 1050 | 4.15 | −13.6 °C |
| Ethanol | 10 % | 982 | 2.82 | −4.5 °C |
| Ethanol | 20 % | 969 | 4.29 | −10.5 °C |
| Ethanol | 30 % | 654 | 5.96 | −20.5 °C |

Damit ist geklärt, woher ρ = 1050 kg/m³ und ν = 4.15 mm²/s im Druckverlustblatt
stammen: aus **Antifrogen N 25 %**. Die Zelle `Wärmeträger` beschriftet denselben
Fall als «Et. glykol 28%» — die Beschriftung passt nicht zu den verwendeten
Stoffwerten. Massgebend sind die Stoffwerte.

Die Dichte 654 kg/m³ für Ethanol 30 % steht so in der Vorlage, ist aber für ein
Ethanol-Wasser-Gemisch nicht plausibel (erwartet rund 950 kg/m³). Der Wert bleibt
unverändert hinterlegt, erzeugt bei Auswahl aber eine Warnung.

Die spezifische Wärmekapazität kommt in der Vorlage nicht vor. Sie ist ein
Richtwert, sichtbar überschreibbar und wird nur gebraucht, wenn der Volumenstrom
aus Quellenleistung und Sole-ΔT bestimmt wird statt aus dem WP-Datenblatt.

### Bohrdurchmesser (SIA 384/6:2021, informativ)

| Sondentyp | Hammerbohrung | Spülbohrung |
| --- | --- | --- |
| 32 mm Duplex | 115 mm | 4 ¾ ʺ (121 mm) |
| 40 mm Duplex | 130 mm | 5 ⅜ ʺ (136 mm) |
| 50 mm Duplex | 160 mm | 6 ½ ʺ (165 mm) |

## 20. Verknüpfung Wärmepumpe – Erdsondenfeld – Solepumpe (2026-08-04)
Der Quellenkreis wird nicht mehr an drei Stellen getrennt eingegeben, sondern
folgt einer Kette. Massgebend ist der gezeichnete Quellenkreis der Wärmepumpe
(`_wp_kreis(..., "source", ...)`); was daran hängt, gehört zusammen.

```
Heizleistung + COP            → Quellenleistung Q0 = Q_heiz · (1 − 1/COP)
Q0 + spez. Entzugsleistung    → erforderliche Bohrmeter
Q0 + Sole-ΔT + Wärmeträger    → Solevolumenstrom V'
V' + Rohre + Längen           → Druckverlust je Teilstück → Förderhöhe H
V' + H                        → Betriebspunkt der Solepumpe
```

### Wärmeträger gilt für den ganzen Kreis
Die Sole am Verdampfer und die Sole in den Sonden sind dieselbe Flüssigkeit.
Der am Erdsondenfeld gewählte Wärmeträger bestimmt deshalb auch
`c·ρ` der Wärmepumpe:

`c·ρ [kWh/(m³·K)] = cp [kJ/(kg·K)] · ρ [kg/m³] / 3600`

Für Antifrogen N 25 %: `3.78 · 1050 / 3600 = 1.1025`. Vorher wurde ersatzweise
mit der Wasserkonstante 1.163 gerechnet; der Solevolumenstrom fiel damit rund
5 % zu klein aus und der Druckverlust — er wächst etwa quadratisch mit dem
Volumenstrom — rund 10 % zu klein. Eine Eingabe von `c·ρ` direkt an der
Wärmepumpe hat weiterhin Vorrang. Ist gar kein Sondenfeld angeschlossen, wird
weiterhin sichtbar mit Wasser gerechnet und gewarnt.

### Solepumpe
Eine Pumpe im Quellenkreis ist eine Solepumpe. Ihr Betriebspunkt stammt
vollständig aus dem Erdsondenfeld:

- Fördervolumen = Solevolumenstrom der Wärmepumpe
- Förderhöhe = Δp Leitungen + Δp Verteiler + Δp Verdampfer (aus §18)
- `1 mWs = 9.80665 kPa`

Damit genügen für die Auswahl im Fabrikatskatalog zwei Zahlen. Für Pumpen im
Heizkreis gilt unverändert die Rechnung über gemeinsamen Teil und ungünstigsten
Ast (§5); die Verteilersuche läuft nicht mehr durch den Solekreis hindurch und
ordnet der Solepumpe nicht mehr den Astdruckverlust der Heizseite zu.

Mehrere Sondenfelder am selben Quellenkreis brauchen eine Aufteilung des
Volumenstroms. Sie ist nicht definiert und wird nicht geraten: es erscheint eine
Warnung, und der Betriebspunkt bleibt leer.

## 21. Brauchwarmwasser-Vorrang und Betriebsfälle (2026-08-04)
Ein 3-Weg-Ventil gibt es in zwei Ausführungen. Das **mischende** Ventil regelt
eine Temperatur und wird über kvs und Ventilautorität ausgelegt (§3). Das
**umschaltende** Ventil kennt nur zwei Stellungen; es wird nicht gedrosselt und
bekommt deshalb kein kvs.

Ein Umschaltventil erzeugt deshalb **gar kein** Ventilergebnis — nicht etwa ein
teilweise gefülltes. Jede Anzeige darf sich darauf verlassen, dass ein
vorhandenes Ventilergebnis vollständig ist (kvs und Ventilautorität). Ein halb
gefüllter Eintrag wurde von der Legende als Ventilauslegung gelesen und riss den
Editor mit einer weissen Seite ab, sobald ein Ventil auf «umschaltend» gestellt
wurde. Zwei Tests halten das fest.

Sitzt ein Umschaltventil im Kreis zwischen Wärmepumpe und technischem Speicher,
läuft die Anlage entweder im Brauchwarmwasser- oder im Heizbetrieb — nie in
beiden zugleich. Daraus folgt die zentrale Regel:

> **Heizlast und BWW-Ladeleistung werden nie addiert.**

Die Funktion ist eine sichtbare Eingabe am Ventil (`funktion`), keine Erkennung
aus der Topologie. Ohne Angabe bleibt es ein Mischventil; bestehende Schemas
ändern sich dadurch nicht.

### Die beiden Betriebsfälle
Beide werden vollständig und getrennt gerechnet, weil sich mehr ändert als nur
die Leistung:

| | Heizbetrieb | BWW-Vorrang |
| --- | --- | --- |
| Leistung | Nennleistung der Wärmepumpe | Ladeleistung des BWW-Speichers |
| Vorlauf/Rücklauf | `vl_temp` / `rl_temp` | `bww_vl_temp` / `bww_rl_temp` |
| COP | `cop` | `bww_cop` bei BWW-Temperatur |

Der COP im Heizbetrieb gilt bei BWW-Temperatur nicht — bei 55 °C statt 35 °C
Vorlauf fällt er deutlich ab. Fehlt `bww_cop`, wird das benannt statt geschätzt.

Je Fall folgen daraus elektrische Leistung, Quellenleistung
`Q0 = Q · (1 − 1/COP)` und der Solevolumenstrom (§20).

### Massgebender Fall
Für die Quellenseite — Erdsonden, Solekreis, Solepumpe — gilt der Fall mit der
**grösseren Quellenleistung**. Der andere bleibt sichtbar, damit der Fachplaner
beide Zustände beurteilt. Beispiel: 40 kW Heizen bei COP 4 ergibt 30 kW Quelle,
30 kW BWW bei COP 2.6 ergibt 18.5 kW — massgebend ist der Heizbetrieb, und die
Summe von 48.5 kW wäre fachlich falsch. Genau das nennt die Warnung.

### Noch offen
Die Bemessung des Brauchwarmwassers selbst — Speichervolumen und Ladeleistung
aus Personen, Bezugseinheit und Ladezyklen nach SIA 385/2 — ist hier bewusst
nicht enthalten. Die Ladeleistung ist vorerst eine Eingabe am BWW-Speicher.
Grundlage für den nächsten Schritt ist `Warmwasser-Berechnung_SIA385.xlsm`.

## 22. Brauchwarmwasser nach SIA 385/2 (2026-08-04)
Quelle: korrigierte `Warmwasser-Berechnung_SIA385.xlsm`, Blätter
`Belegungsdaten`, `Speichervolumen`, `Summenliniendiagramm`, `Ladefunktion`
und die zugehörigen Wertetabellen. Umgesetzt in
`backend/app/calculations/bww_sia385.py`.

### Rechengang
- Personen je Wohneinheit aus der Nutzfläche:
  `np,i = 3.3 − 2 / (1 + (A_NF/100)³)`, aufsummiert. Alternativ direkt eingeben.
- `V_W,d,1 = np · V_W,u · f_Warmhaltesystem`
- `V_W,sto,ctrl = V_W,d,1 / n_z`
- `V_W,sto,pk = np · V_W,u,pk · f_pk`
- `V_W,sto,cont = V_W,sto,ctrl + V_W,sto,pk`
- `V_W,sto,1 = V_W,sto,cont · f_sto`
- `Q_A = MROUND( V_sto · cp · ΔΘ / (n_z · t_z · 3600 · η), 0.5 )` mit
  `cp = 4.187 kJ/(kg·K)`

Bezugseinheiten Wohnungsbau in l/(d·P), Durchschnitt/Spitze: EFH 40/50, 45/60,
55/70 je nach Standard; Eigentumswohnung gleich; MFH allgemein 35/45, MFH
gehoben 45/60. Warmhaltesystem: Zirkulation 1.5, Warmhalteband 1.35.
Speicherkonfiguration: innenliegender Wärmetauscher 1.25, aussenliegender 1.1.
Der Spitzendeckungsfaktor ist eine Stufentabelle über die Personenzahl
(1 P → 1.5 bis ab 301 P → 0.15); zwischen den Stufen gilt der zuletzt erreichte
Wert, wie beim VLOOKUP mit WAHR in der Vorlage.

Referenzfall der korrigierten Vorlage (eine Wohnung mit 200 m², 3.0778 P,
EFH gehobener Standard, Warmhalteband, aussenliegender Wärmetauscher,
2 Zyklen à 2 h): 228.525 l/d, Steuervolumen 114.263 l,
Spitzendeckungsvolumen 144.348 l, Bereitschaftsvolumen 258.610 l,
Speichervolumen 284.471 l und Anschlussleistung 4.5 kW — exakt getroffen.

Die Stundenprofile Montag–Freitag und Samstag/Sonntag aus der Vorlage werden
als 24 Prozentanteile gespeichert und im Backend mit dem berechneten
Speichervolumen skaliert. Angezeigt werden Stundenvolumen, Summenlinie und für
Montag–Freitag zusätzlich die Ladefunktion mit 10 % Reserve. Damit reagieren
alle drei Diagramme auf dieselben Backendwerte wie die Resultate und der
Rechenweg.

### Anbindung
Die Anschlussleistung wird zur Leistung im BWW-Betriebsfall der Wärmepumpe
(§21). Eine manuelle Ladeleistung am Speicher hat Vorrang. Mehrere
BWW-Speicher werden nicht addiert, solange ihr Zusammenspiel nicht modelliert
ist.

Die Belegungsdaten werden im Schema als benannte Wohnungszeilen gespeichert:
Bezeichnung, Nutzfläche und daraus berechnete Personenzahl. Alte Schemas mit
einer reinen Liste von Nutzflächen bleiben lesbar und werden im Dialog als
`Wohnung 1`, `Wohnung 2` usw. dargestellt.

Als transparente Auslegungshilfe empfiehlt das Backend bei einer berechneten
Anschlussleistung von mehr als 10 kW ein aussenliegendes Register. Bis und mit
10 kW wird ein innenliegendes Register vorgeschlagen. Die Grenze ist eine
Planungsvorgabe, keine SIA-Formel: Die gewählte Registerart wird deshalb nie
stillschweigend geändert. Weicht die Wahl vom Vorschlag ab, bleibt sie erhalten
und wird mit einem Hinweis ausgegeben. Ein aussenliegendes Register erscheint
im Schema als Plattenwärmetauscher neben dem BWW-Speicher; dieser Hinweis
erzeugt bewusst keinen zusätzlichen hydraulischen Rechenknoten.

Bei genau einer Wärmepumpe vergleicht das Backend die erforderliche
Anschlussleistung mit deren `bww_leistung_kw`; fehlt dieser Betriebspunkt,
wird sichtbar die Nennleistung `leistung_kw` verwendet. Reicht die Leistung
nicht, werden keine Eingaben automatisch verändert. Angezeigt werden stattdessen
die minimale Ladezeit und — gemäss derselben Excel-Formel — die nächste
ausreichende ganzzahlige Zahl Ladezyklen samt neuem Speichervorschlag. Bei
mehreren Wärmepumpen wird ohne eindeutige Zuordnung kein Vergleich geraten.

Nicht übernommen ist vorerst das Blatt `Wärmebedarf` (Speicher- und
Zirkulationsverluste, Hilfsenergie). Es beschreibt den Energiebedarf, nicht die
Dimensionierung, und gehört zum Energienachweis.
