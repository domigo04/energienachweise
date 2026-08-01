"""Regeln für hochgeladene Dateien (Sicherheitsprüfung 2026-08-01).

Der LV-Upload las bisher jede Datei vollständig in den Arbeitsspeicher, legte
sie in die Datenbank und schickte sie durch die OCR-Kette — ohne Obergrenze und
ohne zu prüfen, ob überhaupt ein PDF ankommt. Ein einziger angemeldeter Benutzer
konnte damit den Server über den Speicher aushebeln.

Zwei Regeln, rein und ohne FastAPI, damit sie ohne Server prüfbar sind:

1. **Grösse.** Ein Unternehmer-LV ist ein Textdokument mit ein paar Plänen.
   30 MB sind grosszügig; darüber ist es kein LV mehr.
2. **Form.** Ein PDF beginnt mit `%PDF-`. Die Prüfung schaut in die Datei und
   nicht auf den Dateinamen oder den vom Browser gemeldeten Typ — beides kann
   der Absender frei behaupten.
"""
from __future__ import annotations

import os

# Über eine Umgebungsvariable anpassbar, damit ein Grossprojekt nicht an einer
# im Code eingemauerten Zahl scheitert.
MAX_UPLOAD_MB = int(os.getenv("LV_UPLOAD_MAX_MB", "30"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

PDF_MAGIC = b"%PDF-"


class UploadAbgelehnt(Exception):
    """Die Datei verletzt eine Regel. `grund` ist für den Benutzer bestimmt."""

    def __init__(self, grund: str, status_code: int = 422):
        super().__init__(grund)
        self.grund = grund
        self.status_code = status_code


def pruefe_pdf(daten: bytes, *, max_bytes: int = MAX_UPLOAD_BYTES) -> None:
    """Wirft `UploadAbgelehnt`, wenn die Datei kein brauchbares PDF ist."""
    if not daten:
        raise UploadAbgelehnt("Leere Datei")
    if len(daten) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise UploadAbgelehnt(
            f"Datei zu gross — höchstens {mb} MB.", status_code=413)
    # Manche Werkzeuge stellen dem PDF ein paar Bytes voran; der Header muss
    # aber am Anfang der Datei stehen, sonst ist es kein PDF.
    if not daten[:1024].lstrip().startswith(PDF_MAGIC):
        raise UploadAbgelehnt("Nur PDF-Dateien werden verarbeitet.")


async def lies_begrenzt(datei, *, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """Liest eine hochgeladene Datei in Stücken und bricht bei Überschreitung ab.

    Wichtig: der Abbruch erfolgt WÄHREND des Lesens. Erst alles einzulesen und
    danach die Länge zu prüfen wäre wirkungslos — der Speicher wäre schon weg.
    """
    stuecke: list[bytes] = []
    gelesen = 0
    while True:
        stueck = await datei.read(1024 * 1024)
        if not stueck:
            break
        gelesen += len(stueck)
        if gelesen > max_bytes:
            mb = max_bytes // (1024 * 1024)
            raise UploadAbgelehnt(
                f"Datei zu gross — höchstens {mb} MB.", status_code=413)
        stuecke.append(stueck)
    return b"".join(stuecke)
