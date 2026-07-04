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

## 6. Bauteil-Klassen
- **Auszulegen**: Wärmepumpe, Umwälzpumpe, 2-/3-Weg-Ventil, Expansionsgefäss,
  technischer Speicher (grün), **Wärmezähler** (übernimmt den Durchfluss der Leitung,
  in der er sitzt, + Typ).
- **Nur Symbol + Fabrikat** (nicht ausgelegt): STAD / Strangregulierventil, Temperaturfühler.
