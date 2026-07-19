"""KV-Tool-Modelle: Referenzprojekte (Auswertung) + gespeicherte Kostenschätzung.

- RefProjekt: ein abgeschlossenes, reales Projekt mit seinen BKP-Kosten.
  Firmenweit (tenant_id) — alle in der Firma pflegen dieselbe Wissensdatenbank.
- RefKostenzeile: eine BKP-Position mit Betrag, viele je RefProjekt.
- Kostenschaetzung: das Ergebnis einer Schätzung, je Projekt gespeichert.

Mehrfach-Systeme (Wärmeerzeuger/-abgabe) liegen als JSON-Liste — schlank; für
die Ähnlichkeit zählt die Menge, nicht eine normalisierte Nebentabelle.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class RefProjekt(Base):
    __tablename__ = "ref_projekte"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    name = Column(String, nullable=False)

    # Merkmale für die Ähnlichkeit
    projektart = Column(String, nullable=True)      # Neubau / Umbau / Sanierung / ...
    gebaeudetyp = Column(String, nullable=True)     # MFH / EFH / Büro / ...
    ausbauumfang = Column(String, nullable=True)    # Vollausbau / Grundausbau / ...
    zertifizierung = Column(String, nullable=True)  # keine / Minergie / ...
    anlagenkonfiguration = Column(String, nullable=True)  # monovalent/bivalent/hybrid/kaskadiert/redundant
    waermeerzeuger = Column(JSON, default=list)     # ["Erdsonden-WP", ...] (mehrere)
    waermeabgabe = Column(JSON, default=list)       # ["FBH", "Heizkörper", ...] (mehrere)
    # Schnittstelle Brauchwarmwasser: True = BWW war Teil der Heizungs-Kosten
    # (nicht Sanitär). Weiches Ähnlichkeits-Kriterium, bewusst KEIN Hard-Filter
    # (Dominic 2026-07-14). None = nicht erfasst (Altbestand).
    bww_bei_heizung = Column(Boolean, nullable=True)
    # Ausführungs-Merkmale (dieselben, die im Zielprojekt die Korrekturfaktoren
    # auslösen — so tragen auch Referenzen diese Info). None = nicht erfasst.
    weiterbetrieb_umbau = Column(Boolean, nullable=True)
    etappierung = Column(Boolean, nullable=True)

    # Bezugsgrössen (Treiber der Kennwerte)
    ebf_m2 = Column(Float, nullable=True)
    bohrmeter = Column(Float, nullable=True)        # nur bei Erdsonden-Kreislauf
    heizleistung_kw = Column(Float, nullable=True)  # Erzeugerleistung
    anzahl_einheiten = Column(Integer, nullable=True)

    # Weitere Bezugsgrössen (zusätzliche Ähnlichkeits-Faktoren, Dominic 2026-07-09,
    # analog "Positionen" in der 3-Plan-Vorlage) — je feiner die Bezugsgrösse,
    # desto stimmiger der Kennwert-Vergleich zwischen Referenzprojekten.
    installierte_leistung_neu_kw = Column(Float, nullable=True)
    flaeche_fbh_m2 = Column(Float, nullable=True)
    flaeche_tabs_m2 = Column(Float, nullable=True)
    flaeche_deckenstrahlplatten_m2 = Column(Float, nullable=True)
    anzahl_heizkoerper = Column(Integer, nullable=True)
    anzahl_waermemessungen = Column(Integer, nullable=True)
    anzahl_schaltgeraetekombinationen = Column(Integer, nullable=True)
    laufmeter_rohre_heizung = Column(Float, nullable=True)

    datum = Column(Date, nullable=True)             # bestimmt die Alters-Gewichtung
    qualitaet = Column(Float, default=1.0)          # 0..1, Vertrauen in die Referenz
    erstellt_von = Column(Integer, nullable=True)   # User-ID
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    kostenzeilen = relationship(
        "RefKostenzeile", back_populates="ref_projekt", cascade="all, delete-orphan"
    )
    gewerke = relationship(
        "RefProjektGewerk", back_populates="ref_projekt", cascade="all, delete-orphan"
    )


class RefKostenzeile(Base):
    __tablename__ = "ref_kostenzeilen"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    ref_projekt_id = Column(Integer, ForeignKey("ref_projekte.id"), index=True)
    # Gewerk, zu dem diese BKP-Position gehört ("heizung" | "lueftung" | "sanitaer" | "kaelte").
    # Default "heizung", damit bestehende Zeilen (vor der HLKS-Erweiterung) gültig bleiben.
    gewerk = Column(String, nullable=False, default="heizung")
    bkp_nr = Column(String, nullable=False)         # z.B. "242.3"
    bkp_name = Column(String, nullable=True)
    betrag_chf = Column(Float, nullable=False, default=0.0)  # Brutto-Betrag

    ref_projekt = relationship("RefProjekt", back_populates="kostenzeilen")


class RefProjektGewerk(Base):
    """Rabatt/Skonto/Korrektur je Gewerk eines Referenzprojekts (analog 3-Plan-
    Vorlage). Netto wird daraus abgeleitet, nicht gespeichert:
    netto = brutto × (1 − rabatt%) × (1 − skonto%) — siehe
    calculations/kostenschaetzung.py netto_aus_brutto()."""
    __tablename__ = "ref_projekt_gewerke"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    ref_projekt_id = Column(Integer, ForeignKey("ref_projekte.id"), index=True)
    gewerk = Column(String, nullable=False)  # "heizung" | "lueftung" | "sanitaer" | "kaelte"
    rabatt_pct = Column(Float, nullable=False, default=0.0)
    skonto_pct = Column(Float, nullable=False, default=0.0)
    korrektur_betrag_chf = Column(Float, nullable=False, default=0.0)

    ref_projekt = relationship("RefProjekt", back_populates="gewerke")


class Kostenschaetzung(Base):
    __tablename__ = "kostenschaetzungen"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), unique=True, index=True)
    inputs_json = Column(Text, nullable=False, default="{}")
    result_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BauindexEintrag(Base):
    """Baupreisindex-Wert für eine Periode (halbjährlich, BFS). Verhältnis
    zwischen zwei Perioden skaliert ältere Referenz-Kosten auf heutiges
    Preisniveau (calculations/kostenschaetzung.index_faktor). Firmenweit wie
    die übrigen KV-Tabellen (tenant_id), auch wenn die Rohdaten national sind."""
    __tablename__ = "bauindex_eintraege"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    periode = Column(Date, nullable=False, unique=True)
    wert = Column(Float, nullable=False)
    quelle = Column(String, default="manuell")  # "manuell" | "bfs-automatisch"
    created_at = Column(DateTime, default=datetime.utcnow)
