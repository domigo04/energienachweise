"""Vergabe der Projektnummer — je Firma, je Kalenderjahr, fortlaufend.

Format: zweistelliges Jahr + dreistellige laufende Nummer, ohne Trennzeichen.

    2026, erstes Projekt   → 26001
    2026, zwölftes Projekt → 26012
    2027, erstes Projekt   → 27001

Warum eine eigene Sequenztabelle und nicht `SELECT MAX(nummer) + 1`:

1. Zwei gleichzeitige Anlagevorgänge würden denselben Höchstwert lesen und
   dieselbe Nummer vergeben. Die Sequenzzeile lässt sich sperren, der Höchstwert
   einer Spalte nicht.
2. Eine gelöschte Nummer würde beim Maximum wieder frei. Der Zähler in der
   Sequenztabelle läuft weiter und vergibt sie nie erneut.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.subscription import ProjectNumberSequence
from app.plan_features import PROJECT_SEQUENCE_LIMIT_REACHED

MAX_SEQUENCE = 999
MAX_VERSUCHE = 3


class ProjectSequenceLimitReached(Exception):
    """Mehr als 999 Projekte einer Firma in einem Jahr.

    Bewusst ein Fehler statt einer stillschweigend sechsstelligen Nummer: das
    Format ist Teil der Projektbezeichnung und darf sich nicht unbemerkt ändern.
    """

    code = PROJECT_SEQUENCE_LIMIT_REACHED

    def __init__(self, company_id: int, year: int):
        self.company_id = company_id
        self.year = year
        super().__init__(
            f"Für {year} sind bereits {MAX_SEQUENCE} Projektnummern vergeben."
        )


def formatiere(year: int, sequence: int) -> str:
    """(2026, 3) → '26003'. Immer fünfstellig, ohne Bindestrich."""
    return f"{year % 100:02d}{sequence:03d}"


def _ist_postgres(db: Session) -> bool:
    return db.bind is not None and db.bind.dialect.name == "postgresql"


def _sequenzzeile(db: Session, company_id: int, year: int) -> ProjectNumberSequence:
    """Sequenzzeile holen und sperren; fehlt sie, sicher anlegen.

    Auf PostgreSQL sperrt `FOR UPDATE` die Zeile bis zum Commit. SQLite kennt
    das nicht, serialisiert Schreibvorgänge aber ohnehin auf Dateiebene — der
    Unique-Constraint bleibt in beiden Fällen die letzte Absicherung.
    """
    abfrage = db.query(ProjectNumberSequence).filter(
        ProjectNumberSequence.company_id == company_id,
        ProjectNumberSequence.year == year,
    )
    if _ist_postgres(db):
        abfrage = abfrage.with_for_update()
    zeile = abfrage.one_or_none()
    if zeile is not None:
        return zeile

    # Zwei gleichzeitige Erstanlagen desselben Jahres: eine gewinnt, die andere
    # läuft in den Unique-Constraint und liest danach die fremde Zeile.
    zeile = ProjectNumberSequence(company_id=company_id, year=year, last_sequence=0)
    db.add(zeile)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        abfrage = db.query(ProjectNumberSequence).filter(
            ProjectNumberSequence.company_id == company_id,
            ProjectNumberSequence.year == year,
        )
        if _ist_postgres(db):
            abfrage = abfrage.with_for_update()
        zeile = abfrage.one()
    return zeile


def naechste_nummer(db: Session, company_id: int, year: int) -> tuple[str, int, int]:
    """Nächste Projektnummer reservieren.

    Läuft in der aufrufenden Transaktion: der Zähler wird erst mit dem Projekt
    zusammen wirksam. Bricht die Erstellung ab, ist auch die Nummer nicht
    verbraucht.

    Returns:
        (nummer, year, sequence)
    """
    for versuch in range(MAX_VERSUCHE):
        zeile = _sequenzzeile(db, company_id, year)
        naechste = (zeile.last_sequence or 0) + 1
        if naechste > MAX_SEQUENCE:
            raise ProjectSequenceLimitReached(company_id, year)
        zeile.last_sequence = naechste
        zeile.updated_at = datetime.utcnow()
        try:
            db.flush()
        except IntegrityError:
            # Nur der Unique-Constraint auf (company_id, project_number) kann
            # hier noch greifen — dann ist eine parallele Anlage schneller
            # gewesen. Erneut versuchen statt mit 500 abzubrechen.
            db.rollback()
            if versuch == MAX_VERSUCHE - 1:
                raise
            continue
        return formatiere(year, naechste), year, naechste
    raise RuntimeError("Projektnummer konnte nicht vergeben werden")


def jahr_von(eroeffnet_am: datetime | None) -> int:
    """Jahr aus dem Eröffnungsdatum — sonst die Serverzeit.

    Das Datum kommt nie ungeprüft aus dem Browser: `create_project` reicht
    entweder ein serverseitig gesetztes Datum durch oder gar keines.
    """
    return (eroeffnet_am or datetime.utcnow()).year


def sequenz_nachziehen(db: Session, company_id: int, year: int, sequence: int) -> None:
    """Zähler mindestens auf `sequence` heben — für den Backfill.

    Senkt nie: eine bereits vergebene Nummer darf nicht wieder frei werden.
    """
    zeile = _sequenzzeile(db, company_id, year)
    if (zeile.last_sequence or 0) < sequence:
        zeile.last_sequence = sequence
        zeile.updated_at = datetime.utcnow()
        db.flush()


def hoechste_sequenz(db: Session, company_id: int, year: int) -> int:
    zeile = (
        db.query(func.coalesce(ProjectNumberSequence.last_sequence, 0))
        .filter(ProjectNumberSequence.company_id == company_id,
                ProjectNumberSequence.year == year)
        .scalar()
    )
    return int(zeile or 0)
