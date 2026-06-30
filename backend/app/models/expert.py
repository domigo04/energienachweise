# backend/app/models/expert.py
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, func
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON  # falls SQLite
from sqlalchemy.dialects.postgresql import JSONB  # falls später Postgres
from . import Base

# Wir nutzen einen JSON-ähnlichen Typ für fachbereiche.
# Bei SQLite fällt das auf TEXT zurück, was für MVP ok ist.
try:
    JSONType = JSONB  # bevorzugt Postgres
except Exception:
    JSONType = SQLITE_JSON  # fallback für SQLite

class Expert(Base):
    __tablename__ = "experts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    company = Column(String(120), nullable=True)
    email = Column(String(180), nullable=False, unique=True, index=True)
    region = Column(String(120), nullable=True)  # z.B. "Zürich", "Zentralschweiz"
    fachbereiche = Column(JSONType, nullable=False)  # z.B. ["Heizung", "Lüftung"]
    description = Column(String(1000), nullable=True)
    hourly_rate = Column(Float, nullable=True)  # CHF pro Stunde (optional)
    is_verified = Column(Boolean, default=False)  # Admin schaltet frei
    is_premium = Column(Boolean, default=False)   # Abo/Premium-Platzierung (später)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
