# Roadmap

Diese Reihenfolge folgt Dominics neuer Prioritätenliste. Der Fokus hat sich
bewusst verschoben:

> Erst echte historische LVs zuverlässig lesbar machen. Danach den Editor
> perfektionieren.

Sie ersetzt die frühere Reihenfolge (Editor/Produktionsgrundlage zuerst). Die
alten P0-Punkte zur Produktionshärtung sind nicht gestrichen, sondern nach P6
gewandert. `[x]` = im Code vorhanden und durch Test/Build abgesichert;
`[~]` = teilweise; `[ ]` = offen.

## P0 – Muss zuerst funktionieren

### 1 OCR für gescannte LVs

- [x] automatische Erkennung: Textebene vorhanden oder Scan
      (`pdf_extract.ist_durchsuchbar`)
- [x] bei Scan automatisch OCR (`pdf_extract.extract_best` → deutscher
      `ocr_pages`-Fallback, `lang="deu"`)
- [x] Seitenbezug erhalten (OCR liefert Seiten wie der Digitaltext; Herkunft
      bleibt an Wert und Kostenposition)
- [x] OCR-Ergebnis speichern: Methode (`digital`/`ocr`/`image`) als
      `LvImport.extract_method`, erkannte Werte samt Fundstelle bleiben erhalten,
      Original-PDF ohnehin unveränderbar gespeichert
- [x] im Review anzeigen, ob Wert aus Digitaltext oder OCR kommt (Marker
      «Digital»/«OCR» an jeder Fundstelle, Hinweisbanner bei OCR/Bild-PDF)
- [ ] deutsche OCR auf Railway sauber installieren — Abhängigkeiten deklariert
      (`requirements.txt`: `pytesseract`, `pdf2image`; `backend/nixpacks.toml`:
      `tesseract-ocr`, `tesseract-ocr-deu`, `poppler-utils`). Fehlt eine
      Abhängigkeit, bleibt der Import ein Bild-PDF (kein Absturz). **Deploy muss
      noch verifiziert werden** (Testscan hochladen → Methode `ocr`).

### 2 LV-Positionsblock-Parser

- [x] echte Positionen statt Einzelzeilen (`lv_import/positions.py`):
      Positionsnummer, Beschreibung, Menge, Einheit, EP/Total je Block; BKP-Gruppe
      aggregiert. Reine Mengen-/Betragszeilen eröffnen keine Position.

### 3 Technische Mengen zuverlässig erkennen

- [x] Rohrmeter, Pumpen, 2-Weg-, 3-Weg-Ventile, Wärmezähler, Speicher,
      Wärmeerzeuger (+ Leistung/Typ), Erdsonden (+ Bohrmeter)
      (`feature_extract.py` + Bauteilmengen aus Positionsblöcken)
- [ ] STAD / Abgleichventile als eigene Familie erkennen (fehlt in
      `synonyms.FEATURE_TERMS`)
- [ ] Heizkörper zählen (fehlt als Feature-Familie; `anzahl_heizkoerper` existiert
      erst als RefProjekt-Spalte)
- Nächster Schritt nach OCR: die zwei offenen Familien ergänzen (Synonyme +
      Feature-Key + ProjectContext-Mapping + Test).

### 4 LV-Review fachlich sauber (vier Schritte)

- [x] 1 Projektinformationen · 2 Technische Mengen · 3 Kosten · 4 Prüfen &
      Freigeben (`LvImportPage.jsx`, Stepper)

## P1 – Datenqualität

### 5 Zentrale Auswahllisten

- [~] zentrale Registry und gemeinsame Codes sind in LV-Review,
      Referenzprojekten und Grobkostenschätzung aktiv; die Projektinfo-Seite
      muss noch vollständig auf dieselben Listen umgestellt werden

### 6 Wärmeerzeuger als Multi-Select

- [~] mehrere gleichzeitig in LV-Review, Referenzprojekt und
      Grobkostenschätzung; Projektinfo und ProjectContext-Abgleich noch offen

### 7 Wärmeabgabe als Multi-Select

- [~] mehrere gleichzeitig in Referenzprojekt und Grobkostenschätzung;
      Projektinfo und Schema-/ProjectContext-Abgleich noch offen

### 8 Projektinfos auf dieselben Selects umstellen

- [ ] insbesondere Zertifizierung nicht mehr als Freitext

## P2 – Kostenimport sicher machen

### 9 Kostenpositionen manuell hinzufügen/löschen

- [x] «+ BKP-Position» und Löschen funktionieren immer
      (`add_cost`/`delete_cost`, `NeueKostZeile`)

### 10 Kosten explizit bestätigen

- [x] nur bestätigte Kosten fliessen in die Referenz (`confirmed`, effektiver
      Betrag)

### 11 Freigabe komplett absichern

- [x] Freigabe erst bei geprüften technischen Merkmalen **und** bestätigten
      verwendeten Kosten (`approve_lv` blockiert sonst mit 422)
- [~] Projektangaben: Grunddaten fliessen ein, sind aber optional (kein Pflicht-
      Gate) — bewusst, bis P1 die Selects liefert

## P3 – Schemaeditor auf echten CAD-Workflow

### 12 Orthogonales Mitziehen beim Verschieben

- [x] angrenzender Eckpunkt wandert mit, Anschluss bleibt 90°
      (`orthogonalerSegmentfang`, `mitgezogeneWaypoints`)

### 13 Feines mm-Raster

- [~] Raster/Fang existiert (`GRID_OPTIONEN = [2,5,10,20,25,50]` mm), aber noch
      nicht wie gefordert: 1 mm als Standard, 1/2/5/10 mm, Pfeiltaste 1 mm,
      Shift+Pfeil 10 mm, sichtbares Raster getrennt vom Fangraster

### 14 Kleinere Fangtoleranzen

- [~] mm-Fang eingeführt; «nicht mehr so aggressives Anspringen» noch feinjustieren

### 15 Dauerhafter Leitungsmodus

- [x] `L` → zeichnen, zeichnen, zeichnen → `Esc` (bleibt nach Abschluss aktiv)

### 16 CAD-/Revit-Optik weiter härten

- [~] Zonen-Handles/kleinere Grips vorhanden; offen: Handles nur bei Bedarf,
      Bogenradius standardmässig 0, weniger React-Flow-Look

## P4 – PDF-Unterlage

### 17 PDF-/Bild-Underlay

- [x] Hochladen → Seite wählen → halbtransparent → skalieren → verschieben →
      sperren → abzeichnen (`schema/underlay`, `hc_schemas.underlay_json`)

## P5 – Kostenlogik verbessern

### 18 Neue gegen alte Schätzmethode backtesten

- [ ] alte Schätzung vs. neue BKP-Ähnlichkeit vs. reale Projektkosten
      (Leave-one-out), nicht sofort umschalten

### 19 Skalierung pro BKP-Position verbessern

- [~] BKP-Ähnlichkeit auf kanonischer Feature-Ebene vorhanden; feinere Skalierung
      je Position (WP→kW, Erdsonden→Bohrmeter, Rohr→Rohrmeter, Speicher→Liter,
      Wärmezähler→Stück) noch offen

## P6 – Produktionshärtung

### 20 Datenbank absichern

- [x] Alembic-Migrationen wiederherstellen
- [x] Startup-Migrationen (`_ensure_columns`/`_ensure_indexes`) und `DROP TABLE`
      aus der App entfernen
- [ ] PostgreSQL-Persistenz auf Railway verifizieren
- [ ] Backup und Restore-Test
  - [x] leere sowie bestehende lokale Datenbank verlustfrei migrieren
  - [ ] Railway-Volume-Snapshot erstellen und Restore separat prüfen
- [x] CI für Backendtests und Frontend-Build
- [x] Projektzugriff firmenweit, Rollen Plattform-/Firmenadmin/Mitglied,
      Antrag+Bestätigung protokolliert, direkte Routen firmenbegrenzt (aus der
      alten P0-Grundlage bereits erledigt)

## P7 – Markteintritt und Google-Sichtbarkeit

Dieser Meilenstein startet bewusst erst, wenn beide Voraussetzungen erfüllt sind:

- [ ] der Proof of Concept erfüllt die Pilot-Erfolgskriterien;
- [ ] Produktname und passende öffentliche Domain sind festgelegt.

Erst danach:

- [ ] öffentliche, indexierbare Produktseite mit klarem Nutzenversprechen
      erstellen
- [ ] Seitenstruktur und Inhalte an reale Suchintentionen der Schweizer
      Heizungsplanung ausrichten
- [ ] technische SEO-Grundlage umsetzen: Seitentitel, Beschreibungen,
      Canonicals, Sitemap, `robots.txt`, strukturierte Daten und Social Previews
- [ ] Domain in Google Search Console anbinden und Indexierung überwachen
- [ ] Fachinhalte und belastbare Anwendungsfälle aus dem validierten PoC
      veröffentlichen
- [ ] Erfolg über qualifizierte Demoanfragen und Pilotkunden messen

Die Fachanwendung bleibt geschützt und wird nicht indexiert. Vor dem
Domainentscheid werden keine SEO-Landingpages oder Kampagnen gebaut.

## Reihenfolge für die Umsetzung

1. OCR → 2. Positionsblock-Parser → 3. Rohrmeter + Bauteilmengen (STAD/Heizkörper
offen) → 4. LV-Review → 5. zentrale Selects / Multi-Selects → 6. Kosten-Review +
Freigabe → 7. Editor-CAD-Hardening → 8. PDF-Underlay → 9. Backtesting →
10. Produktionshärtung.

Editoränderungen (P3) immer zusätzlich im vollständigen Ablauf prüfen
(CLAUDE.md → «Prüfen»): platzieren, drehen, verschieben, löschen, Leitung
zeichnen, berechnen, speichern, neu laden, PDF vergleichen.

## Später

- Herstellerdaten und Produktauswahl
- automatische Stückliste und vertiefte Kostenableitung aus dem Schema
- Echtzeit-Kollaboration
- KI-Befehle
- weitere Gewerke

## Erfolgsmessung

Ein Pilot ist erfolgreich, wenn ein Planer:

- ein echtes Schema schneller als mit CAD und Excel fertigstellt;
- Berechnungen fachlich nachvollziehen kann;
- einen geprüften Stand exportiert;
- das Projekt später identisch wieder öffnet;
- beim nächsten Projekt freiwillig wieder das Heizungscockpit verwendet.
</content>
</invoke>
