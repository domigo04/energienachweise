from app.lv_import.review_packet import build_review_packet


def test_review_packet_bleibt_kompakt_und_prueft_summen():
    review = build_review_packet(
        {
            "pump_count": {"value": 3, "confidence": "high", "source_page": 7},
            "pipe_length_source_m": {"value": 40},
            "pipe_length_distribution_m": {"value": 60},
            "pipe_length_m": {"value": 90},
        },
        [{
            "original_position": "242.1",
            "original_title": "Umwälzpumpen",
            "canonical_key": "pumpen",
            "detected_amount": 12000,
        }],
    )
    assert review["estimated_tokens"] < 300
    assert review["packet"]["features"]["pump_count"]["value"] == 3
    assert {check["code"] for check in review["deterministic_checks"]} == {"pipe_total_mismatch"}


def test_review_packet_begrenzt_positionen_fuer_kleine_tokenkosten():
    positions = [
        {"pos_nr": f"243.{index}", "beschreibung": "Rohrleitung", "menge": 1, "einheit": "m"}
        for index in range(180)
    ]
    review = build_review_packet({}, [], positions)
    assert len(review["packet"]["positions"]) == 120
