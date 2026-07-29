# Luca-Pitch – Readiness 2026-07-29

## Im Produkt vorbereitet

- Produktionsstart ist fail-fast: In Produktion sind PostgreSQL und ein starkes
  Secret Pflicht. Die App führt dort weder `create_all` noch Ad-hoc-DDL oder
  Seeds aus.
- Railway führt `alembic upgrade head` als Pre-Deploy-Schritt aus. Die Migration
  wurde gegen eine leere und gegen eine Kopie der bestehenden SQLite-Datenbank
  geprüft; bestehende Tabellen blieben erhalten.
- Quellen-, Wärmepumpen- und Verbraucherkreis sind hydraulisch getrennt.
  Wärmepumpenkreis, Quellenleistung und Solevolumenstrom werden separat
  berechnet.
- Wärmeerzeuger sind strukturiert auswählbar und werden typabhängig dargestellt.
  Die Luft/Wasser-WP unterstützt Aussen-, Innen- und Splitaufstellung und zeigt
  Aussenluft (AUL) sowie Fortluft (FOL) im Editor und im Vektor-PDF.
- Fachliche Warnungen enthalten Element, Kreis, Ursache, Auswirkung und
  Korrektur. Ein Klick im Editor fokussiert das betroffene Bauteil.
- Der PDF-Export ist vektorbasiert und unabhängig von Zoom, Viewport und Raster.
  A3-Plankopf, Dokumentnummer, Revision, Status, Legende und Rechenwerte kommen
  aus Projekt und aktuellem Graph.
- Die Schaltung **„Luca-Pitch · EWS-Wärmepumpe“** lädt eine vollständige Anlage:
  Erdsonden → Solepumpe → Wärmepumpe → Speicher → Verteiler → zwei Gruppen.
- LV-Import, Prüfschritt, Freigabe als Referenzprojekt, Fingerprint,
  Ähnlichkeitssuche und erklärbare Referenzkosten sind durch Backendtests
  abgedeckt.

## Bekannter Security-Restbefund

`npm audit --omit=dev` meldet weiterhin
`GHSA-qwww-vcr4-c8h2` für React Router. Die Schwachstelle betrifft den
RSC-/Server-Action-Modus; dieses Frontend wird als reine Vite-SPA gebaut und
verwendet weder React Server Components noch Server Actions. Der von npm
angebotene `--force`-Fix würde auf eine ältere, inkompatible Router-Version
zurückstufen. Deshalb bleibt die aktuelle Version vorerst gepinnt und der
Advisory wird bei einem kompatiblen Upstream-Release erneut geprüft.

## Vor dem externen Pitch einmal real ausführen

1. Railway-Variablen `ENVIRONMENT=production`, `DATABASE_URL` und ein starkes
   `SECRET_KEY` setzen.
2. PostgreSQL-Volume/Snapshot prüfen und einen Restore in einer getrennten
   Railway-Umgebung durchführen.
3. Das Demoschema öffnen, speichern, neu laden und als PDF exportieren.
4. Einen anonymisierten LV-PDF-Import bis zur Freigabe als Referenzprojekt
   durchspielen.
5. Zwei Browser-Sitzungen mit unterschiedlichen Firmen verwenden und den
   Mandanten-Durchgriff nochmals manuell verneinen.

Diese fünf Punkte benötigen echte Railway-Zugangsdaten bzw. Pitchdaten und
können nicht allein im lokalen Repository abgeschlossen werden.

## Weitere Punkte aus dem Gesamtplan

Der P0-Pitchpfad ist damit vorbereitet, der gesamte mehrphasige
Entwicklungsplan aber noch nicht abgeschlossen. Insbesondere offen:

- der zweistufige Segmentbefehl `A` (Referenzsegment → Zielsegment);
- frei verschiebbare und sortierbare Legendenkästchen statt der automatisch
  erzeugten Tabellenlegende;
- die vollständige optische Überarbeitung der Symbolbibliothek und das noch
  fehlende Schmutzfänger-Symbol;
- direkte Bild-Uploads und die optionale, geschlossene LLM-Zuordnung beim
  LV-Import;
- die umfassende Plattformstruktur aus Phase 8 und der Security-Sprint aus
  Phase 10.
