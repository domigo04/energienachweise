"""Grobkostenschätzung (BKP) — eigenständiges Modul, getrennt von den
bestehenden KV-Tabellen in kv.py (RefProjekt/RefKostenzeile), damit nichts
aus der bisherigen Auswertung/Kostenschätzung überschrieben wird. Siehe
CLAUDE.md, Abschnitt "Grobkostenschätzung (BKP)" für die Einordnung.

- ReferenzProjekt: ein abgeschlossenes, reales Projekt (Stufe 1 Pflicht,
  Stufe 2 optional/nullable — verbessert Faktor-Brücke, ist aber nicht nötig).
- BkpBetrag: eine BKP-GRUPPE (241/242/243/247/248/249, nicht Einzelposition)
  mit Betrag, viele je ReferenzProjekt.
- Korrekturfaktor: Zuschlag (Sanierung/Weiterbetrieb/Etappierung), editierbar.
"""
from datetime import datetime
import enum

from sqlalchemy import Boolean, Column, Date, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Gebaeudekategorie(str, enum.Enum):
    efh = "EFH"
    mfh_2_5 = "MFH_2_5"
    mfh_6_10 = "MFH_6_10"
    mfh_11plus = "MFH_11plus"
    gewerbe = "Gewerbe"
    industrie = "Industrie"


class Projektart(str, enum.Enum):
    neubau = "Neubau"
    sanierung = "Sanierung"
    ersatz_we = "Ersatz_WE"


class WpTyp(str, enum.Enum):
    sole = "sole"
    luft = "luft"
    wasser = "wasser"


class AbgabeDominant(str, enum.Enum):
    fbh = "FBH"
    hk = "HK"
    gemischt = "gemischt"
    luft = "Luft"


class ReferenzProjekt(Base):
    __tablename__ = "referenz_projekte"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    name = Column(String, nullable=False)

    # Stufe 1 — Pflicht
    ebf_m2 = Column(Float, nullable=False)
    leistung_kw = Column(Float, nullable=False)
    gebaeudekategorie = Column(SAEnum(Gebaeudekategorie), nullable=False)
    projektart = Column(SAEnum(Projektart), nullable=False)
    wp_typ = Column(SAEnum(WpTyp), nullable=False)
    abgabe_dominant = Column(SAEnum(AbgabeDominant), nullable=False)
    anzahl_ne = Column(Integer, nullable=False)
    hat_erdsonden = Column(Boolean, nullable=False, default=False)
    datum_abrechnung = Column(Date, nullable=False)

    # Stufe 2 — optional, verbessert die Faktor-Brücke (Weg B)
    rohrmeter = Column(Float, nullable=True)
    bohrmeter = Column(Float, nullable=True)
    hk_anzahl = Column(Integer, nullable=True)
    verteiler_abgaenge = Column(Integer, nullable=True)
    fbh_flaeche_m2 = Column(Float, nullable=True)
    anzahl_heizgruppen = Column(Integer, nullable=True)
    etappierung = Column(Boolean, nullable=True)
    weiterbetrieb_umbau = Column(Boolean, nullable=True)

    erstellt_von = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bkp_betraege = relationship("BkpBetrag", back_populates="referenz_projekt", cascade="all, delete-orphan")


class BkpBetrag(Base):
    __tablename__ = "bkp_betraege"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    referenz_projekt_id = Column(Integer, ForeignKey("referenz_projekte.id"), index=True)
    bkp_gruppe = Column(String, nullable=False)  # "241"/"242"/"243"/"247"/"248"/"249"
    betrag_chf = Column(Float, nullable=False)

    referenz_projekt = relationship("ReferenzProjekt", back_populates="bkp_betraege")


class Korrekturfaktor(Base):
    __tablename__ = "korrekturfaktoren"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    name = Column(String, nullable=False)
    faktor = Column(Float, nullable=False)
    aktiv = Column(Boolean, default=True)
