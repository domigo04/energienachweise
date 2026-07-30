"""Golden-LV-Kostentest + Kostenzusammenstellung (Punkt 13–18, 27).

Die Fixture ist die sanitisierte Struktur einer echten Kostenzusammenstellung
(Punkt 26): dieselben Positionsnummern und Beträge, aber ohne Namen, Adressen
oder weitere Offertdaten. Damit wird das Dokument zu einem reproduzierbaren
Regressionstest, ohne vertrauliche Daten ins Repo zu legen.
"""
from pathlib import Path

import pytest

from app.lv_import.cost_summary import (
    parse_cost_summary, to_cost_rows, has_cost_summary, VALID, MISMATCH,
)
from app.lv_import import norm_lv
from app.lv_import import commercial
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


def test_schweizer_nullrappen_format_wird_gelesen():
    """Offerten schreiben ganze Franken oft als 1'410.- bzw. 780.-."""
    text = (
        "KOSTENZUSAMMENSTELLUNG\n"
        "241.10 Expansion und Sicherheit Primärkreis 1'410.-\n"
        "242.2 Expansion und Sicherheit Wärmeerzeugung 780.-\n"
        "Total BKP 241 1'410.-\n"
        "Total BKP 242 780.-\n"
        "Total BKP 24 2'190.-\n"
    )
    res = parse_cost_summary([{"page": 1, "text": text}])
    assert {p["original_position"]: p["amount"] for p in res["positions"]} == {
        "241.10": 1410.0, "242.2": 780.0,
    }
    assert res["trade_total"] == 2190.0


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
    müssen dieselbe Norm-LV-Position bekommen, obwohl die Nummer variiert."""
    p11 = next(p for p in summary["positions"] if p["original_position"] == "241.11")
    p13 = next(p for p in summary["positions"] if p["original_position"] == "241.13")
    assert p11["canonical_key"] == "241.11"      # Norm-LV: Rohrleitungen Primärkreis
    assert p13["canonical_key"] == "241.11"


def test_zuordnung_folgt_dem_titel_nicht_der_nummer(summary):
    """Der wichtigste Fall: im Angebot ist 242.1 die Sole/Wasser-Wärmepumpe, im
    Norm-LV ist 242.1 der Gasheizkessel — die WP ist 242.3. Wer nach Nummer
    zuordnet, vertauscht Positionen."""
    p = next(p for p in summary["positions"] if p["original_position"] == "242.1")
    assert p["canonical_key"] == "242.3"
    assert norm_lv.NORM_BY_KEY["242.3"]["bezeichnung"] == "Wärmepumpe Sole/Wasser"
    assert norm_lv.NORM_BY_KEY["242.1"]["bezeichnung"] == "Gasheizkessel"


def test_zuordnung_ueber_gruppengrenzen(summary):
    """Auch die Gruppe taugt nicht als Filter: „Isolation Rohrleitungen" steht im
    Angebot unter 247, im Norm-LV unter 248.2."""
    p = next(p for p in summary["positions"] if p["original_position"] == "247.1")
    assert p["canonical_key"] == "248.2"


def test_norm_zuordnungen_der_hauptpositionen(summary):
    erwartet = {
        "241.10": "241.10",   # Expansion und Sicherheit Primärkreis
        "241.12": "241.12",   # Apparate / Armaturen Primärkreis
        "241.14": "241.14",   # Erdsonden und Zubehör
        "242.2": "242.6",     # Expansion und Sicherheit (Wärmeerzeugung)
        "243.1": "243.1",     # Rohrleitungen
        "243.2": "243.3a",    # Flächenheizung (Bodenheizung)
        "243.4": "243.7",     # Wärmemessung
        "243.5": "243.9",     # Montage / Transport Wärmeverteilung
        "247.2": "248.3",     # Armaturen-Isolation Heizung
        "249.1": "249.2",     # Unvorhergesehenes / Anpassungen
    }
    ist = {p["original_position"]: p["canonical_key"] for p in summary["positions"]}
    for nummer, key in erwartet.items():
        assert ist[nummer] == key, f"{nummer} → {ist[nummer]} statt {key}"


def test_jede_zuordnung_ist_eine_echte_norm_position(summary):
    """Es darf NIE ein Schlüssel entstehen, den das Norm-LV nicht kennt."""
    for p in summary["positions"]:
        if p["canonical_key"] is not None:
            assert norm_lv.ist_norm_position(p["canonical_key"]), p


def test_zuordnung_traegt_methode_und_begruendung(summary):
    """mapping_method/confidence/reason machen später messbar, wie gut die
    automatische Zuordnung ist."""
    p = next(p for p in summary["positions"] if p["original_position"] == "242.1")
    assert p["mapping_method"] in ("exact", "rule")
    assert 0 < p["mapping_confidence"] <= 1.0
    assert p["mapping_reason"]
    assert p["original_amount"] == 50650.0


def test_rohrleitungen_quelle_vs_verteilung_unterscheiden():
    """Gleicher Begriff, andere Anlagenseite → andere Norm-LV-Position."""
    assert norm_lv.match_title("Rohrleitungen Primärkreis WP zu Erdsondensammler", "241")["canonical_key"] == "241.11"
    assert norm_lv.match_title("Rohrleitungen Primaerkreis EWS", "241")["canonical_key"] == "241.11"
    assert norm_lv.match_title("Rohrleitungen Verteilung", "243")["canonical_key"] == "243.1"


def test_umlautschreibweise_egal():
    assert norm_lv.match_title("Flaechenheizung", "243")["canonical_key"] == "243.3a"
    assert norm_lv.match_title("Flächenheizung", "243")["canonical_key"] == "243.3a"


def test_exakter_norm_titel_wird_als_exact_erkannt():
    res = norm_lv.match_title("Wärmemessung", "243")
    assert res["canonical_key"] == "243.7"
    assert res["mapping_method"] == "exact"
    assert res["mapping_confidence"] == 1.0


# ── Punkt 18 — keine aggressive Fuzzy-Zuordnung ───────────────────────────

def test_unbekannter_titel_bleibt_ohne_zuordnung():
    """Punkt 18 — lieber None als eine erfundene Zuordnung."""
    for titel in ("Diverse Nebenarbeiten nach Aufwand", "", "Zulage für erschwerte Montage"):
        assert norm_lv.match_title(titel)["canonical_key"] is None


def test_elektroanschluesse_haben_keine_norm_position(summary):
    """Ehrliches Ergebnis: das Norm-LV kennt keine Elektro-Position, also bleibt
    die Zuordnung offen und der Nutzer entscheidet."""
    p = next(p for p in summary["positions"] if p["original_position"] == "248.2")
    assert "Elektro" in p["original_title"]
    assert p["canonical_key"] is None
    assert p["mapping_reason"]


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


def test_golden_konditionskette_ergibt_endsumme_260723(summary):
    """Konditionen bleiben separat; die 20 Kostenpositionen werden nie geteilt."""
    common_basis = 244729.68
    conditions = [
        {"label": "Rabatt", "kind": "percent", "direction": "deduction",
         "rate_percent": 6, "order": 1},
        {"label": "Skonto", "kind": "percent", "direction": "deduction",
         "rate_percent": 2, "order": 2},
        {"label": "Baureinigung/Beschädigungen", "kind": "percent",
         "direction": "deduction", "rate_percent": 0.5,
         "basis_amount": common_basis, "order": 3},
        {"label": "Bauwasser und elektrische Energie", "kind": "percent",
         "direction": "deduction", "rate_percent": 0.3,
         "basis_amount": common_basis, "order": 4},
        {"label": "Bauwesenversicherung", "kind": "percent",
         "direction": "deduction", "rate_percent": 0.2,
         "basis_amount": common_basis, "order": 5},
        {"label": "Baureklame", "kind": "fixed", "direction": "deduction",
         "amount": 200, "order": 6},
    ]
    calculated, issues = commercial.validate(
        summary["trade_total"], conditions, 7.7, stated_total=260723,
    )
    assert len(summary["positions"]) == 20
    assert len(conditions) == 6
    assert calculated["subtotal_excl_vat"] == 242082.38
    assert calculated["total_incl_vat"] == 260722.72
    assert issues == []


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


def test_gruppentotale_werden_nie_referenzkosten(summary):
    """Ein Gruppentotal ist eine Kontrollzeile, keine Norm-LV-Position — es kann
    also nie in die Referenz gelangen und kann dort auch nichts verdoppeln."""
    from app.models.kv import RefKostenzeile
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = _import_mit_kosten(db, summary)
    approve_lv(imp.id, user=_user(), db=db)
    for z in db.query(RefKostenzeile).all():
        assert "." in z.bkp_nr, f"{z.bkp_nr} sieht wie ein Gruppentotal aus"
        assert norm_lv.ist_norm_position(z.bkp_nr)


def test_nur_gruppentotale_ergeben_keine_referenzkosten():
    """EINSCHRÄNKUNG der Norm-LV-Regel, bewusst so:

    Enthält ein LV ausschliesslich Gruppentotale (z.B. nur „Total BKP 244") und
    keine Einzelpositionen, entstehen keine Referenzkosten — eine Gruppe ist
    keine Norm-LV-Position, also gibt es nichts zu bestätigen. Solche LVs müssen
    im Review manuell auf Norm-Positionen verteilt werden."""
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
    assert db.query(RefKostenzeile).count() == 0


def _import_mit_kosten(db, summary, *, mapping_confirmed=True):
    from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
    imp = LvImport(tenant_id=1, filename="norm.pdf", file_hash="n1",
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
            detected_amount=row["detected_amount"],
            confirmed=True, mapping_confirmed=mapping_confirmed))
    db.commit()
    return imp


_USER = None


def _user():
    from types import SimpleNamespace
    return SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")


def test_nur_zugeordnete_positionen_werden_referenzkosten(summary):
    """Vorgabe: das Ergebnis soll aussehen wie ein normal nach dem Norm-LV
    ausgewertetes Projekt. Keine halbstandardisierten Gruppenzeilen wie „248"
    für Leistungen, die es im Norm-LV nicht gibt."""
    from app.models.kv import RefKostenzeile
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = _import_mit_kosten(db, summary)
    approve_lv(imp.id, user=_user(), db=db)

    zeilen = db.query(RefKostenzeile).all()
    # Jede Referenzzeile ist eine echte Norm-LV-Position.
    assert zeilen
    for z in zeilen:
        assert norm_lv.ist_norm_position(z.bkp_nr), f"{z.bkp_nr} ist keine Norm-Position"
        assert z.bkp_name == norm_lv.NORM_BY_KEY[z.bkp_nr]["bezeichnung"]
    # Angebot 242.1 „Wärmeerzeuger Sole/Wasser" → Norm 242.3.
    nach_nr = {}
    for z in zeilen:
        nach_nr.setdefault(z.bkp_nr, []).append(z.betrag_chf)
    assert nach_nr["242.3"] == [50650.0]
    assert nach_nr["248.2"] == [4191.0]          # Angebot 247.1 Isolation Rohrleitungen


def test_nicht_zugeordnete_positionen_bleiben_dokumentiert(summary):
    """Das Geld verschwindet nicht — es bleibt im Import mit Originalnummer,
    Titel und Begründung, fliesst aber nicht in die Referenzkosten."""
    from app.models.kv import RefKostenzeile
    from app.models.lv_import import LvImportCost
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = _import_mit_kosten(db, summary)
    approve_lv(imp.id, user=_user(), db=db)

    ohne = [c for c in db.query(LvImportCost).all()
            if not c.is_group_total and not c.canonical_key]
    assert ohne, "Fixture sollte nicht zuordenbare Positionen enthalten"
    for c in ohne:
        assert c.original_position and c.original_title      # bleibt nachvollziehbar
        assert c.detected_amount is not None

    referenz = round(sum(z.betrag_chf for z in db.query(RefKostenzeile).all()), 2)
    nicht_zugeordnet = round(sum(c.detected_amount for c in ohne), 2)
    # Referenz + nicht zugeordnet = das volle Gewerktotal. Nichts geht verloren,
    # es ist nur klar getrennt.
    assert round(referenz + nicht_zugeordnet, 2) == GOLDEN_TRADE_TOTAL
    assert referenz < GOLDEN_TRADE_TOTAL


def test_freigabe_verlangt_gepruefte_zuordnung(summary):
    """Zweites Gate: „Betrag stimmt" ist nicht „Zuordnung stimmt"."""
    from fastapi import HTTPException
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = _import_mit_kosten(db, summary, mapping_confirmed=False)
    try:
        approve_lv(imp.id, user=_user(), db=db)
        assert False, "Freigabe hätte an der Zuordnung scheitern müssen"
    except HTTPException as e:
        assert e.status_code == 422
        assert "unconfirmed_mappings" in e.detail


def test_unbestaetigte_zuordnung_wird_nicht_uebernommen(summary):
    """Auch eine erkannte Zuordnung zählt erst nach Bestätigung."""
    from app.models.kv import RefKostenzeile
    from app.models.lv_import import LvImportCost
    from app.routers.hc_lv_import import approve_lv

    db = _db()
    imp = _import_mit_kosten(db, summary)
    # Eine bestätigte Zuordnung zurücknehmen — Betrag bleibt bestätigt.
    c = (db.query(LvImportCost)
         .filter(LvImportCost.canonical_key == "242.3").first())
    c.mapping_confirmed = False
    db.commit()
    try:
        approve_lv(imp.id, user=_user(), db=db)
        assert False, "hätte blockieren müssen"
    except Exception:
        pass
    assert db.query(RefKostenzeile).count() == 0
