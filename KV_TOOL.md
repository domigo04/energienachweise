# KV-Tool & Website-Struktur — Plan

_Stand 2026-07-07, weiter am 2026-07-08. Dominic ergänzt «Nächste Schritte» selbst;
hier stehen die geklärte Architektur, der KV-Ansatz und meine offenen Fragen._

## Architektur (von Dominic geklärt)
- **Kostenschätzung** = Werkzeug **innerhalb eines Projekts** (pro Projekt eine Schätzung,
  zieht Projekt-Bezug wie Gebäudetyp/Leistung).
- **Auswertung** (Referenzprojekte erfassen → Wissensdatenbank) = **eigenständig,
  projektunabhängig** (eigener Top-Level-Bereich, nicht in einem Projekt).
- Login-Modell: **Firma = Mandant**; **Auswertungs-Daten firmenweit**, **Projekte pro User**;
  Dominic = Admin.

## Phasen (Reihenfolge)
1. ✅ **Login-Gate** (Frontend; Admin `dominicgoulon@icloud.com` / `Sirego2004!`).
2. **Backend-Fundament:** echtes Login (Registrierung → Admin-Freischaltung, Passwort-Hash,
   Token), Firmen-/User-Trennung, **Persistenz** — saubere Migrationen, damit erfasste
   Daten Pushes/Updates **überleben** (bevor echte Dreiplan-Daten reinkommen).
3. **KV-Tool:**
   - **Auswertung** (standalone): Referenzprojekte erfassen (BKP/LV-Kosten + Bezugsgrössen),
     editierbarer BKP-Katalog + Preise, firmenweit gespeichert.
   - **Kostenschätzung** (im Projekt): Eingaben → ähnlichkeitsgewichtete Referenzen →
     Kennwert je BKP/LV → Bandbreite + Vertrauen + Boxplots/Balken.
4. **Redesign** der ganzen Shell (Navigation, klare Farben, aufgeräumte Projekt-Übersicht,
   intuitiv/professionell).

## KV-Logik (aus Dominics Entwurf übernommen)
- **Kennwert je BKP/LV nach eigenem Treiber:** CHF/kW (Erzeugung), CHF/m² EBF
  (Verteilung/Isolation), CHF/Bohrmeter (Sonden), CHF/Einheit (Heizkörper) …
- **Ähnlichkeit:** Projektart · Gebäudetyp · Ausbauumfang · Erzeuger · Abgabe ·
  Zertifizierung + Verhältnis-Ähnlichkeit der Bezugsgrössen; **Alters-Gewichtung**
  (Baupreisindex-Idee); Qualitäts-Gewicht je Referenz.
- **Ausgabe:** Bandbreite tief/hoch · Vertrauen (n_eff + Streuung) · Boxplots
  (P25–P75, Median, gewichteter Kennwert) · Balken je BKP/LV · ähnlichste Referenzen.

### Geändert gegenüber dem Entwurf (Dominic)
- **Keine** Bezugsgrössen «Anzahl Heizgruppen» und «FBH-Fläche».
- **Wärmeerzeugung** und **Wärmeabgabe** als **Mehrfach-Häkchen** (mehrere Systeme wählbar),
  nicht als Einzel-Dropdown.

## Offene Fragen (Claude → Dominic, für morgen)
1. **Bezugsgrössen final:** EBF, Anzahl Wohnungen/Einheiten, Heizleistung [kW], Bohrmeter —
   passt so, oder noch etwas dazu/weg?
2. **BKP-Katalog + Preise:** gibst du im Auswertungs-Tool die BKP-Nummern + Preise selbst ein
   (editierbar)? Soll ich einen Start-Katalog vorschlagen?
3. **Kostenschätzung im Projekt:** Eingaben von Hand — oder soll sie Werte aus dem Projekt
   automatisch ziehen (z.B. Heizleistung aus dem Schema, EBF)?
4. **Mehrfach-Häkchen & Ähnlichkeit:** Vorschlag — je mehr gemeinsame Erzeuger-/Abgabe-Systeme,
   desto ähnlicher. Passt das?
5. **Auswertung-Zugriff firmenweit** (alle in der Firma pflegen dieselbe Datenbank) — bestätigt?
