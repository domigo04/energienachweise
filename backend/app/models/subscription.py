"""Projektnummern, Firmenpläne, Feature-Freischaltungen und Nutzung.

Bewusst EIN Modul: die vier Themen hängen zusammen (eine Firma hat einen Plan,
der Plan erlaubt Features, Overrides verschieben das, Nutzung zählt dagegen)
und teilen dieselbe Mandantenachse `company_id` — das ist die bestehende
`hc_firmen.id`, in Projekten und Benutzern `tenant_id` genannt.

Keine Zahlungsabwicklung. Nur die Grundlage: Pläne, Features, Overrides,
firmeninterne Schalter, Limits und Verbrauch.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class ProjectNumberSequence(Base):
    """Laufende Projektnummer je Firma und Kalenderjahr.

    Eine eigene Zeile statt `SELECT MAX(...)+1`: nur so lässt sich die Vergabe
    sperren und damit bei gleichzeitigem Anlegen zweier Projekte eine doppelte
    Nummer ausschliessen. `last_sequence` wird nie zurückgesetzt — eine gelöschte
    Nummer wird dadurch nicht neu vergeben.
    """

    __tablename__ = "project_number_sequences"
    __table_args__ = (
        UniqueConstraint("company_id", "year", name="uq_project_seq_company_year"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False)
    last_sequence = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SubscriptionPlan(Base):
    """Ein buchbarer Plan. Preise stehen bewusst noch nicht drin."""

    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    features = relationship("PlanFeature", back_populates="plan",
                            cascade="all, delete-orphan")


class PlanFeature(Base):
    """Was ein Plan erlaubt — und in welcher Menge."""

    __tablename__ = "plan_features"
    __table_args__ = (
        UniqueConstraint("plan_id", "feature_key", name="uq_plan_feature"),
    )

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=False)
    # None = unbegrenzt. Bedeutung je Schlüssel siehe app.plan_features.LIMITS.
    limit_value = Column(Integer, nullable=True)
    configuration = Column(Text, nullable=True)      # JSON für seltene Sonderfälle
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    plan = relationship("SubscriptionPlan", back_populates="features")


class CompanyFeatureOverride(Base):
    """Abweichung vom Plan für EINE Firma — gesetzt vom Plattformadmin.

    Schlägt den Plan in beide Richtungen: ein Pilotkunde bekommt ein Feature
    ausserhalb seines Plans, ein auffälliger Kunde verliert eines trotz Plan.
    """

    __tablename__ = "company_feature_overrides"
    __table_args__ = (
        UniqueConstraint("company_id", "feature_key", name="uq_company_override"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("hc_firmen.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False, index=True)
    enabled = Column(Boolean, nullable=True)         # None = nur das Limit ändern
    limit_value = Column(Integer, nullable=True)
    reason = Column(String, nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompanyFeatureSetting(Base):
    """Firmeninterner Schalter — gesetzt vom Firmenadmin.

    Kann ein erlaubtes Feature abschalten, aber nie eines freischalten, das der
    Plan nicht hergibt. Fehlt die Zeile, gilt das Feature als eingeschaltet.
    """

    __tablename__ = "company_feature_settings"
    __table_args__ = (
        UniqueConstraint("company_id", "feature_key", name="uq_company_setting"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("hc_firmen.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False, index=True)
    internally_enabled = Column(Boolean, nullable=False, default=True)
    updated_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FeatureUsage(Base):
    """Verbrauch je Firma, Feature und Abrechnungsperiode.

    `usage_count` zählt Vorgänge (z.B. KI-Importe), `usage_amount` hält den
    tatsächlichen oder geschätzten Geldbetrag (z.B. API-Kosten in USD).
    """

    __tablename__ = "feature_usage"
    __table_args__ = (
        UniqueConstraint("company_id", "feature_key", "period_start",
                         name="uq_feature_usage_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("hc_firmen.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False, index=True)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    usage_count = Column(Integer, nullable=False, default=0)
    usage_amount = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
