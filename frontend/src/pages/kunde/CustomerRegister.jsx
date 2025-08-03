import { useState } from "react";
import axios from "axios";

export default function CustomerRegister() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [personentyp, setPersonentyp] = useState("natuerliche_person");

  const [firma, setFirma] = useState("");
  const [mitarbeiteranzahl, setMitarbeiteranzahl] = useState("");
  const [gewerbe, setGewerbe] = useState("");
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    const data = {
      email,
      password,
      personentyp,
      ...(personentyp === "firma"
        ? {
            firma,
            mitarbeiteranzahl: mitarbeiteranzahl ? parseInt(mitarbeiteranzahl) : undefined,
            gewerbe,
          }
        : {
            vorname,
            nachname,
          }),
    };

    try {
      await axios.post("http://localhost:8000/customers/register", data);
      setSuccess(true);
      setError("");
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(" | ") : detail || "Registrierung fehlgeschlagen");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-2xl font-bold mb-4">Kundenregistrierung</h1>
      <form onSubmit={handleRegister} className="bg-white p-6 rounded shadow-md w-full max-w-lg space-y-4">
        <div>
          <label className="block mb-1 font-medium">Ich bin eine ...</label>
          <select value={personentyp} onChange={(e) => setPersonentyp(e.target.value)} className="w-full p-2 border rounded">
            <option value="natuerliche_person">Natürliche Person</option>
            <option value="firma">Firma</option>
          </select>
        </div>

        {personentyp === "firma" && (
          <>
            <input type="text" placeholder="Firmenname" value={firma} onChange={(e) => setFirma(e.target.value)} required className="w-full p-2 border rounded" />
            <select value={mitarbeiteranzahl} onChange={(e) => setMitarbeiteranzahl(e.target.value)} required className="w-full p-2 border rounded">
              <option value="">Anzahl Mitarbeitende wählen</option>
              <option value="1">1–5</option>
              <option value="6">6–20</option>
              <option value="21">21–50</option>
              <option value="51">51+</option>
            </select>
            <input type="text" placeholder="Gewerbe (z.B. Architektur)" value={gewerbe} onChange={(e) => setGewerbe(e.target.value)} required className="w-full p-2 border rounded" />
          </>
        )}

        {personentyp === "natuerliche_person" && (
          <>
            <input type="text" placeholder="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} required className="w-full p-2 border rounded" />
            <input type="text" placeholder="Nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} required className="w-full p-2 border rounded" />
          </>
        )}

        <input type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-2 border rounded" />
        <input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-2 border rounded" />

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          Registrieren
        </button>

        {success && <p className="text-green-600">✅ Registrierung erfolgreich!</p>}
        {error && <p className="text-red-600">❌ {error}</p>}
      </form>
    </div>
  );
}
