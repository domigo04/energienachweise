"""Automatischer Abruf-Versuch des Schweizer Baupreisindex (BFS) über
opendata.swiss (CKAN-API).

WICHTIG — ehrlich deklariert: Diese Funktion wurde nicht gegen eine echte,
erfolgreiche Live-Antwort verifiziert (der Testzugriff während der Entwicklung
wurde von opendata.swiss mit HTTP 403 blockiert). Sie ist bewusst defensiv
geschrieben: jeder Fehler (Netzwerk, Format, unerwartete Spalten) führt zu
einem klaren `erfolg=False` mit Meldung — nie zu stillschweigend falschen
Zahlen in der Datenbank. Die manuelle Eingabe (hc_bauindex.py) bleibt der
zuverlässige Normalfall, dieser Abruf ist ein Bonus-Versuch obendrauf.

Datensatz: "Schweizerischer Baupreisindex" (BFS), halbjährlich (April/Oktober).
"""
from datetime import date, datetime
from typing import Optional

CKAN_PACKAGE_SHOW = "https://ckan.opendata.swiss/api/3/action/package_show"
DATASET_ID = "schweizerischer-baupreisindex-entwicklung-der-baupreise-multibasen-indexwerte-pro-grossregion-u1"

_HEADERS = {"User-Agent": "Mozilla/5.0 (Heizungscockpit/1.0; +https://energienachweise.com)"}

# Mögliche Spaltennamen in der BFS-CSV — wird der Reihe nach probiert, da das
# exakte Format nicht live geprüft werden konnte.
_PERIODEN_SPALTEN = ["Jahr", "Periode", "Datum", "Date", "Erhebung", "Erhebungsperiode"]
_WERT_SPALTEN = ["Wert", "Value", "Index", "Indexwert", "OBS_VALUE"]


def _parse_periode(text: str) -> Optional[date]:
    text = (text or "").strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y"):
        try:
            d = datetime.strptime(text, fmt)
            return d.date() if fmt != "%Y" else date(d.year, 10, 1)  # Jahr allein → Oktober-Erhebung
        except ValueError:
            continue
    return None


def _finde_spalte(fieldnames, kandidaten) -> Optional[str]:
    for k in kandidaten:
        for f in fieldnames or []:
            if f.strip().lower() == k.lower():
                return f
    return None


def fetch_bfs_baupreisindex() -> dict:
    """Bestmöglicher Abruf. Gibt immer {"erfolg", "meldung", "eintraege"} zurück,
    wirft nie ungefangen. eintraege: Liste von {"periode": date, "wert": float}."""
    import csv
    import io

    try:
        import httpx
    except ImportError:
        return {"erfolg": False, "meldung": "httpx ist nicht installiert.", "eintraege": []}

    try:
        with httpx.Client(timeout=15, headers=_HEADERS, follow_redirects=True) as client:
            meta = client.get(CKAN_PACKAGE_SHOW, params={"id": DATASET_ID})
            meta.raise_for_status()
            payload = meta.json()
            if not payload.get("success"):
                return {"erfolg": False, "meldung": "opendata.swiss meldet keinen Erfolg (package_show).", "eintraege": []}

            ressourcen = payload.get("result", {}).get("resources", [])
            csv_url = next(
                (r.get("url") or r.get("download_url") for r in ressourcen
                 if "csv" in (r.get("format") or "").lower()),
                None,
            )
            if not csv_url:
                return {"erfolg": False, "meldung": "Keine CSV-Ressource im Datensatz gefunden.", "eintraege": []}

            resp = client.get(csv_url)
            resp.raise_for_status()
            text = resp.content.decode("utf-8-sig", errors="replace")
    except Exception as e:
        return {"erfolg": False, "meldung": f"Abruf fehlgeschlagen: {e}", "eintraege": []}

    try:
        reader = csv.DictReader(io.StringIO(text))
        periode_spalte = _finde_spalte(reader.fieldnames, _PERIODEN_SPALTEN)
        wert_spalte = _finde_spalte(reader.fieldnames, _WERT_SPALTEN)
        if not periode_spalte or not wert_spalte:
            return {
                "erfolg": False,
                "meldung": f"Spalten nicht erkannt (gefunden: {reader.fieldnames}). "
                           "Bitte Indexwerte manuell erfassen.",
                "eintraege": [],
            }
        eintraege = []
        for row in reader:
            periode = _parse_periode(row.get(periode_spalte))
            try:
                wert = float(str(row.get(wert_spalte)).replace(",", "."))
            except (TypeError, ValueError):
                continue
            if periode and wert > 0:
                eintraege.append({"periode": periode, "wert": wert})
        if not eintraege:
            return {"erfolg": False, "meldung": "Keine auswertbaren Zeilen in der CSV gefunden.", "eintraege": []}
        return {"erfolg": True, "meldung": f"{len(eintraege)} Indexwerte gefunden.", "eintraege": eintraege}
    except Exception as e:
        return {"erfolg": False, "meldung": f"CSV konnte nicht gelesen werden: {e}", "eintraege": []}
