"""Lage und Sichtbarkeit der Datenblöcke im SVG-Export (#58).

Editor und Export müssen denselben Anker verwenden — waagrechte Mitte und
Oberkante des Kastens. Weicht einer ab, steht der Block im PDF woanders als in
der Zeichnung, und genau das merkt man erst beim Kunden.

Es werden ausschliesslich erfundene Bauteile verwendet.
"""
import pytest

from app.export.schema_svg import (
    datenblock_anker,
    datenblock_sichtbar,
    node_groesse,
    zeichne_datenblock,
)


def _pumpe(**daten):
    return {"id": "p1", "type": "pump", "position": {"x": 300, "y": 400},
            "data": {"nr": 1, "label": "Pumpe", **daten}}


# ── Sichtbarkeit ───────────────────────────────────────────────────────────

def test_block_ist_ohne_angabe_sichtbar():
    # Altbestand kennt das Feld nicht und muss unverändert erscheinen.
    assert datenblock_sichtbar(_pumpe()) is True


def test_nur_ein_ausdrueckliches_true_blendet_aus():
    assert datenblock_sichtbar(_pumpe(caption_hidden=True)) is False
    assert datenblock_sichtbar(_pumpe(caption_hidden=False)) is True
    # Dieselbe Regel wie im Editor: alles andere zählt NICHT als ausgeblendet.
    assert datenblock_sichtbar(_pumpe(caption_hidden="ja")) is True


def test_ausgeblendeter_block_wird_nicht_gezeichnet():
    parts = []
    zeichne_datenblock(parts, _pumpe(caption_hidden=True), {})
    assert parts == []


def test_eingeblendeter_block_wird_gezeichnet():
    parts = []
    zeichne_datenblock(parts, _pumpe(), {})
    assert parts, "Ein sichtbarer Block muss SVG erzeugen"


def test_bauteil_ohne_nummer_hat_keinen_block():
    parts = []
    ohne_nr = {"id": "x", "type": "pump", "position": {"x": 0, "y": 0}, "data": {}}
    zeichne_datenblock(parts, ohne_nr, {})
    assert parts == []


# ── Lage ───────────────────────────────────────────────────────────────────

def test_eigene_lage_wird_unveraendert_uebernommen():
    # `caption_pos` IST der Anker — nicht noch einmal verschoben.
    node = _pumpe(caption_pos={"x": 1234.5, "y": 987.5})
    assert datenblock_anker(node) == (1234.5, 987.5)


def test_ohne_eigene_lage_gilt_weiter_das_altmodell():
    # Ein Schema, das nie im neuen Editor offen war, exportiert wie bisher.
    node = _pumpe()
    w, h = node_groesse(node)
    assert datenblock_anker(node) == (300 + w / 2, 400 + h + 10)


def test_altmodell_beruecksichtigt_den_versatz_in_beide_richtungen():
    node = _pumpe(caption_offset_x=-40, caption_offset_y=-120)
    w, h = node_groesse(node)
    assert datenblock_anker(node) == (300 + w / 2 - 40, 400 + h + 10 - 120)


def test_eigene_lage_schlaegt_den_alten_versatz():
    # Nach der Migration bleiben keine Altfelder stehen; steht doch noch eines
    # da, gilt die eigene Lage — es darf nur EINE Quelle geben.
    node = _pumpe(caption_pos={"x": 10, "y": 20}, caption_offset_x=999, caption_offset_y=999)
    assert datenblock_anker(node) == (10, 20)


@pytest.mark.parametrize("kaputt", [
    {"x": None, "y": 20},
    {"x": 10},
    {},
    "keine Lage",
])
def test_unbrauchbare_lage_faellt_auf_das_altmodell_zurueck(kaputt):
    node = _pumpe(caption_pos=kaputt)
    w, h = node_groesse(node)
    assert datenblock_anker(node) == (300 + w / 2, 400 + h + 10)


def test_die_lage_haengt_nicht_mehr_am_bauteil():
    # Der Kern von #58: dasselbe `caption_pos`, anderes Bauteil — gleicher Ort.
    oben = _pumpe(caption_pos={"x": 500, "y": 900})
    unten = {**oben, "position": {"x": 300, "y": 4000}}
    assert datenblock_anker(oben) == datenblock_anker(unten) == (500, 900)
