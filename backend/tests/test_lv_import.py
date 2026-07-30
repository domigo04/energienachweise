"""LV-Import — Extraktionskern (B4-B8, B12). Reine Logik ohne DB/PDF-Bytes."""
from app.lv_import.feature_extract import extract_features
from app.lv_import.cost_extract import extract_costs
from app.lv_import.normalization import parse_number, parse_int
from app.lv_import.feature_keys import FEATURE_TO_CONTEXT, context_key


def _pages(text):
    return [{"page": 17, "text": text}]


# ── Normalisierung (Schweizer Zahlenformate) ────────────────────────────────

def test_parse_number_schweizer_format():
    assert parse_number("1'500") == 1500
    assert parse_number("1’500") == 1500
    assert parse_number("82,5") == 82.5
    assert parse_number("82.5") == 82.5
    assert parse_number("720") == 720
    assert parse_number("kein") is None
    assert parse_int("3 ") == 3


# ── B6 — konservatives Zählen ───────────────────────────────────────────────

def test_pump_menge_wird_gezaehlt():
    f = extract_features(_pages("Pos. 241.123\nHocheffizienz-Umwälzpumpe\nMenge 3 Stk."))
    assert f["pump_count"]["value"] == 3
    assert f["pump_count"]["confidence"] == "high"
    assert f["pump_count"]["source_page"] == 17
    assert "Umwälzpumpe" in f["pump_count"]["source_text"]


def test_pump_ohne_menge_wird_nicht_geraten():
    """Erwähnt, aber keine Menge → value None, confidence low (kein geratenes 1)."""
    f = extract_features(_pages("Umwälzpumpe im Heizkreis"))
    assert f["pump_count"]["value"] is None
    assert f["pump_count"]["confidence"] == "low"


def test_mehrere_positionen_summiert():
    text = "Umwälzpumpe\nMenge 2 Stk\nInlinepumpe\nMenge 3 Stk"
    f = extract_features(_pages(text))
    assert f["pump_count"]["value"] == 5


# ── B7 — Leistung / Speicher / Bohrmeter ────────────────────────────────────

def test_erzeugerleistung_und_typ():
    f = extract_features(_pages("Sole/Wasser-Wärmepumpe 82 kW"))
    assert f["generator_power_kw"]["value"] == 82
    assert f["generator_type"]["value"] == "ews_wp"


def test_generische_waermepumpe_wird_nicht_als_wasser_wp_erfunden():
    f = extract_features(_pages("Wärmepumpe 82 kW"))
    assert f["generator_type"]["value"] == "sonstige"


def test_spezifischer_erzeugertyp_gewinnt_gegen_fruehe_generische_wp_erwaehnung():
    f = extract_features(_pages(
        "Expansion Primärkreis WP\n"
        "242.1 Wärmepumpe Sole/Wasser"
    ))
    assert f["generator_type"]["value"] == "ews_wp"


def test_speichervolumen():
    f = extract_features(_pages("Pufferspeicher 1'500 Liter"))
    assert f["storage_volume_l"]["value"] == 1500


def test_erdsonden_count_und_bohrmeter():
    f = extract_features(_pages("4 Erdsonden à 180 m"))
    assert f["borehole_count"]["value"] == 4
    assert f["borehole_total_m"]["value"] == 720


def test_erdsonden_ohne_tiefe_nur_count():
    f = extract_features(_pages("2 Erdsonden für Sole"))
    assert f["borehole_count"]["value"] == 2
    assert f["borehole_total_m"]["value"] is None
    assert f["borehole_total_m"]["confidence"] == "low"


def test_ventile_2_und_3_weg():
    text = "2-Weg-Ventil DN20\nMenge 6 Stk\nMischventil DN25\nMenge 2 Stk"
    f = extract_features(_pages(text))
    assert f["valve_2way_count"]["value"] == 6
    assert f["valve_3way_count"]["value"] == 2


def test_nicht_erwaehnte_features_fehlen():
    f = extract_features(_pages("Nur ein bisschen Text ohne Bauteile"))
    assert "pump_count" not in f
    assert "generator_power_kw" not in f


# ── B8 — BKP-Kosten best-effort ─────────────────────────────────────────────

def test_bkp_betrag_erkannt():
    costs = extract_costs(_pages("BKP 241 Wärmeerzeugung CHF 45'000"))
    assert len(costs) == 1
    assert costs[0]["bkp_nr"] == "241"
    assert costs[0]["detected_amount"] == 45000
    assert costs[0]["confidence"] == "high"


def test_bkp_ohne_betrag_blockiert_nicht():
    costs = extract_costs(_pages("BKP 242 Wärmeverteilung"))
    assert costs[0]["bkp_nr"] == "242"
    assert costs[0]["detected_amount"] is None
    assert costs[0]["confidence"] == "medium"


def test_kosten_werden_aggregiert_nicht_erster_treffer():
    """Mehrere Positionen derselben BKP werden summiert, nicht „erster gewinnt"."""
    text = ("BKP 242 Wärmeerzeugung CHF 45'000\n"
            "BKP 242 Zubehör CHF 5'000\n"
            "BKP 243 Verteilung CHF 30'000")
    costs = {c["bkp_nr"]: c for c in extract_costs(_pages(text))}
    assert costs["242"]["detected_amount"] == 50000     # 45k + 5k summiert
    assert costs["242"]["positionen"] == 2
    assert costs["243"]["detected_amount"] == 30000


def test_pipe_length_extrahiert_oder_manuell():
    # Wird erkannt, wenn Rohr + Laufmeter vorhanden.
    f = extract_features(_pages("Heizungsleitung Stahlrohr\n620 m"))
    assert f["pipe_length_m"]["value"] == 620
    assert f["pipe_length_m"]["confidence"] in ("low", "medium")
    # Ohne Angabe: nicht geraten → bleibt manuell zu erfassen.
    assert "pipe_length_m" not in extract_features(_pages("Nur Text ohne Rohre"))


def test_rohrmeter_aus_abschnitt_ohne_standard_lieferlaenge():
    f = extract_features(_pages(
        "243.1 Rohrleitungen\n"
        "Gasrohre in Herstellungslängen von 6 m\n"
        "DN 15 m 12\n"
        "DN 20 m 18"
    ))
    assert f["pipe_length_m"]["value"] == 30


# ── Block C #10/#11 — Positionsblock-Parser + Bauteilmengen ─────────────────

def test_positionsblock_menge_betrag_getrennt_von_nummer():
    """Nummer oben, Bezeichnung/Menge/Betrag darunter — als ein Block gelesen."""
    from app.lv_import.positions import parse_positions
    text = ("Pos. 241.100\n"
            "Wärmepumpe Sole/Wasser\n"
            "Menge 1 Stk à 25'000.00      25'000.00")
    pos = parse_positions(_pages(text))
    assert len(pos) == 1
    assert pos[0]["pos_nr"] == "241.100"
    assert pos[0]["bkp_nr"] == "241"           # Sub-Position → BKP-Gruppe 241
    assert pos[0]["menge"] == 1
    assert pos[0]["einheit"] == "stk"
    assert pos[0]["betrag"] == 25000.0          # Total, nicht der Einzelpreis
    assert "Wärmepumpe" in pos[0]["beschreibung"]


def test_positionsblock_kosten_je_bkp_aggregiert():
    """Zwei Positionen derselben BKP → summiert; Betrag darf unter der Nummer stehen."""
    text = ("241.1 Wärmepumpe\nMenge 1 Stk  CHF 25'000\n"
            "241.2 Inbetriebnahme\nPauschal  CHF 3'000\n"
            "242.1 Verteiler\nMenge 1 Stk  CHF 8'000")
    costs = {c["bkp_nr"]: c for c in extract_costs(_pages(text))}
    assert costs["241"]["detected_amount"] == 28000     # 25k + 3k
    assert costs["241"]["positionen"] == 2
    assert costs["242"]["detected_amount"] == 8000


def test_bauteilmengen_aus_positionsbloecken_als_fallback():
    """Block-LV ohne enge Mengenzeile: Bauteilmengen kommen aus dem Positionsblock."""
    text = ("242.1 Umwälzpumpe Heizkreis\nHocheffizienz\nMenge 4 Stk\n"
            "242.2 3-Weg-Mischventil\nDN25\nMenge 2 Stk")
    f = extract_features(_pages(text))
    assert f["pump_count"]["value"] == 4
    assert f["valve_3way_count"]["value"] == 2


def test_mengenzeile_ist_kein_positionsstart():
    """Reine Mengen-/Maßzeilen dürfen keine Position eröffnen."""
    from app.lv_import.positions import parse_positions
    pos = parse_positions(_pages("620 m Heizungsleitung\n82 kW\n1'500 Liter"))
    assert pos == []


# ── P0 #1 — OCR / Extraktionsmethode (digital vs. ocr vs. image) ─────────────

def _digital_pdf_bytes(text: str = "Waermepumpe Sole 82 kW") -> bytes:
    """Kleines born-digital PDF mit echter Textebene (reportlab)."""
    import io
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 700, text)
    c.showPage()
    c.save()
    return buf.getvalue()


def test_extract_best_erkennt_digitalen_text():
    """Textebene vorhanden → Methode 'digital'; OCR wird gar nicht erst gebraucht."""
    from app.lv_import.pdf_extract import extract_best
    pages, searchable, method = extract_best(_digital_pdf_bytes("Waermepumpe 82 kW"))
    assert searchable is True
    assert method == "digital"
    assert any("Waermepumpe" in (p["text"] or "") for p in pages)


def test_extract_best_ohne_text_ist_image():
    """Kein Text und kein funktionierendes OCR → 'image'; nichts wird erfunden."""
    from app.lv_import.pdf_extract import extract_best
    pages, searchable, method = extract_best(b"")
    assert searchable is False
    assert method == "image"
    assert pages == []


def test_ist_durchsuchbar_heuristik():
    """Automatische Erkennung Textebene vs. Scan."""
    from app.lv_import.pdf_extract import ist_durchsuchbar
    assert ist_durchsuchbar([{"page": 1, "text": "Pos. 241 Waermepumpe"}]) is True
    assert ist_durchsuchbar([{"page": 1, "text": "   "}]) is False
    assert ist_durchsuchbar([]) is False


def test_ocr_verfuegbar_diagnose():
    """Diagnose meldet die OCR-Kette; wirft nie und ist erst 'ready', wenn alle
    Bausteine da sind (env-unabhängig getestet über die Konsistenz der Flags)."""
    from app.lv_import.pdf_extract import ocr_verfuegbar
    info = ocr_verfuegbar()
    for k in ("pytesseract", "pdf2image", "tesseract_binary", "poppler",
              "deutsch", "languages", "ready"):
        assert k in info
    assert isinstance(info["languages"], list)
    assert info["ready"] == (info["pytesseract"] and info["pdf2image"]
                             and info["tesseract_binary"] and info["deutsch"] and info["poppler"])


# ── B12 — gemeinsame Feature-Sprache ────────────────────────────────────────

def test_feature_keys_mappen_auf_projectcontext():
    from app.project_context import PARAMETER_BY_KEY
    for feature_key, ctx_key in FEATURE_TO_CONTEXT.items():
        assert ctx_key in PARAMETER_BY_KEY, f"{feature_key} → {ctx_key} fehlt im ProjectContext"
    assert context_key("pump_count") == "anzahl_pumpen"
    assert context_key("borehole_total_m") == "bohrmeter"


# ── B1/B11 — Modell + Freigabe-Übernahme (DB) ───────────────────────────────

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401 — registriert hc_users
from app.models.heizungscockpit import HcProject  # noqa: F401 — FK-Ziel project_id
from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
from app.models.kv import RefProjekt, RefKostenzeile, RefProjektFeature


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_lv_import_status_und_features_persistieren():
    db = _db()
    imp = LvImport(tenant_id=1, filename="lv.pdf", file_hash="abc",
                   status=LvImportStatus.review.value, page_count=3)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="3", confidence="high",
                           source_page=17, source_text="Umwälzpumpe … Menge 3 Stk."))
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="241", detected_amount=45000.0, confidence="high"))
    db.commit()

    geladen = db.query(LvImport).first()
    assert geladen.status == "review"
    assert geladen.features[0].key == "pump_count"
    assert geladen.features[0].confirmed is False
    assert geladen.costs[0].detected_amount == 45000.0


def test_lv_import_extract_method_persistiert():
    """P0 #1 — die Herkunft des Textes (digital/ocr/image) bleibt am Import,
    damit das Review sie anzeigen kann."""
    db = _db()
    imp = LvImport(tenant_id=1, filename="scan.pdf", file_hash="ocr1",
                   status=LvImportStatus.review.value, is_searchable=True,
                   extract_method="ocr")
    db.add(imp)
    db.commit()
    assert db.query(LvImport).first().extract_method == "ocr"


def test_freigabe_uebernimmt_in_refprojekt():
    """B11 — erst nach Freigabe entsteht ein RefProjekt mit den bestätigten Werten."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(tenant_id=1, filename="MFH.pdf", file_hash="h", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    # Alle Werte geprüft (bestätigt) — Voraussetzung der Freigabe.
    db.add(LvImportFeature(lv_import_id=imp.id, key="generator_power_kw", value="82", confidence="medium", confirmed=True))
    db.add(LvImportFeature(lv_import_id=imp.id, key="borehole_total_m", value="720", confidence="high", confirmed=True))
    db.add(LvImportFeature(lv_import_id=imp.id, key="generator_type", value="ews_wp", confidence="medium", confirmed=True))
    db.add(LvImportFeature(lv_import_id=imp.id, key="heat_meter_count", value="10",
                           confirmed_value="13", confidence="medium", confirmed=True))
    # Kostenposition wie nach einem geprüften Review: Betrag bestätigt UND
    # Norm-LV-Zuordnung bestätigt — nur dann wird sie Referenzkosten.
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="241", original_position="241.11",
                        original_title="Rohrleitungen Primärkreis",
                        canonical_key="241.11", mapping_confirmed=True,
                        detected_amount=45000.0, confirmed=True))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="Dominic", email="d@x.ch")
    res = approve_lv(imp.id, user=user, db=db)

    assert db.query(LvImport).first().status == "approved"
    ref = db.query(RefProjekt).first()
    assert ref is not None
    assert ref.heizleistung_kw == 82.0
    assert ref.bohrmeter == 720.0
    assert ref.anzahl_waermemessungen == 13          # confirmed_value gewinnt
    assert ref.waermeerzeuger == ["ews_wp"]
    zeile = db.query(RefKostenzeile).first()
    # Referenzkosten tragen die NORM-Nummer und die Norm-Bezeichnung.
    assert zeile.bkp_nr == "241.11" and zeile.betrag_chf == 45000.0
    assert zeile.bkp_name == "Rohrleitungen Primärkreis WP / Erdsondensammler"
    assert res["ref_projekt_id"] == ref.id
    # Kompletter Fingerprint in der generischen Feature-Struktur (alle Merkmale).
    feats = {f.key: f.value for f in db.query(RefProjektFeature).all()}
    assert feats["heat_meter_count"] == "13"
    assert feats["borehole_total_m"] == "720"
    assert "generator_type" in feats


def test_freigabe_blockiert_ohne_bestaetigung():
    """Freigabe nur, wenn alle Werte geprüft (bestätigt/bewusst unbekannt) sind."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace
    from fastapi import HTTPException

    db = _db()
    imp = LvImport(tenant_id=1, filename="x.pdf", file_hash="h3", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="4", confirmed=False))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    try:
        approve_lv(imp.id, user=user, db=db)
        assert False, "Freigabe hätte blockieren müssen"
    except HTTPException as e:
        assert e.status_code == 422
        assert "pump_count" in e.detail["unconfirmed"]
    assert db.query(RefProjekt).count() == 0


def test_manuelle_pruefung_ueberstimmt_fehlgeschlagenes_visual_review():
    """Der Mensch ist das letzte Gate; ein früherer KI-Fehler darf eine
    vollständig bestätigte Auswertung nicht dauerhaft blockieren."""
    import json
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(
        tenant_id=1, filename="manuell.pdf", file_hash="manual",
        status=LvImportStatus.extracted.value,
        debug_json=json.dumps({
            "visual_review_required": True,
            "visual_review_success": False,
            "visual_review_issues": ["KI nicht erreichbar"],
        }),
    )
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(
        lv_import_id=imp.id, key="generator_type",
        value="ews_wp", confirmed=True,
    ))
    db.commit()

    result = approve_lv(
        imp.id,
        user=SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch"),
        db=db,
    )
    assert result["import"]["status"] == "approved"


def test_konditionen_vor_freigabe_manuell_ersetzbar():
    from app.routers.hc_lv_import import update_commercial
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(
        tenant_id=1, filename="konditionen.pdf", file_hash="conditions",
        status=LvImportStatus.review.value,
        debug_json='{"trade_total":100000}',
    )
    db.add(imp)
    db.commit()
    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    result = update_commercial(imp.id, {
        "vat_rate": 8.1,
        "conditions": [
            {"original_label": "Rabatt", "kind": "percent",
             "direction": "deduction", "rate_percent": 6},
            {"original_label": "Sonstiger Abzug", "kind": "fixed",
             "direction": "deduction", "amount": 500},
        ],
    }, user=user, db=db)
    assert len(result["conditions"]) == 2
    assert result["commercial"]["subtotal_excl_vat"] == 93500
    assert result["commercial"]["total_incl_vat"] == 101073.5


def test_freigabe_blockiert_bei_ungepruefter_kostenposition():
    """Item 5: verwendete Kosten (mit Betrag) müssen bestätigt sein."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace
    from fastapi import HTTPException

    db = _db()
    imp = LvImport(tenant_id=1, filename="k.pdf", file_hash="hc", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    # alle Features geprüft, aber die Kostenposition nicht.
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="4", confirmed=True))
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="242", detected_amount=45000.0, confirmed=False))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    try:
        approve_lv(imp.id, user=user, db=db)
        assert False, "hätte blockieren müssen"
    except HTTPException as e:
        assert e.status_code == 422
        assert "242" in e.detail["unconfirmed_costs"]


def test_freigabe_blockiert_bei_ungepruefter_zuordnung():
    """Punkt 12/13 — „Betrag stimmt" ist nicht „Zuordnung stimmt". Solange die
    Norm-LV-Zuordnung einer Position ungeprüft ist, blockiert die Freigabe."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace
    from fastapi import HTTPException

    db = _db()
    imp = LvImport(tenant_id=1, filename="m.pdf", file_hash="hm", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="4", confirmed=True))
    # Betrag geprüft, Zuordnung offen.
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="243", original_position="243.7",
                        original_title="Sicherheitsarmaturen",
                        detected_amount=1200.0, confirmed=True, mapping_confirmed=False))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    try:
        approve_lv(imp.id, user=user, db=db)
        assert False, "hätte blockieren müssen"
    except HTTPException as e:
        assert e.status_code == 422
        assert "243.7" in e.detail["unconfirmed_mappings"]
    assert db.query(RefProjekt).count() == 0


def test_freigabe_summiert_mehrere_originalpositionen_auf_eine_normposition():
    """Punkt 14 — drei Unternehmerzeilen auf derselben Norm-Position ergeben EINE
    Referenzkostenzeile mit der Summe. So sieht ein Import aus wie ein manuell
    nach dem Norm-LV ausgewertetes Projekt."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(tenant_id=1, filename="agg.pdf", file_hash="ha", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="2", confirmed=True))
    for pos, titel, betrag in (
        ("243.1", "Rohrleitungen Stahl", 12000.0),
        ("243.2", "Rohrleitungen Kupfer", 8000.0),
        ("243.9", "Rohrleitungen Verteilung Zusatz", 1500.0),
    ):
        db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="243", original_position=pos,
                            original_title=titel, canonical_key="243.1",
                            mapping_method="rule", mapping_confirmed=True,
                            detected_amount=betrag, confirmed=True))
    # Gruppentotalzeile darf NICHT mitsummiert werden (sonst doppelt).
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="243", original_position="243",
                        original_title="Total Verteilung", is_group_total=True,
                        detected_amount=21500.0, confirmed=True, mapping_confirmed=True))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    approve_lv(imp.id, user=user, db=db)

    zeilen = db.query(RefKostenzeile).all()
    assert len(zeilen) == 1, [(z.bkp_nr, z.betrag_chf) for z in zeilen]
    assert zeilen[0].bkp_nr == "243.1"
    assert zeilen[0].betrag_chf == 21500.0
    # Die Originalzeilen bleiben einzeln erhalten (Nachvollziehbarkeit).
    assert db.query(LvImportCost).count() == 4


def test_nicht_zugeordnete_position_kommt_nicht_in_die_referenz():
    """Punkt 13 — eine Leistung ohne Norm-LV-Entsprechung wird bewusst
    ausgeschlossen (mapping_confirmed ohne canonical_key) und erzeugt keine
    halbstandardisierte Referenzzeile."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(tenant_id=1, filename="aus.pdf", file_hash="hx", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="1", confirmed=True))
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="241", original_position="241.11",
                        original_title="Rohrleitungen Primärkreis",
                        canonical_key="241.11", mapping_confirmed=True,
                        detected_amount=45000.0, confirmed=True))
    # Bewusst ausgeschlossen: geprüft, aber ohne Norm-Position.
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="248", original_position="248.2",
                        original_title="Elektroanschlüsse durch Elektriker",
                        canonical_key=None, mapping_confirmed=True,
                        detected_amount=9000.0, confirmed=True))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    approve_lv(imp.id, user=user, db=db)

    zeilen = {z.bkp_nr: z.betrag_chf for z in db.query(RefKostenzeile).all()}
    assert zeilen == {"241.11": 45000.0}


def test_manuelle_zuordnung_gilt_als_geprueft():
    """Punkt 11 — wer selbst eine Norm-Position wählt, hat die Zuordnung geprüft.
    Ein erfundener Schlüssel wird abgelehnt."""
    from app.routers.hc_lv_import import update_cost
    from types import SimpleNamespace
    from fastapi import HTTPException

    db = _db()
    imp = LvImport(tenant_id=1, filename="man.pdf", file_hash="hmn", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    c = LvImportCost(lv_import_id=imp.id, bkp_nr="247", original_position="247.1",
                     original_title="Isolation Rohrleitungen", detected_amount=3000.0)
    db.add(c)
    db.commit()
    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")

    out = update_cost(imp.id, c.id, {"canonical_key": "248.2"}, user=user, db=db)
    assert out["canonical_key"] == "248.2"
    assert out["mapping_method"] == "manual"
    assert out["mapping_confirmed"] is True

    try:
        update_cost(imp.id, c.id, {"canonical_key": "999.9"}, user=user, db=db)
        assert False, "erfundener Schlüssel hätte 422 liefern müssen"
    except HTTPException as e:
        assert e.status_code == 422
    # Die gültige Zuordnung bleibt unverändert.
    assert db.get(LvImportCost, c.id).canonical_key == "248.2"


def test_grunddaten_fliessen_ins_refprojekt():
    from app.routers.hc_lv_import import approve_lv, update_import
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(tenant_id=1, filename="g.pdf", file_hash="hg", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="4", confirmed=True))
    db.commit()
    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")

    update_import(imp.id, {"ebf_m2": 1420, "anzahl_einheiten": 10, "gebaeudetyp": "MFH"}, user=user, db=db)
    approve_lv(imp.id, user=user, db=db)
    ref = db.query(RefProjekt).first()
    assert ref.ebf_m2 == 1420.0
    assert ref.anzahl_einheiten == 10
    # Punkt 20 — kategoriale Merkmale werden auf den kanonischen Code normalisiert
    # („MFH" → "mfh"), damit die Ähnlichkeit nicht an Schreibweisen scheitert.
    assert ref.gebaeudetyp == "mfh"


def test_unbekannter_kategorialer_wert_wird_abgelehnt():
    """Punkt 20 — keine neue Freitext-Schreibweise in vergleichsrelevanten Feldern."""
    from app.routers.hc_lv_import import update_import
    from types import SimpleNamespace
    from fastapi import HTTPException

    db = _db()
    imp = LvImport(tenant_id=1, filename="z.pdf", file_hash="hz", status=LvImportStatus.review.value)
    db.add(imp)
    db.commit()
    user = SimpleNamespace(id=1, tenant_id=1, name="D", email="d@x.ch")
    try:
        update_import(imp.id, {"zertifizierung": "Irgendein Fantasielabel"}, user=user, db=db)
        assert False, "hätte 422 liefern müssen"
    except HTTPException as e:
        assert e.status_code == 422
        assert e.detail["feld"] == "zertifizierung"
        assert "minergie_p" in e.detail["erlaubt"]


def test_nicht_freigegeben_hat_kein_refprojekt():
    db = _db()
    imp = LvImport(tenant_id=1, filename="x.pdf", file_hash="h2", status=LvImportStatus.review.value)
    db.add(imp)
    db.commit()
    assert db.query(RefProjekt).count() == 0
    assert imp.ref_projekt_id is None
