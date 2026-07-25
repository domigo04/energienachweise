"""Golden-LV-Kostentest + Kostenzusammenstellung (Punkt 13–18, 27).

Die Fixture ist die sanitisierte Struktur einer echten Kostenzusammenstellung
(Punkt 26): dieselben Positionsnummern und Beträge, aber ohne Namen, Adressen
oder weitere Offertdaten. Damit wird das Dokument zu einem reproduzierbaren
Regressionstest, ohne vertrauliche Daten ins Repo zu legen.
"""
from pathlib import Path

import pytest

from app.lv_import.cost_summary import (
    parse_cost_summary, canonical_key, to_cost_rows, has_cost_summary,
    VALID, MISMATCH,
)
from app.lv_import import page_classifier as pc

FIXTURES = Path(__file__).parent / "fixtures"


def _summary_pages(page: int = 43) -> list[dict]:
    raw = (FIXTURES / "lv_cost_summary_sanitized.txt").read_text(encoding="utf-8")
    text = "\n".join(z for z in raw.splitlines() if not z.startswith("#"))
    return [{"page": page, "text": text}]


@pytest.fixture(scope="module")
def summary():
    return parse_cost_summary(_summary_pages())


# ── Punkt 16/27 — Golden-LV: exakte Werte ──────────────────────────────────

# Erwartete Einzelpositionen direkt aus der Kostenzusammenstellung.
GOLDEN_POSITIONS = {
    "241.10": 1410.0, "241.11": 2407.0, "241.12": 2162.0,
    "241.13": 10223.0, "241.14": 87050.0,
    "242.1": 50650.0, "242.2": 780.0, "242.3": 5328.0,
    "243.1": 4423.0, "243.2": 14961.0, "243.3": 5782.0,
    "243.4": 11997.0, "243.5": 33980.0,
    "247.1": 4191.0, "247.2": 554.0,
    "248.2": 11757.0, "248.3": 9009.0,
    "249.1": 1000.0, "249.2": 5000.0, "249.3": 3000.0,
}
GOLDEN_GROUP_TOTALS = {
    "241": 103252.0, "242": 56758.0, "243": 71143.0,
    "247": 4745.0, "248": 20766.0, "249": 9000.0,
}
GOLDEN_TRADE_TOTAL = 265664.0


@pytest.mark.parametrize("nummer,betrag", sorted(GOLDEN_POSITIONS.items()))
def test_golden_einzelposition(summary, nummer, betrag):
    """Jede Einzelposition wird mit exaktem Betrag gelesen (Punkt 16)."""
    treffer = [p for p in summary["positions"] if p["original_position"] == nummer]
    assert len(treffer) == 1, f"Position {nummer} nicht eindeutig gefunden"
    assert treffer[0]["amount"] == betrag


@pytest.mark.parametrize("gruppe,betrag", sorted(GOLDEN_GROUP_TOTALS.items()))
def test_golden_gruppentotal(summary, gruppe, betrag):
    """Gruppentotale werden zusätzlich gespeichert (Punkt 15/16)."""
    assert summary["group_totals"][gruppe]["amount"] == betrag


def test_golden_gewerktotal(summary):
    """BKP 24 total = 265'664."""
    assert summary["trade_total"] == GOLDEN_TRADE_TOTAL


def test_alle_positionen_gefunden(summary):
    assert len(summary["positions"]) == len(GOLDEN_POSITIONS)


# ── Punkt 15/27 — Summenprüfung ────────────────────────────────────────────

def test_summenpruefung_alle_gruppen_valid(summary):
    """sum(Unterpositionen) == Gruppentotal (±1 CHF) für jede Gruppe."""
    for gruppe in GOLDEN_GROUP_TOTALS:
        info = summary["group_totals"][gruppe]
        assert info["validation_status"] == VALID, (
            f"BKP {gruppe}: {info['sum_positions']} != {info['amount']}")


def test_summenpruefung_241_ergibt_103252(summary):
    """Punkt 27 — die Einzelpositionen der 241 summieren auf 103'252."""
    assert summary["group_totals"]["241"]["sum_positions"] == 103252.0


def test_gruppentotale_summieren_auf_gewerktotal(summary):
    summe = sum(GOLDEN_GROUP_TOTALS.values())
    assert summe == GOLDEN_TRADE_TOTAL


def test_mismatch_wird_erkannt():
    """Stimmt das ausgewiesene Total nicht, wird es als mismatch markiert."""
    text = ("KOSTENZUSAMMENSTELLUNG\n"
            "241.10  Expansion und Sicherheit Primaerkreis   1'000.00\n"
            "241.11  Rohrleitungen Primaerkreis              1'000.00\n"
            "Total BKP 241                                   9'999.00\n")
    res = parse_cost_summary([{"page": 1, "text": text}])
    assert res["group_totals"]["241"]["validation_status"] == MISMATCH
    assert res["group_totals"]["241"]["sum_positions"] == 2000.0


# ── Punkt 14 — Detailinformation bleibt erhalten ──────────────────────────

def test_originalnummer_und_titel_bleiben_erhalten(summary):
    """Nicht sofort 241.10 → 241 aggregieren (Punkt 14)."""
    pos = next(p for p in summary["positions"] if p["original_position"] == "241.10")
    assert pos["bkp_group"] == "241"
    assert "Expansion" in pos["original_title"]
    assert pos["source_page"] == 43


# ── Punkt 17 — kanonische Kostenpositionen ────────────────────────────────

def test_gleiche_leistung_unterschiedliche_nummer_gleicher_schluessel(summary):
    """Punkt 27 — 241.11 und 241.13 sind beide Primärkreis-Rohrleitungen und
    müssen denselben kanonischen Schlüssel bekommen, obwohl die Nummer variiert."""
    p11 = next(p for p in summary["positions"] if p["original_position"] == "241.11")
    p13 = next(p for p in summary["positions"] if p["original_position"] == "241.13")
    assert p11["canonical_key"] == "source_pipework"
    assert p13["canonical_key"] == "source_pipework"


def test_kanonische_schluessel_der_hauptpositionen(summary):
    erwartet = {
        "241.10": "source_expansion_safety",
        "241.12": "source_equipment_valves",
        "241.14": "boreholes",
        "242.1": "heat_generator",
        "242.2": "generation_expansion_safety",
        "243.1": "distribution_pipework",
        "243.2": "surface_heating",
        "243.4": "heat_metering",
        "247.1": "insulation_pipework",
        "248.3": "commissioning",
    }
    ist = {p["original_position"]: p["canonical_key"] for p in summary["positions"]}
    for nummer, key in erwartet.items():
        assert ist[nummer] == key, f"{nummer} → {ist[nummer]} statt {key}"


def test_rohrleitungen_quelle_vs_verteilung_unterscheiden():
    """Gleicher Begriff, andere Anlagenseite → anderer kanonischer Schlüssel."""
    assert canonical_key("Rohrleitungen Primärkreis WP zu Erdsondensammler", "241") == "source_pipework"
    assert canonical_key("Rohrleitungen Primaerkreis EWS", "241") == "source_pipework"
    assert canonical_key("Rohrleitungen Verteilung", "243") == "distribution_pipework"


def test_umlautschreibweise_egal():
    assert canonical_key("Flaechenheizung", "243") == "surface_heating"
    assert canonical_key("Flächenheizung", "243") == "surface_heating"


# ── Punkt 18 — keine aggressive Fuzzy-Zuordnung ───────────────────────────

def test_unbekannter_titel_bleibt_ohne_zuordnung():
    """Punkt 18 — lieber None als eine erfundene Zuordnung."""
    assert canonical_key("Diverse Nebenarbeiten nach Aufwand", "249") is None
    assert canonical_key("", "241") is None
    assert canonical_key("Zulage für erschwerte Montage", None) is None


def test_zuordnung_nur_mit_klarem_kontext():
    """„Apparate und Armaturen" ohne Anlagenseite ist nicht eindeutig."""
    assert canonical_key("Apparate und Armaturen", None) is None


# ── Punkt 13 — Zusammenstellung ist die primäre Quelle ────────────────────

def test_cost_summary_seite_wird_als_solche_erkannt():
    """Die Fixture muss vom Klassifikator als cost_summary erkannt werden."""
    res = pc.classify_page(_summary_pages()[0]["text"])
    assert res["type"] == pc.COST_SUMMARY


def test_has_cost_summary(summary):
    assert has_cost_summary(summary) is True
    assert has_cost_summary(parse_cost_summary([])) is False


def test_to_cost_rows_trennt_positionen_und_gruppentotale(summary):
    rows = to_cost_rows(summary)
    positionen = [r for r in rows if not r["is_group_total"]]
    totale = [r for r in rows if r["is_group_total"]]
    assert len(positionen) == len(GOLDEN_POSITIONS)
    assert len(totale) == len(GOLDEN_GROUP_TOTALS)
    # Die Summe der Einzelpositionen ergibt das Gewerktotal — ohne die
    # Gruppentotale doppelt mitzuzählen.
    assert round(sum(r["detected_amount"] for r in positionen), 2) == GOLDEN_TRADE_TOTAL


# ── Freigabe: Gruppentotale dürfen die Referenzkosten nicht verdoppeln ─────

def _db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database import Base
    from app.models.auth import User  # noqa: F401 — registriert hc_users
    from app.models.heizungscockpit import HcProject  # noqa: F401 — FK-Ziel
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_freigabe_zaehlt_gruppentotal_nicht_zusaetzlich(summary):
    """Punkt 14/15 — die Referenzkosten enthalten die Einzelpositionen, nicht
    zusätzlich das Gruppentotal. Sonst wäre jedes importierte Projekt doppelt
    so teuer wie in Wirklichkeit."""
    from types import SimpleNamespace
    from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
    from app.models.kv import RefKostenzeile
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = LvImport(tenant_id=1, filename="golden.pdf", file_hash="g1",
                   status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="2", confirmed=True))
    for row in to_cost_rows(summary):
        db.add(LvImportCost(
            lv_import_id=imp.id, bkp_nr=row["bkp_nr"],
            original_position=row.get("original_position"),
            original_title=row.get("original_title"),
            canonical_key=row.get("canonical_key"),
            is_group_total=row["is_group_total"],
            validation_status=row.get("validation_status"),
            detected_amount=row["detected_amount"], confirmed=True))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    approve_lv(imp.id, user=user, db=db)

    zeilen = db.query(RefKostenzeile).all()
    assert len(zeilen) == len(GOLDEN_POSITIONS)         # keine Totalzeilen
    assert round(sum(z.betrag_chf for z in zeilen), 2) == GOLDEN_TRADE_TOTAL
    # Originalnummer und -titel bleiben in der Referenz erhalten (Punkt 14).
    nummern = {z.bkp_nr for z in zeilen}
    assert "241.14" in nummern
    assert any("Erdsonden" in (z.bkp_name or "") for z in zeilen)


def test_gruppentotal_wird_genutzt_wenn_keine_einzelpositionen():
    """Hat eine Gruppe nur ein Total (kein Detail), zählt dieses Total."""
    from types import SimpleNamespace
    from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
    from app.models.kv import RefKostenzeile
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = LvImport(tenant_id=1, filename="nur_total.pdf", file_hash="g2",
                   status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="1", confirmed=True))
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="244", is_group_total=True,
                        detected_amount=12000.0, confirmed=True))
    db.commit()
    approve_lv(imp.id, user=SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch"), db=db)
    zeilen = db.query(RefKostenzeile).all()
    assert len(zeilen) == 1 and zeilen[0].betrag_chf == 12000.0
