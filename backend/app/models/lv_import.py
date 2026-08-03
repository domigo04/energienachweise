"""B1 — LV-Import-Datenmodell. Getrennt von RefProjekt: Importdaten werden erst
NACH ausdrücklicher Freigabe (B11) in die Referenzstruktur übernommen. Nicht
freigegebene Imports dürfen nie in der Kostenschätzung rechnen."""
from datetime import datetime
import enum

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, Boolean,
)
from sqlalchemy.orm import relationship

from app.database import Base


class LvImportStatus(str, enum.Enum):
    uploaded = "uploaded"
    extracted = "extracted"
    review = "review"
    approved = "approved"
    failed = "failed"


class LvImport(Base):
    __tablename__ = "lv_imports"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), nullable=True, index=True)
    filename = Column(String, nullable=False)
    file_hash = Column(String, nullable=False, index=True)     # SHA-256 des Originals
    original_pdf = Column(LargeBinary, nullable=True)          # Original nie überschreiben
    page_count = Column(Integer, nullable=False, default=0)
    is_searchable = Column(Boolean, nullable=False, default=True)  # born-digital vs. Bild-PDF
    # Herkunft des Textes (P0 #1): "digital" = Textebene, "ocr" = per OCR erkannt,
    # "image" = kein Text gefunden. Wird im Review angezeigt, damit sichtbar ist,
    # ob ein Wert aus Digitaltext oder OCR stammt.
    extract_method = Column(String, nullable=True)
    status = Column(String, nullable=False, default=LvImportStatus.uploaded.value)
    ref_projekt_id = Column(Integer, nullable=True)            # gesetzt nach Freigabe
    # Projektgrunddaten (im Review ergänzbar) → fliessen bei Freigabe ins RefProjekt.
    ebf_m2 = Column(Float, nullable=True)
    anzahl_einheiten = Column(Integer, nullable=True)
    # Punkt 20 — kategoriale Werte tragen kanonische Codes aus app.fachwerte,
    # keine Freitexte. Freitext wäre für die Ähnlichkeit unbrauchbar.
    gebaeudetyp = Column(String, nullable=True)      # building_uses-Code
    projektart = Column(String, nullable=True)       # project_types-Code
    ausbauumfang = Column(String, nullable=True)     # scope_levels-Code
    zertifizierung = Column(String, nullable=True)   # certifications-Code
    region = Column(String, nullable=True)
    # Punkt 19 — aus dem Deckblatt erkannte Projektangaben.
    projekt_name = Column(String, nullable=True)
    projekt_nummer = Column(String, nullable=True)
    ort = Column(String, nullable=True)
    unternehmer = Column(String, nullable=True)
    offert_datum = Column(String, nullable=True)
    gewerk = Column(String, nullable=True)
    waehrung = Column(String, nullable=True)
    # Punkt 25/30 — Verarbeitungsbericht (Seitenklassen, Trefferzahlen) als JSON
    # für die Import-Zusammenfassung und den Debug-Dump.
    debug_json = Column(Text, nullable=True)
    created_by = Column(Integer, nullable=True, index=True)
    created_by_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    features = relationship("LvImportFeature", back_populates="lv_import",
                            cascade="all, delete-orphan")
    costs = relationship("LvImportCost", back_populates="lv_import",
                         cascade="all, delete-orphan")
    conditions = relationship("LvImportCondition", back_populates="lv_import",
                              cascade="all, delete-orphan")
    systems = relationship("LvImportSystem", back_populates="lv_import",
                           cascade="all, delete-orphan")


class LvImportFeature(Base):
    __tablename__ = "lv_import_features"

    id = Column(Integer, primary_key=True, index=True)
    lv_import_id = Column(Integer, ForeignKey("lv_imports.id"), nullable=False, index=True)
    key = Column(String, nullable=False)          # gemeinsame Feature-Sprache (feature_keys)
    value = Column(String, nullable=True)          # erkannter Wert (Text; None = unbekannt)
    unit = Column(String, nullable=True)
    confidence = Column(String, nullable=True)     # high | medium | low
    source_page = Column(Integer, nullable=True)
    source_text = Column(Text, nullable=True)       # EINE kompakte Fundstellenzeile
    # Punkt 12: wenige relevante Zeilen statt ganzer Seitenblöcke, plus optional
    # die Position im PDF. Der Rechenweg abgeleiteter Werte (z.B. „6 × 150 m")
    # bleibt als derived_from sichtbar.
    source_excerpt = Column(Text, nullable=True)
    source_bbox = Column(String, nullable=True)
    derived_from = Column(String, nullable=True)
    confirmed_value = Column(String, nullable=True) # vom Nutzer bestätigt/korrigiert
    confirmed = Column(Boolean, nullable=False, default=False)
    # Handschriftliche Korrekturen: In ausgefüllten Offerten wird der gedruckte
    # Wert oft durchgestrichen und von Hand überschrieben. Beide Stände bleiben
    # nachvollziehbar; `selected_source` sagt, welcher gilt, und `requires_review`
    # zwingt zur menschlichen Prüfung, wenn die Handschrift nicht eindeutig ist.
    printed_value = Column(String, nullable=True)     # gedruckter Originalwert
    corrected_value = Column(String, nullable=True)   # handschriftliche Korrektur
    selected_source = Column(String, nullable=True)   # printed | corrected
    requires_review = Column(Boolean, nullable=False, default=False)

    lv_import = relationship("LvImport", back_populates="features")


class LvImportCost(Base):
    __tablename__ = "lv_import_costs"

    id = Column(Integer, primary_key=True, index=True)
    lv_import_id = Column(Integer, ForeignKey("lv_imports.id"), nullable=False, index=True)
    bkp_nr = Column(String, nullable=False)          # BKP-Gruppe, z.B. "241"
    # Punkt 14 — die Detailinformation bleibt erhalten: Originalnummer und
    # Originaltitel der Position, dazu der kanonische Schlüssel (Punkt 17), weil
    # Planer Unterpositionen je Projekt unterschiedlich nummerieren.
    original_position = Column(String, nullable=True)    # Quellnummer, z.B. "243.5"
    original_title = Column(String, nullable=True)
    section_path = Column(String, nullable=True)
    canonical_key = Column(String, nullable=True, index=True)   # Norm-LV-Position
    original_amount = Column(Float, nullable=True)              # wie im LV gelesen
    # Quellhierarchie getrennt vom Ziel: die laufende Nummer des Unternehmers
    # ist NICHT die Nummer im Norm-LV. `source_parent_bkp` ist die Haupt-BKP der
    # Quelle (z.B. "243"), `source_scope_summary` fasst den enthaltenen
    # Leistungsumfang in einem Satz zusammen — er ist die Grundlage der
    # semantischen Zuordnung.
    source_parent_bkp = Column(String, nullable=True)
    source_scope_summary = Column(Text, nullable=True)
    source_bbox = Column(String, nullable=True)
    # Eine Quellposition kann fachlich mehrere Norm-LV-Positionen abdecken
    # (z.B. „Speicher / Frischwasserstation"). Der Betrag wird dabei NICHT
    # aufgeteilt — er zählt genau einmal beim primären Schlüssel.
    included_norm_keys = Column(String, nullable=True)   # kommasepariert
    amount_allocation = Column(String, nullable=True)    # not_split | single
    requires_review = Column(Boolean, nullable=False, default=False)
    # Wie die Zuordnung zustande kam: exact | rule | llm | manual. Zusammen mit
    # confidence/reason bleibt später messbar, wie gut die automatische Zuordnung
    # (insbesondere das LLM) wirklich ist.
    mapping_method = Column(String, nullable=True)
    mapping_confidence = Column(Float, nullable=True)
    mapping_reason = Column(String, nullable=True)
    # Zwei getrennte Prüfungen — sie beantworten verschiedene Fragen:
    #   confirmed          → „CHF 2'407 stimmt"
    #   mapping_confirmed  → „die Norm-LV-Zuordnung 241.11 stimmt"
    # Bei einer Position ohne Norm-Entsprechung bedeutet mapping_confirmed:
    # „geprüft, es gibt keine passende Position — bewusst nicht in die Referenz".
    mapping_confirmed = Column(Boolean, nullable=False, default=False)
    # Punkt 15 — Gruppentotal als eigene Kontrollzeile inkl. Summenprüfung.
    is_group_total = Column(Boolean, nullable=False, default=False)
    validation_status = Column(String, nullable=True)    # valid | mismatch | unchecked
    source = Column(String, nullable=True)               # cost_summary | lv_positions | manual
    detected_amount = Column(Float, nullable=True)
    confirmed_amount = Column(Float, nullable=True)  # später massgebend (B8)
    confidence = Column(String, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_text = Column(Text, nullable=True)
    positionen = Column(Integer, nullable=False, default=1)   # aggregierte Einzelpositionen
    confirmed = Column(Boolean, nullable=False, default=False)
    manual = Column(Boolean, nullable=False, default=False)   # manuell hinzugefügt

    lv_import = relationship("LvImport", back_populates="costs")


class LvImportCondition(Base):
    __tablename__ = "lv_import_conditions"

    id = Column(Integer, primary_key=True, index=True)
    lv_import_id = Column(Integer, ForeignKey("lv_imports.id"), nullable=False, index=True)
    original_label = Column(String, nullable=False)
    kind = Column(String, nullable=False)             # percent | fixed
    direction = Column(String, nullable=False)        # deduction | surcharge
    rate_percent = Column(Float, nullable=True)
    amount = Column(Float, nullable=True)
    basis_amount = Column(Float, nullable=True)
    calculated_amount = Column(Float, nullable=True)
    running_total = Column(Float, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    source_page = Column(Integer, nullable=True)
    # Ein Rabattfeld mit «Anfrage» ist kein Abzug von 0, sondern eine offene
    # Verhandlungsposition. Ohne diese Unterscheidung würde ein leeres Feld als
    # bestätigter Nullabzug in die Referenz wandern.
    status = Column(String, nullable=False, default="priced")  # priced | requested_not_priced

    lv_import = relationship("LvImport", back_populates="conditions")


class LvImportSystem(Base):
    """Anlagensysteme aus dem LV — Wärmeabgabe und Wärmeerzeugung.

    Beide sind mehrwertig und tragen mehr als einen Code: Anzahl, Lieferant,
    Monteur, Fabrikat. Ein einzelnes Feature-Feld kann das nicht abbilden,
    darum eine schmale gemeinsame Tabelle statt zweier Sonderstrukturen.
    """

    __tablename__ = "lv_import_systems"

    id = Column(Integer, primary_key=True, index=True)
    lv_import_id = Column(Integer, ForeignKey("lv_imports.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)          # heat_emission | heat_generation
    type_code = Column(String, nullable=False)     # Code aus fachwerte
    source_label = Column(String, nullable=True)   # Wortlaut im Dokument
    count = Column(Integer, nullable=True)
    capacity_kw = Column(Float, nullable=True)
    manufacturer = Column(String, nullable=True)
    model = Column(String, nullable=True)
    # Wer liefert, wer montiert: bauseits geliefert und vom Heizungsunternehmer
    # montiert ist ein anderer Preis als beides durch den Unternehmer.
    supplied_by = Column(String, nullable=True)     # contractor | others
    installation_by = Column(String, nullable=True)
    scope_status = Column(String, nullable=True)    # fachwerte.scope_status
    existing_or_new = Column(String, nullable=True)  # existing | new
    confidence = Column(Float, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_text = Column(Text, nullable=True)
    confirmed = Column(Boolean, nullable=False, default=False)

    lv_import = relationship("LvImport", back_populates="systems")
