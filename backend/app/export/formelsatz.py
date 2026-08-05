"""Formelsatz für den PDF-Export: dieselbe LaTeX-Teilmenge wie im Editor.

Der Rechenweg trägt neben dem Klartext (`formel`, `eingesetzt`) auch die
LaTeX-Fassung (`formel_latex`, `eingesetzt_latex`). Der Editor setzt sie mit
KaTeX. Damit der Export denselben Stand zeigt, setzt dieses Modul die gleichen
Ausdrücke direkt auf den ReportLab-Canvas:

* Brüche mit echtem Bruchstrich statt «/»,
* Formelzeichen kursiv, Wortzusätze und Einheiten aufrecht (ISO 80000-1),
* griechische Buchstaben aus der Symbol-Schrift,
* Hoch- und Tiefstellungen sowie mitwachsende Klammern.

Unterstützt wird genau das, was die Rechenkerne erzeugen. Unbekannte Befehle
werden als aufrechter Text gesetzt und eine unlesbare Eingabe fällt auf den
Klartext zurück: im Export darf nie eine Formel verschwinden.
"""

from reportlab.pdfbase import pdfmetrics

# Formelschrift wie im Formeleditor von Word: Serifen, Formelzeichen kursiv.
# Times gehört zu den 14 Standardschriften und braucht keine Einbettung.
GERADE = "Times-Roman"
KURSIV = "Times-Italic"

# Schriftmasse als feste Anteile der Schriftgrösse: sie halten den Zeilenumbruch
# im PDF vorhersehbar und passen für Times wie für die Symbol-Ersatzzeichen.
UEBER = 0.72          # Oberlänge über der Grundlinie
UNTER = 0.21          # Unterlänge unter der Grundlinie
SKRIPT = 0.72         # Schriftgrösse von Hoch- und Tiefstellungen
HOCH = 0.42           # Versatz der Hochstellung
TIEF = 0.20           # Versatz der Tiefstellung
ACHSE = 0.28          # Mathematikachse (Höhe des Bruchstrichs) über der Grundlinie

# Griechische Buchstaben als echte Unicode-Zeichen: ReportLab holt sie aus der
# Symbol-Schrift. Die Zeichen der Symbol-Kodierung (`p` für π) sind dafür nicht
# brauchbar, sie erscheinen im PDF als leere Kästchen.
GRIECHISCH = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε",
    "zeta": "ζ", "eta": "η", "theta": "θ", "iota": "ι", "kappa": "κ",
    "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ",
    "sigma": "σ", "tau": "τ", "phi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ",
    "Pi": "Π", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
    "sum": "Σ", "prod": "Π",
}

# Zeichenbefehle ohne Argument.
ZEICHEN = {
    "cdot": "·", "times": "×", "pm": "±", "div": "÷", "ast": "*",
    "percent": "%", "degree": "°",
}

# Abstandsbefehle als Anteil der Schriftgrösse.
ABSTAND = {"quad": 1.0, "qquad": 2.0, ",": 0.17, ";": 0.28, ":": 0.22,
           " ": 0.28, "!": -0.12}

# Zeichen, die als Rechenzeichen etwas Luft bekommen.
OPERATOREN = set("=+-<>≤≥≈")

STANDARDFARBE = (0.1, 0.12, 0.2)


# ── Kästen: messen und zeichnen ─────────────────────────────────────────────
class _Kasten:
    """Ein gesetzter Teilausdruck mit Breite, Ober- und Unterlänge."""

    breite = 0.0
    ueber = 0.0
    unter = 0.0

    def zeichne(self, c, x: float, y: float) -> None:
        """`x` ist die linke Kante, `y` die Grundlinie."""


class _Text(_Kasten):
    def __init__(self, text: str, font: str, groesse: float):
        self.text, self.font, self.groesse = text, font, groesse
        self.breite = pdfmetrics.stringWidth(text, font, groesse)
        self.ueber = UEBER * groesse
        self.unter = UNTER * groesse

    def zeichne(self, c, x, y):
        c.setFont(self.font, self.groesse)
        c.drawString(x, y, self.text)


class _Leer(_Kasten):
    def __init__(self, breite: float):
        self.breite = breite


class _Reihe(_Kasten):
    def __init__(self, teile: list):
        self.teile = teile
        self.breite = sum(t.breite for t in teile)
        self.ueber = max([t.ueber for t in teile], default=0.0)
        self.unter = max([t.unter for t in teile], default=0.0)

    def zeichne(self, c, x, y):
        for teil in self.teile:
            teil.zeichne(c, x, y)
            x += teil.breite


class _Bruch(_Kasten):
    """Zähler über Nenner mit Bruchstrich auf der Mathematikachse."""

    def __init__(self, zaehler: _Kasten, nenner: _Kasten, groesse: float):
        self.zaehler, self.nenner, self.groesse = zaehler, nenner, groesse
        self.strich = max(0.4, 0.055 * groesse)
        self.luft = 0.20 * groesse
        self.rand = 0.28 * groesse
        achse = ACHSE * groesse
        self.breite = max(zaehler.breite, nenner.breite) + 2 * self.rand
        self.ueber = achse + self.strich / 2 + self.luft + zaehler.unter + zaehler.ueber
        self.unter = -achse + self.strich / 2 + self.luft + nenner.ueber + nenner.unter

    def zeichne(self, c, x, y):
        achse = y + ACHSE * self.groesse
        mitte = x + self.breite / 2
        c.setLineWidth(self.strich)
        c.line(x + self.rand / 3, achse, x + self.breite - self.rand / 3, achse)
        self.zaehler.zeichne(
            c, mitte - self.zaehler.breite / 2,
            achse + self.strich / 2 + self.luft + self.zaehler.unter)
        self.nenner.zeichne(
            c, mitte - self.nenner.breite / 2,
            achse - self.strich / 2 - self.luft - self.nenner.ueber)


class _Skript(_Kasten):
    """Basis mit Hoch- und/oder Tiefstellung."""

    def __init__(self, basis: _Kasten, groesse: float, hoch=None, tief=None):
        self.basis, self.groesse, self.hoch, self.tief = basis, groesse, hoch, tief
        self._masse()

    def _masse(self):
        # Hohe Basen (Klammern, Brüche) tragen ihre Stellung weiter aussen.
        self.hoch_y = max(HOCH * self.groesse, self.basis.ueber - 0.52 * self.groesse)
        self.tief_y = max(TIEF * self.groesse, self.basis.unter - 0.10 * self.groesse)
        skript = max(self.hoch.breite if self.hoch else 0.0,
                     self.tief.breite if self.tief else 0.0)
        self.breite = self.basis.breite + skript + 0.06 * self.groesse
        self.ueber = max(self.basis.ueber,
                         self.hoch_y + self.hoch.ueber if self.hoch else 0.0)
        self.unter = max(self.basis.unter,
                         self.tief_y + self.tief.unter if self.tief else 0.0)

    def ergaenze(self, kasten: _Kasten, hoch: bool) -> None:
        """Zweite Stellung an dieselbe Basis hängen (zum Beispiel `d_i^2`)."""
        if hoch:
            self.hoch = kasten
        else:
            self.tief = kasten
        self._masse()

    def zeichne(self, c, x, y):
        self.basis.zeichne(c, x, y)
        x += self.basis.breite + 0.06 * self.groesse
        if self.hoch:
            self.hoch.zeichne(c, x, y + self.hoch_y)
        if self.tief:
            self.tief.zeichne(c, x, y - self.tief_y)


class _Klammer(_Kasten):
    """Klammerpaar, das mit dem Inhalt mitwächst."""

    def __init__(self, inhalt: _Kasten, groesse: float, links="(", rechts=")"):
        self.inhalt, self.links, self.rechts = inhalt, links, rechts
        hoehe = max(inhalt.ueber + inhalt.unter, groesse)
        self.fs = min(6 * groesse, max(groesse, hoehe * 1.16))
        self.links_b = pdfmetrics.stringWidth(links, GERADE, self.fs) if links else 0.0
        self.rechts_b = pdfmetrics.stringWidth(rechts, GERADE, self.fs) if rechts else 0.0
        self.breite = inhalt.breite + self.links_b + self.rechts_b
        mitte = (inhalt.ueber - inhalt.unter) / 2
        halb = hoehe * 0.58
        self.ueber = max(inhalt.ueber, mitte + halb)
        self.unter = max(inhalt.unter, halb - mitte)

    def zeichne(self, c, x, y):
        grundlinie = y + (self.inhalt.ueber - self.inhalt.unter) / 2 - 0.26 * self.fs
        if self.links:
            c.setFont(GERADE, self.fs)
            c.drawString(x, grundlinie, self.links)
        self.inhalt.zeichne(c, x + self.links_b, y)
        if self.rechts:
            c.setFont(GERADE, self.fs)      # der Inhalt hat die Schrift gewechselt
            c.drawString(x + self.links_b + self.inhalt.breite, grundlinie, self.rechts)


class _Punkt(_Kasten):
    """Punkt über der Basis — Zeitableitung, zum Beispiel der Volumenstrom."""

    def __init__(self, basis: _Kasten, groesse: float):
        self.basis, self.groesse = basis, groesse
        self.breite = basis.breite
        self.ueber = basis.ueber + 0.22 * groesse
        self.unter = basis.unter

    def zeichne(self, c, x, y):
        self.basis.zeichne(c, x, y)
        c.circle(x + self.basis.breite / 2 + 0.05 * self.groesse,
                 y + self.basis.ueber + 0.12 * self.groesse,
                 max(0.35, 0.055 * self.groesse), stroke=0, fill=1)


# ── LaTeX zerlegen und aufbauen ─────────────────────────────────────────────
def _zerlege(latex: str) -> list:
    """LaTeX in Token zerlegen: Befehle, Klammern und einzelne Zeichen."""
    tokens, i, n = [], 0, len(latex)
    while i < n:
        zeichen = latex[i]
        if zeichen == "\\":
            j = i + 1
            while j < n and latex[j].isalpha():
                j += 1
            tokens.append(latex[i:j] if j > i + 1 else latex[i:i + 2])
            i = j if j > i + 1 else i + 2
        elif zeichen.isspace():
            i += 1                      # Leerraum ist in LaTeX bedeutungslos
        else:
            tokens.append(zeichen)
            i += 1
    return tokens


def _glyphe(zeichen: str, groesse: float, aufrecht: bool) -> _Kasten:
    """Ein Zeichen setzen: Formelzeichen kursiv, alles andere aufrecht."""
    if zeichen.isalpha() and not aufrecht:
        return _Text(zeichen, KURSIV, groesse)
    if zeichen in OPERATOREN:
        luft = _Leer(0.18 * groesse)
        return _Reihe([luft, _Text(zeichen, GERADE, groesse), luft])
    return _Text(zeichen, GERADE, groesse)


def _argument(tokens: list, pos: int, groesse: float, aufrecht: bool):
    """Ein Argument lesen: `{…}` als Gruppe oder ein einzelnes Token."""
    if pos >= len(tokens):
        return _Leer(0.0), pos
    if tokens[pos] == "{":
        return _kaesten(tokens, pos + 1, groesse, aufrecht)[:2]
    kasten, pos, _ = _atom(tokens, pos, groesse, aufrecht)
    return kasten, pos


def _atom(tokens: list, pos: int, groesse: float, aufrecht: bool):
    """Nächsten Teilausdruck setzen. Gibt Kasten, Position und Schlusszeichen."""
    token = tokens[pos]
    pos += 1
    if token == "{":
        gruppe, pos, _ = _kaesten(tokens, pos, groesse, aufrecht)
        return gruppe, pos, None
    if token == r"\frac":
        zaehler, pos = _argument(tokens, pos, groesse * 0.94, aufrecht)
        nenner, pos = _argument(tokens, pos, groesse * 0.94, aufrecht)
        return _Bruch(zaehler, nenner, groesse), pos, None
    if token in (r"\mathrm", r"\text", r"\mathbf", r"\operatorname", r"\mathit"):
        inhalt, pos = _argument(tokens, pos, groesse, token != r"\mathit")
        return inhalt, pos, None
    if token == r"\dot":
        basis, pos = _argument(tokens, pos, groesse, aufrecht)
        return _Punkt(basis, groesse), pos, None
    if token == r"\left":
        links = tokens[pos] if pos < len(tokens) else "("
        inhalt, pos, schluss = _kaesten(tokens, pos + 1, groesse, aufrecht)
        links = "" if links == "." else links
        rechts = "" if schluss in (".", None) else schluss
        return _Klammer(inhalt, groesse, links, rechts), pos, None
    if token.startswith("\\"):
        name = token[1:]
        if name in GRIECHISCH:
            return _Text(GRIECHISCH[name], GERADE, groesse), pos, None
        if name in ZEICHEN:
            luft = _Leer(0.16 * groesse)
            return _Reihe([luft, _Text(ZEICHEN[name], GERADE, groesse), luft]), pos, None
        if name in ABSTAND:
            return _Leer(ABSTAND[name] * groesse), pos, None
        # Unbekannter Befehl: aufrecht ausschreiben statt verschlucken.
        return _Text(name, GERADE, groesse), pos, None
    return _glyphe(token, groesse, aufrecht), pos, None


def _kaesten(tokens: list, pos: int, groesse: float, aufrecht: bool):
    """Kästen bis zum Ende der Gruppe sammeln (`}` oder `\\right`)."""
    teile, schluss = [], None
    while pos < len(tokens):
        token = tokens[pos]
        if token == "}":
            pos += 1
            break
        if token == r"\right":
            schluss = tokens[pos + 1] if pos + 1 < len(tokens) else ")"
            pos += 2
            break
        if token in ("^", "_"):
            arg, pos = _argument(tokens, pos + 1, groesse * SKRIPT, aufrecht)
            hoch = token == "^"
            if teile and isinstance(teile[-1], _Skript):
                teile[-1].ergaenze(arg, hoch)
            else:
                basis = teile.pop() if teile else _Leer(0.0)
                teile.append(_Skript(basis, groesse,
                                     hoch=arg if hoch else None,
                                     tief=None if hoch else arg))
            continue
        kasten, pos, _ = _atom(tokens, pos, groesse, aufrecht)
        vorher = teile[-1] if teile else None
        # Gleichartige Zeichen zu einem Textstück zusammenziehen: die Formel
        # bleibt im PDF als Wort lesbar und kopierbar, nicht Buchstabe für
        # Buchstabe.
        if (isinstance(kasten, _Text) and isinstance(vorher, _Text)
                and (vorher.font, vorher.groesse) == (kasten.font, kasten.groesse)):
            teile[-1] = _Text(vorher.text + kasten.text, kasten.font, kasten.groesse)
        else:
            teile.append(kasten)
    return _Reihe(teile), pos, schluss


# ── Öffentliche Schnittstelle ───────────────────────────────────────────────
class Formel:
    """Gesetzte Formel: erst messen, dann zeichnen — der Umbruch braucht beides."""

    def __init__(self, kasten: _Kasten, skala: float = 1.0):
        self.kasten, self.skala = kasten, skala
        self.breite = kasten.breite * skala
        self.ueber = kasten.ueber * skala
        self.unter = kasten.unter * skala

    @property
    def hoehe(self) -> float:
        return self.ueber + self.unter

    def zeichne(self, c, x: float, y: float, farbe=STANDARDFARBE) -> float:
        """Formel mit Grundlinie `y` ab `x` zeichnen; gibt die Breite zurück."""
        c.saveState()
        c.setFillColorRGB(*farbe)
        c.setStrokeColorRGB(*farbe)
        if self.skala == 1.0:
            self.kasten.zeichne(c, x, y)
        else:
            c.translate(x, y)
            c.scale(self.skala, self.skala)
            self.kasten.zeichne(c, 0, 0)
        c.restoreState()
        return self.breite


def formel(latex, *, groesse: float = 8.0, fallback=None,
           max_breite: float = None) -> Formel:
    """LaTeX setzen; ohne LaTeX oder bei Fehlern den Klartext verwenden.

    `max_breite` verkleinert die Formel so weit, dass sie in die Spalte passt.
    """
    kasten = None
    if latex:
        try:
            kasten = _kaesten(_zerlege(str(latex)), 0, groesse, False)[0]
        except Exception:
            kasten = None
    if kasten is None or not kasten.breite:
        kasten = _Text(str(fallback if fallback not in (None, "") else latex or ""),
                       GERADE, groesse)
    skala = 1.0
    if max_breite and kasten.breite > max_breite > 0:
        skala = max_breite / kasten.breite
    return Formel(kasten, skala)
