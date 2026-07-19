"""Grobkostenschätzung (BKP) — nur noch die Korrekturfaktoren als eigene
Tabelle. Die Referenzdaten kommen seit der Umstrukturierung 2026-07-14 aus der
AUSWERTUNG (models/kv.py: RefProjekt/RefKostenzeile) — es gibt bewusst KEINE
parallele Referenzprojekt-Datenbank mehr (Dominics Feedback: eine Wissensbasis,
die Schätzung läuft im Projekt und rechnet auf den ausgewerteten Projekten).
Die frühere ReferenzProjekt/BkpBetrag-Tabelle wird in main.py::_ensure_columns
einmalig gedroppt (war nie deployed, enthielt nur Demo-Daten).
"""
import enum

from sqlalchemy import Boolean, Column, Float, Integer, String

from app.database import Base


class WpTyp(str, enum.Enum):
    sole = "sole"
    luft = "luft"
    wasser = "wasser"


class AbgabeDominant(str, enum.Enum):
    fbh = "FBH"
    hk = "HK"
    gemischt = "gemischt"
    luft = "Luft"


class Korrekturfaktor(Base):
    __tablename__ = "korrekturfaktoren"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    name = Column(String, nullable=False)
    faktor = Column(Float, nullable=False)
    aktiv = Column(Boolean, default=True)
