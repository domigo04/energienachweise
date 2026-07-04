from typing import Optional

from fastapi import APIRouter

from app.data.bkp_positionen import BKP_GRUPPEN, filter_positionen

router = APIRouter(prefix="/api/v1/bkp", tags=["Heizungscockpit – BKP Kostenschätzung"])


@router.get("/positionen")
def get_positionen(wp_typ: Optional[str] = None, kategorie: Optional[str] = None):
    """Gefilterte BKP-Positionen für WP-Typ + Gebäudekategorie.

    Beispiel: /api/v1/bkp/positionen?wp_typ=sole_wasser&kategorie=MFH_6_10
    (Phase 3 baut die Kostenschätzung darauf auf — Katalog steht ab Tag 1.)
    """
    positionen = filter_positionen(wp_typ, kategorie)
    return {
        "wp_typ": wp_typ,
        "kategorie": kategorie,
        "anzahl": len(positionen),
        "gruppen": BKP_GRUPPEN,
        "positionen": positionen,
    }
