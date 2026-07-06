# Heizungscockpit — Projekt-Leitplanken

Engineering-Plattform für Heizungsplanung (Dominic Goulon, SIREGO GmbH, Winterthur).
Kernidee: ein **lebendes Anlagenschema**, das selbst die Datenbank ist — Auslegungen sind
Eigenschaften der Bauteile im Schema, eine Wahrheit. Details im **[Pflichtenheft](Pflichtenheft.md)**.

## Verbindliche Regeln (immer einhalten)
1. **Pflichtenheft ist bindend.** `Pflichtenheft.md` und alles, was Dominic schriftlich
   festlegt, gilt. **Nie stillschweigend abweichen** — Abweichung nur nach Rückfrage.
2. **Vor Umsetzung fragen.** Bei offenen Design-/Umsetzungs-Entscheiden zuerst einen
   Vorschlag machen und Dominic fragen. **Aber:** klare, bereits abgesprochene Inputs
   **zügig umsetzen** — kein Zerreden (Bias to Action).
3. **So schlank wie möglich.** Kein Ballast, keine Features auf Vorrat.
4. **Sprache:** einfaches (Schweizer) Deutsch, «ss» statt «ß». Dominic ist Heizungsplaner,
   kein Programmierer → Technisches immer **ELI5** erklären (wie für ein Kind).
5. **Korrektheit vor allem** bei der Hydraulik — «es muss stimmen». Alle physikalischen
   Regeln stehen verbindlich in **[PHYSIK.md](PHYSIK.md)** (wächst mit — bei jedem Physik-Feature
   dort nachschlagen und neue Erkenntnisse ergänzen).

## Agenten-Team (`.claude/agents/`)
- **hc-coder** — setzt eine *freigegebene* Änderung um; erfindet nie Scope; bei offener Frage stoppt er und fragt.
- **hc-tester** — startet die App, prüft Verhalten (Pass/Fail mit Beweis); testet auf Wegwerf-Projekt, überschreibt nie echte Daten.
- **hc-reviewer** — Review nach **Steelman-Prinzip** auf Bugs + Pflichtenheft-Treue; schlägt zusätzlich **3 ELI5-Varianten** fürs weitere Vorgehen vor (mit Empfehlung + erwartetem Ergebnis).

**Loop:** Dominic sagt was → Umsetzung vorschlagen & fragen → Coder → Tester → Reviewer →
Zusammenfassung → Dominic gibt Fach-Freigabe. Dominic testet auch selbst mit.

## Stack & Start
- **Backend:** FastAPI + SQLAlchemy + SQLite in `backend/app/` (keine Auth, `tenant_id=1`).
  Start: `bash start_backend.sh` (Port 8000). Schema-API: `hc_schema.py` (`hc_schemas`-Tabelle).
- **Frontend:** React 18 + Vite + Tailwind in `frontend/`; Editor mit React Flow
  (`pages/hc/HydraulikEditor.jsx`). Start: `cd frontend && npm run dev` (Port 5173).
- Schema-Daten leben im Backend (Autosave), nicht mehr im Browser. Die lokale
  `energienachweise.db` ist **nicht** in Git. Marketplace/lose Tools wurden entfernt — Repo ist HC-only.
- **Achtung:** Autosave schreibt ins gemeinsame Backend → beim Testen Wegwerf-Projekte nutzen,
  damit echte Schemas nicht überschrieben werden.

## Aktueller Stand
_Loop C + Feinschliff abgeschlossen 2026-07-04 (Auftrag v3.0) — warte auf Fach-Freigabe für Loop D (Projekt-Dashboard)._

### Feinschliff nach Loop C (Dominic-Feedback, zwei Runden am selben Tag)
- **Expansionsgefäss neu nach Dominics eigener Excel-Methode** (`Expanion_dominic_goulon.xlsx`), ersetzt die vorherige EN-12828-Annahme: e-Stufentabelle nach Mitteltemperatur + Medium (Heizungswasser/Frostschutz 30%/40%/EWS), Faktor X aus Erzeugerleistung (≤10 kW→3.0, linear bis 150 kW→1.5), `Vex,tot = Vsys·e·X + Vsto·e`, `pfin = pSV/1.15`, `p0 = Höhe·9.81·1050·10⁻⁵+0.3`, `VN = Vex,tot·(pfin+1)/(pfin−p0)`. Excel-Kontrollrechnung nachgerechnet und als Test hinterlegt (Vsys 2133.2 l, 35°C, 91 kW, 29 m, 4 bar → VN ≈ 613 l). **Form neu (Runde 3, exakte Dominic-SVG-Vorlage):** Kapsel-Körper ohne Füsse, unten rund (zwei Bund-Linien + mittiger Höcker), **Anschluss unten**. Details PHYSIK.md §8.
- **NEU (Runde 3) — Warnungen-Report-Panel:** Knopf «Warnungen» (rotes Zahl-Badge) neben «Legende» — sammelt ALLE Warnungen an einem Ort (`_sammle_warnungen` in `hydraulik.py`, Feld `warnungen` in der API-Antwort): Verteiler-Mischregeln, Anschluss-Marker ohne Gegenstück, Ventilautorität, Expansionsgefäss-Fehler. Drossel-Warnung neu handlungsanweisend formuliert («HK1 (Drossel): kommt mit VL 50°C an, braucht aber nur 45°C — Einspritz- oder Beimischschaltung nötig»).
- **NEU (Runde 3) — Bauteil-Symbole nach Dominics SVG-Vorlagen** (`pumpe_genau.svg`, `2-Wege Ventil.svg`, `Kugelhahn.svg`): Pumpe = Kreis + Durchmesserlinie + Dreieck (Flussrichtung) + Motor mit Lüfter-Symbol rechts (nur Einzelbauteil, im Gruppen-Strang ohne Motor wegen Platz); Absperrventil/Kugelhahn + Regelventil-Dreiecke jetzt **weiss gefüllt mit kleinem Kreis am Treffpunkt** (vorher schwarz gefüllt) — geändert in `symbols.jsx`, `HydraulikNodes.jsx` (Gruppen-Strang) und `schema_svg.py` (PDF), überall konsistent.
- **Wärmezähler in der Verbrauchergruppe** (Checkbox `hat_wz`): SIA-410-Symbol (Quadrat, Diagonale halb schwarz/weiss) erscheint im Strang zwischen Absperrventil und Pumpe, mit je einem VL-/RL-Fühler ausserhalb der Bypass-Schleife. Reine Anzeige (der Strang-Durchfluss war schon vorhanden) — steht auch in Legende/PDF.
- **Neues Bauteil BWW-Speicher** (Node `bww`): wie Speicher, aber grün, eigenes Symbol in Palette + Editor + PDF. Noch **kein** eigener Rechenkern (SIA 385 Warmwasserbedarf) — nächster grosser Schritt, Excel-Vorlagen liegen bereit, noch nicht ausgewertet.
- **Leitungen: nie mehr schräg.** `FlowEdge.jsx` erzwingt orthogonale Führung (nur V-H-V oder H-V-H, exakte Fluchtung = gerade Linie); der Verschiebe-Griff ist jetzt immer leicht sichtbar (nicht erst bei Hover) und rastet beim Ziehen aufs 10-px-Raster ein (ruhigeres Verschieben, kein "Backen" mehr).
- **Ventilauslegung im Gruppen-Modal grösser/prominenter** (Modal-Breite 560→680 px) und Pumpe/Ventil-Tab-Titel zeigen jetzt den Gruppennamen voran (z.B. «HK1 — Einspritzventil»); dieselbe Namens-Vererbung auch in Legende + PDF («HK1 Pumpe 17.8 kPa», «HK1 Ventil kvs 1.6»).
- **NEU (Runde 2) — Anschluss-Marker** (Node `anschluss`, PHYSIK §9): roter Pfeil raus (VL) + blauer Pfeil rein (RL) mit gemeinsamem Buchstaben, ersetzt eine lang quer durchs Schema gezeichnete Leitung. **Echte hydraulische Verbindung** (nicht nur Zeichnung): zwei Marker mit gleichem Buchstaben werden im Backend virtuell verbunden (`_mit_virtuellen_anschluss_kanten`) — Fluss/Temperatur fliessen durch, als wäre eine Leitung gezeichnet. Warnung bei fehlendem/mehrfachem Gegenstück (Panel + PDF-Legende). Nächster freier Buchstabe wird beim Ablegen automatisch vergeben.
- **NEU (Runde 2) — Automatische Leitungsdimensionierung** (`calculations/leitungsdimension.py`, PHYSIK §10): Dominics R-Tabelle (DN10–DN300 × 25–75 Pa/m) — kleinste DN, bei der R ≤ 70 Pa/m (Dominics Maximalwert) bleibt, interpoliert. Erscheint automatisch neben dem Fluss auf jeder Leitung («0.688 m³/h · DN25 · 63 Pa/m»). Leitung anklicken → eigenes Panel mit DN/Pa-m (read-only) + Längenfeld [m] → Δp = Pa/m·Länge/1000 kPa.
- **Standalone-Pumpe/-Ventil** (als Einzelbauteil gezogen) liessen sich bereits über das Bezeichnungs-Feld benennen — nochmals bestätigt, keine Änderung nötig.
- Vier Excel-Referenzen liegen im OneDrive unter `Planungshilfe/Berechnungen/`: `Expanion_dominic_goulon.xlsx` (Formel + Form übernommen), `Druckverlust approximativ.xlsx` (bestätigt unsere Pumpen-Formel: Rohr·Pa-m/1000 + Σ Apparate-Δp; liefert ausserdem die R-Tabelle für die automatische Leitungsdimensionierung), `Kopie von Warmwasser-Berechnung_SIA385.xlsm` + `Speicher_Auslegung.xlsx` (noch nicht ausgewertet — Basis für den BWW-Rechenkern).
- **Wichtig fürs nächste Mal:** Excel-Vorlagen enthalten teils Beispielwerte — beim Eintragen eigener Zahlen ins Tool müssen die alten Excel-Werte NICHT vorher gelöscht werden (das Tool startet ohnehin leer, jedes Feld ist eine neue Eingabe).
- **NOCH OFFEN (Runde 3, zweimal unterbrochen — als Nächstes weitermachen):**
  1. **Expansionsgefäss-Berechnung wie im Excel aufbauen:** editierbare Rohrinhalt-Tabelle (Dimension → l/m aus dem Excel: 12/16→0.113 … DN200→33.8, Länge pro Zeile eintippbar) statt nur einem Vsys-Direktfeld, plus frei definierbare Zusatz-Bauteile (Speicher, Heizkessel, Vorschaltgefäss, WW-Erwärmer, Heizkörper, Plattentauscher, Lufterhitzer, Sonden, Verteiler EWS — Dominic kann eigene hinzufügen), die zusätzlich zum bekannten Vsys-Direktfeld summiert werden. Speicher (Vsto) separat, bereits als eigenes Feld vorhanden. **Zwischenzeitlicher kritischer Bug bereits gefixt (selber Tag):** Panel/Modal hatten noch die ALTEN Feldnamen (`t_max` statt `t_mittel`, kein Medium, keine Leistung) — das Backend rechnete deshalb seit der Excel-Formel-Umstellung nie. Jetzt korrigiert: Medium-Auswahl, Mitteltemperatur, Erzeugerleistung, Speicherinhalt Vsto als Felder vorhanden, Resultat-Anzeige auf neue Feldnamen (e/x/vex_tot_l/p0_bar/pfin_bar) angepasst, im Browser geprüft (500 l/50°C/10kW/10m/3bar → VN 50.8 l → 80 l). **Noch offen:** nur die Rohrinhalt-Tabelle + frei definierbare Zusatz-Bauteile-Liste (aktuell nur ein einzelnes Vsys-Zahlenfeld).
  2. **IMI-Hydronics-Katalog** («Statico_DE-CH_low.pdf», OneDrive → Planungshilfe/Sicherheitseinrichtungen) als Norm-Grössen-Tabelle einlesen: SU (Boden, Füsse) / SD (Wand, Aufhängelasche) je nach Volumen, Typenbezeichnung z.B. «SD 50.3», «SU 140.3» — VN,min → nächstgrössere Katalog-Grösse vorschlagen (nicht mehr die generische Normreihe). Grenze SU/SD: laut PDF ab 80 l meist SU, darunter SD — im Schnellauswahl-Raster (S.6) genauer nachschlagen. Über 12 m Höhe: nur Hinweistext «Kompressor nötig», keine eigene Berechnung.
  3. **Freies Verbinden von Leitungen ohne Fangpunkt** («T-Stück selbst erstellen, indem zwei Leitungen sich in der Mitte verbinden»): Expansionsgefäss soll direkt auf eine bestehende Leitung gesetzt werden können statt fest an ein Bauteil. Noch nicht angefangen — braucht Splice-Erkennung beim Verbinden (Edge in zwei Segmente teilen + Junction einfügen).
- **Login-Pflicht fürs künftige Kostenschätzungs-Tool** (Dominic, 2026-07-04) — auch in Projekt-Memory `project_heizungscockpit.md` notiert: sobald das Tool gebaut wird, zuerst nach Login-Umsetzung fragen statt stillschweigend ohne Auth zu bauen.

### 1. Was funktioniert bereits
- **Projekt-Verwaltung** (`hc_projects.py`, `ProjectList.jsx`, `ProjectDashboard.jsx`): anlegen/bearbeiten/archivieren, SIA-Kategorie + Klimastation, Zwei-Türen-Dashboard ✓.
- **Heizgruppen-Generator** (`hc_groups.py`, `heizgruppen.py`, `HeizgruppenPage.jsx`): Vorlagen, Volumenstrom, Misch-RL, Plausi-Warnungen, Reorder ✓.
- **Schema-Editor** (`HydraulikEditor.jsx`, `HydraulikNodes.jsx`): Canvas, Palette, VL/RL-Leitungen (Tasten V/R), Backend-Autosave, Undo, 1-Klick-Ansicht + Doppelklick-Auslegung ✓.
- **NEU Loop A — Hydraulik rechnet im Backend:** `calculations/hydraulik.py` + `POST /api/v1/hydraulik/berechnen` (`hc_hydraulik.py`). Der Editor schickt den Graphen (debounced 350 ms) und zeigt nur noch Resultate an (`useHydraulicFlows` im Frontend gelöscht) — Goldene Regel «Berechnungslogik NUR Backend» fürs Schema erfüllt.
- **Loop A/B — Verbrauchergruppe = vertikaler CAD-Strang** (Node-Typ `gruppe`, Pflichtenheft §10): Absperrventil → Pumpe (Dreieck zeigt in Flussrichtung nach unten) → Thermometer → rotes Rechteck mit gedrehtem Text (Name, Q, VL/RL, m' in kg/h) → STAD → Mischventil → Absperrventil. Einspritz/Bypass wird **im Block** gerechnet (PHYSIK §4); bei aktiver Einspritzung erscheinen die gestrichelte blaue Bypass-Schleife + oranges M. VL-Anschluss oben, RL unten. Bleibt bewusst EIN Bauteil (Dominic-Entscheid) — Beimischschaltung als Variante ist geparkt, Einspritzung ist der Standard.
- **NEU Loop B-Feedback — Pumpe + Ventil IM Strang auslegbar:** Auslegung wie Einzelbauteile im Doppelklick-Modal mit **Tabs Gruppe / Pumpe / Ventil**: Pumpe im Sekundärkreis (V' = m_sek; Rohr/Pa-m/Apparate → Förderhöhe kPa + mWS), Ventil primärseitig (V' = m_prim; Δpvar → kvs theor./Vorschlag/gewählt + Ventilautorität). Rechnet alles das Backend (`_strang_ausruestung` in `hydraulik.py`, additiv — Flüsse/Temperaturen unverändert); Resultate stehen auch in Legende + PDF.
- **NEU Loop B-Feedback — Schaltungsarten (PHYSIK §6):** Beim Ablegen einer Gruppe fragt ein Menü: **Einspritz** (2WV, Bypass mündet ÜBER dem Ventil, druckbehaftet — Hauptpumpe zeichnet Dominic selbst), **Beimisch** (3WV, Bypass in den dritten Anschluss, drucklos) oder **Drossel** (nur Ventil, NIE eine Gruppenpumpe, kann nicht mischen). Backend warnt: Beimisch nie mit Einspritz/Drossel am selben Verteiler; Drossel-VL muss = Verteiler-VL. Zeichnung je Schaltung in Editor + PDF.
- **NEU Loop B-Feedback — Leitungen packen:** orthogonale CAD-Leitungen (`FlowEdge.jsx`); das Mittelsegment lässt sich am Griff verschieben (`edge.data.mid`, wird gespeichert und gilt im PDF). Wärmeerzeuger neu grösser mit VL-Anschluss oben / RL unten.
- **Loop A/B — Verteiler = volles CAD-Layout:** VL-Balken oben über die ganze Breite, RL-Balken unten, die Stränge hängen dazwischen (Führungslinien helfen beim Platzieren; nur die Balken sind greifbar). Wählbare Abgänge (2–8 im Panel; Leitungen an wegfallenden Stutzen werden entfernt) und **einstellbarer Balken-Abstand** (`data.hoehe`, 460–1200 px, Standard 560). Summen (VL/RL, Σ Q, Σ V') + Δp ungünstigster Ast stehen direkt auf den Balken.
- **NEU Loop B — Nummerierung + Legende:** jedes Bauteil bekommt beim Ablegen eine stabile Nummer (`data.nr`, rotes Badge; ältere Schemas werden beim Laden nachnummeriert). «Legende»-Knopf im Editor zeigt die Tabelle Nr · Bauteil · Bezeichnung · Kennwerte; dieselben Zeilen stehen im PDF.
- **NEU Loop B — PDF-Export** (`export/schema_svg.py`, `export/pdf.py`, `hc_export.py`): `GET /api/v1/schemas/{id}/pdf?inhalt=schema|berechnungen|beides`. Deckblatt (Projektname, Schema, Datum, Planervermerk) immer dabei; Schema als **Vektor-SVG→PDF auf A3 quer** (kein Screenshot, eigener CAD-Renderer im Backend — Geometrie synchron mit `HydraulikNodes.jsx`); Legende-Tabelle; Berechnungen pro Bauteil (Eingaben + Resultat + Einheit, A4). 3 Knöpfe in der Editor-Topbar. Neue Abhängigkeiten: reportlab, svglib (pypdf für Tests).
- **NEU Loop A — BKP-Datenstruktur:** Tabelle `bkp_eintraege` (leer, alle Felder aus Auftrag 4.4, tenant_id) in `models/heizungscockpit.py`; Katalog 36 Positionen in `data/bkp_positionen.py` (kein Öl/Gas/Tank); `GET /api/v1/bkp/positionen?wp_typ=&kategorie=` (`hc_bkp.py`); Zeitgewichtung in `calculations/bkp.py` (Halbwertszeit 3 Jahre).
- **pytest:** 51 Tests grün in `backend/tests/` (PHYSIK-§4-Beispiel, 3 Parallelkreise inkl. Energieerhaltung + Kanten-Flüsse, Δp Reihe/parallel, Volumenstrom, Strang-Pumpe/-Ventil inkl. «Flüsse unverändert»-Kontrolle, Schaltungsarten-Regeln §6, Kontrollrechnung je Einzelbauteil (Hauptpumpe 34.2 kPa, Ventil Pv 47.7 %, WZ, EGF-Beispiele), Anschluss-Marker virtuell verbunden + Warnungen, automatische Leitungsdimensionierung inkl. Δp aus Länge, BKP-Filter + Zeitgewicht, Misch-RL, Plausi, Ventil-kvs/-Autorität, RAVEL 0.1030, SVG-/Legenden-/PDF-Inhalte via pypdf). Ausführen: `cd backend && /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m pytest tests -q`.
- **NEU Loop C — Einzelbauteile ausgelegt (alles Backend, `berechne_schema` Abschnitt 6):**
  - **Ventil (valve2/valve3):** kvs theor./Vorschlag/gewählt + Ventilautorität aus dem Leitungs-Durchfluss (`ventil_results`); Panel/Modal zeigen nur noch Backend-Werte.
  - **Hauptpumpe:** Förderhöhe = **Δp gemeinsamer Teil (Rohr/Pa-m/Apparate) + Δp ungünstigster Ast** des Verteilers, den sie speist (Topologie-Suche über VL-Leitungen, `pumpen_results`). Leitungen zwischen Verteiler-Hauptanschluss und Erzeuger tragen jetzt den Gesamtfluss (Lücke gefixt).
  - **Wärmezähler** (Node `waermezaehler`): übernimmt automatisch den Durchfluss seiner Leitung + Typ/Fabrikat.
  - **Expansionsgefäss** (Node `expansion`, `calculations/expansion.py`): VN nach EN 12828 aus Anlageinhalt/Temp/Höhe/pSV + Norm-Grössen-Vorschlag (`expansion_results`). **Formel in PHYSIK.md §8 — von Dominic zu prüfen!**
- **Schnell-Tools (UC2):** Ventil, Druckverlust, RAVEL ✓.
- **Goldene Regeln:** tenant_id in jedem HC-Modell inkl. `bkp_eintraege` (per SQL über alle Tabellen geprüft) ✓ · alles unter `/api/v1/` ✓ · Schema-Berechnung Backend ✓ · Formel-Tests ✓ · BKP-Tabelle ab Tag 1 ✓.

### 2. Was ist halb fertig
- **Schema ≠ Heizgruppen-DB:** Gruppen-Blöcke im Schema haben eigene Q/VL/RL — Änderungen auf der Heizgruppen-Seite fliessen noch nicht automatisch ins Schema (Kernversprechen F2 noch offen).
- **Manueller Override-Schalter** pro Bauteil fehlt (F1).
- **Projekt-Vorlagen** EFH-WP / MFH-WP-2Gruppen / MFH-WP-3Gruppen fehlen (Abnahme 7.2); es gibt nur die 4 Schaltungs-Vorlagen.
- **PHYSIK.md §8 (Expansionsgefäss, EN 12828)** wartet auf Dominics Fach-Prüfung.

### 3. Was fehlt komplett aus Phase 1 / MVP
- **Projekt-Dashboard als Projektspiegel** (Checklisten pro Anlagentyp, offene Punkte mit Datum, Aktivitäts-Log, rote Warnungen) → **Loop D**.
- **Projekt-Vorlagen** EFH-WP / MFH-WP-2Gruppen / MFH-WP-3Gruppen (Abnahme 7.2) → passt gut zu Loop D.
- **BWW-Speicher-Auslegung nach SIA 385** (Node existiert, rechnet noch nichts) — Excel-Vorlagen liegen bereit (`Kopie von Warmwasser-Berechnung_SIA385.xlsm`, `Speicher_Auslegung.xlsx`), noch nicht ausgewertet.
- **Plattentauscher + reine Verbindungsleitungen** als eigene Bauteile — von Dominic als bekannte Lücke benannt, noch kein Loop zugeteilt.

### 4. Welche eine Lücke blockiert am meisten
Das **Projekt-Dashboard** (Loop D) — nach 2 Wochen Pause fehlt der Projektspiegel: Checklisten, offene Punkte und Warnungen auf einen Blick.

### 5. Strategischer Hinweis von Dominic (2026-07-04)
Sobald das Schema als Phase-1-MVP steht (aktuell schon "sehr gut", ein paar Bauteile/Feinheiten fehlen noch),
verschiebt sich der Fokus bewusst weg vom Schema hin zum **KV-Tool (Kostenvoranschlag)**: reale, bereits
gerechnete Devis nach Gebäudekategorie/m²/WP-Leistung kategorisieren → eigene Wissensdatenbank für
Kostenschätzungen. Das BKP-Fundament (`bkp_eintraege`, Katalog, Zeitgewichtung) aus Loop A ist genau dafür
vorbereitet — das wird der nächste grosse Block nach Loop D, nicht mehr weitere Schema-Feinheiten.

_Hinweise: Zum Ausprobieren liegt das Wegwerf-Projekt «ZZ Wegwerf — Loop-A-Test» mit dem «Loop-B CAD-Testschema» (3 Stränge am Verteiler) bereit — darf gelöscht werden. PHYSIK.md: §1-Beispiel-Tippfehler korrigiert (8.5 kW bei 35/30 → 1.462 m³/h; der Auftrag rundet fälschlich auf 1.464) und Druckverlust-Regeln neu als §5 ergänzt._
