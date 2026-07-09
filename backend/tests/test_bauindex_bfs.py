"""Baupreisindex-Parser — Test mit einer synthetischen Excel-Datei (kein
Netzwerk nötig), die dieselbe Struktur wie die echte BFS-Datei nachbildet
(live gegen opendata.swiss verifiziert am 2026-07-09)."""
import io
from datetime import date

import openpyxl
import pytest

from app.data.bauindex_bfs import _lies_schweiz_gesamtindex


def _mock_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "2020"
    # Zeilen 1-4: Titel/Basis-Beschriftung (wird ignoriert)
    ws.append(["<Titel>", "Schweizerischer Baupreisindex"])
    ws.append(["<Untertitel>", "Entwicklung der Baupreise"])
    ws.append(["<Basis>", "Basis Oktober 2020 = 100"])
    ws.append([])
    # Zeile 5: Monat, Zeile 6: Jahr — ab Spalte D (4)
    ws.append([None, None, "Gewicht in %", "Oktober", "April", "Oktober"])
    ws.append([None, None, None, 2023, 2024, 2024])
    ws.append([])
    ws.append(["<REG_01>", "Schweiz"])
    ws.append(["<OBJ_02>", "Baugewerbe : Total", 100, 140.1, 141.5, 142.0])
    ws.append(["<REG_02>", "Region X"])  # andere Region — darf nicht verwendet werden
    ws.append(["<OBJ_02>", "Baugewerbe : Total", 100, 999, 999, 999])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_liest_schweiz_gesamtindex_korrekt():
    eintraege = _lies_schweiz_gesamtindex(_mock_xlsx())
    assert eintraege == [
        {"periode": date(2023, 10, 1), "wert": 140.1},
        {"periode": date(2024, 4, 1), "wert": 141.5},
        {"periode": date(2024, 10, 1), "wert": 142.0},
    ]
    # nicht die Werte der anderen Region (999)
    assert all(e["wert"] != 999 for e in eintraege)


def test_leere_datei_gibt_leere_liste():
    wb = openpyxl.Workbook()
    wb.active.title = "2020"
    buf = io.BytesIO()
    wb.save(buf)
    assert _lies_schweiz_gesamtindex(buf.getvalue()) == []
