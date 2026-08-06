"""Persönliche Tastenbelegung — die Regeln, nicht die Verdrahtung.

Feedback Dominic 2026-07-31: die Shortcuts gehören dem Benutzer, und eine Taste
darf nicht zwei Befehle auslösen. Beides wird hier abgesichert.
"""
from app.user_settings import (
    STANDARD_SHORTCUTS,
    bereinige_einstellungen,
    bereinige_shortcuts,
)


def test_ohne_eingabe_gilt_die_standardbelegung():
    assert bereinige_shortcuts(None) == STANDARD_SHORTCUTS
    assert bereinige_shortcuts({}) == STANDARD_SHORTCUTS


def test_eine_geaenderte_taste_laesst_die_uebrigen_stehen():
    belegung = bereinige_shortcuts({"shortcut_line": "q"})
    assert belegung["shortcut_line"] == "q"
    assert belegung["shortcut_rotate"] == STANDARD_SHORTCUTS["shortcut_rotate"]


def test_grossbuchstabe_und_leerzeichen_werden_normalisiert():
    assert bereinige_shortcuts({"shortcut_move": " W "})["shortcut_move"] == "w"


def test_ungueltige_taste_faellt_auf_den_standard_zurueck():
    # Mehr als ein Zeichen, leer oder None ist keine Taste.
    for wert in ("ab", "", None):
        assert bereinige_shortcuts({"shortcut_align": wert})["shortcut_align"] \
            == STANDARD_SHORTCUTS["shortcut_align"]


def test_ziffern_sind_nicht_belegbar():
    """Ziffern eröffnen beim Zeichnen die Längeneingabe — sie gehören ihr."""
    for wert in (5, "7"):
        assert bereinige_shortcuts({"shortcut_align": wert})["shortcut_align"] \
            == STANDARD_SHORTCUTS["shortcut_align"]


def test_reservierte_tasten_sind_nicht_belegbar():
    """Escape und Enter gehören dem Editor — ein Befehl bekäme sie nie zu sehen."""
    belegung = bereinige_shortcuts({"shortcut_break": "escape"})
    assert belegung["shortcut_break"] == STANDARD_SHORTCUTS["shortcut_break"]


def test_keine_taste_loest_zwei_befehle_aus():
    """Der zuletzt gesetzte Befehl behält die Taste, der frühere weicht."""
    belegung = bereinige_shortcuts({"shortcut_line": "m", "shortcut_move": "m"})
    tasten = [t for t in belegung.values() if t]
    assert len(tasten) == len(set(tasten))
    assert belegung["shortcut_move"] == "m"
    # `shortcut_line` hat seine Wunschtaste verloren und bekommt seinen Standard.
    assert belegung["shortcut_line"] == STANDARD_SHORTCUTS["shortcut_line"]


def test_belegter_standard_laesst_den_befehl_lieber_ohne_taste():
    """Keine geratene Ersatztaste — lieber gar keine als eine überraschende."""
    # «l» ist der Standard von shortcut_line und wird hier von move beansprucht.
    belegung = bereinige_shortcuts({"shortcut_move": "l"})
    assert belegung["shortcut_move"] == "l"
    assert belegung["shortcut_line"] is None
    tasten = [t for t in belegung.values() if t]
    assert len(tasten) == len(set(tasten))


def test_unbekannte_schluessel_werden_verworfen():
    belegung = bereinige_shortcuts({"shortcut_raketenstart": "r"})
    assert set(belegung) == set(STANDARD_SHORTCUTS)


def test_einstellungssatz_ist_immer_vollstaendig():
    satz = bereinige_einstellungen(None)
    assert set(satz) == {"shortcuts"}
    assert satz["shortcuts"] == STANDARD_SHORTCUTS


# ── Leitungen ändern (Issue #72) ────────────────────────────────────────────

def test_die_vier_neuen_befehle_sind_belegbar():
    """Ohne Eintrag im Server könnte der Editor sie speichern, aber nie laden."""
    belegung = bereinige_shortcuts({})
    for befehl in ("shortcut_offset", "shortcut_trim", "shortcut_extend", "shortcut_join"):
        assert belegung[befehl], f"{befehl} braucht eine Standardtaste"
    assert bereinige_shortcuts({"shortcut_trim": "U"})["shortcut_trim"] == "u"


def test_standardbelegung_ist_widerspruchsfrei():
    tasten = [t for t in STANDARD_SHORTCUTS.values() if t]
    assert len(tasten) == len(set(tasten))


def test_t_bleibt_der_folge_tr_fuer_ecke_verbinden():
    """`TR` = Ecke verbinden ist gesetzt (Dominic 2026-08-06). Der Editor fängt
    `t` ab, bevor er eine belegbare Taste prüft — ein darauf gelegter Befehl
    wäre stumm. Darum ist `t` reserviert und Stutzen hat eine eigene Taste."""
    assert "t" not in STANDARD_SHORTCUTS.values()
    belegung = bereinige_shortcuts({"shortcut_trim": "t"})
    assert belegung["shortcut_trim"] == STANDARD_SHORTCUTS["shortcut_trim"]
    assert belegung["shortcut_trim"] != "t"
