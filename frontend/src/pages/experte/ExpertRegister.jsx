import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";

const fachbereicheList = [
  "Wärmedämmung",
  "Heizungsanlagen",
  "Klima- und Belüftungsanlagen",
  "Beleuchtungsanlagen",
  "Schutz vor Lärm",
];

function ExpertRegister() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    personentyp: "natuerliche_person", // passend zu Enum
    firma: "",
    vorname: "",
    nachname: "",
    mitarbeiteranzahl: "",
    fachbereiche: [],
    berufsnachweis: "",
  });
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const updated = formData.fachbereiche.includes(value)
        ? formData.fachbereiche.filter((fb) => fb !== value)
        : [...formData.fachbereiche, value];
      setFormData({ ...formData, fachbereiche: updated });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const payload = {
      email: formData.email,
      password: formData.password,
      personentyp: formData.personentyp,
      fachbereiche: formData.fachbereiche,
      berufsnachweis: formData.berufsnachweis || null,
      firma: formData.personentyp === "firma" ? formData.firma : null,
      mitarbeiteranzahl:
        formData.personentyp === "firma"
          ? Number(formData.mitarbeiteranzahl)
          : null,
      vorname: formData.personentyp === "natuerliche_person" ? formData.vorname : null,
      nachname: formData.personentyp === "natuerliche_person" ? formData.nachname : null,
    };

    try {
      await axios.post("http://localhost:8000/experts/register", payload);
      setMessage("✅ Registrierung erfolgreich!");
      setShowModal(true);
      setIsLoading(false);

      setFormData({
        email: "",
        password: "",
        personentyp: "natuerliche_person",
        firma: "",
        vorname: "",
        nachname: "",
        mitarbeiteranzahl: "",
        fachbereiche: [],
        berufsnachweis: "",
      });

      setTimeout(() => {
        setShowModal(false);
        navigate("/");
      }, 5000);
    } catch (err) {
      console.error("❌ Fehler beim Registrieren:", err.response?.data || err.message);
      setMessage("❌ Registrierung fehlgeschlagen. Bitte überprüfen Sie Ihre Angaben.");
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white shadow-xl rounded-2xl p-8 space-y-6">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">Expertenregistrierung</h1>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">E-Mail</label>
              <input type="email" name="email" required value={formData.email} onChange={handleChange}
                className="w-full p-3 border rounded-lg" disabled={isLoading} />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Passwort</label>
              <input type="password" name="password" required minLength={6} value={formData.password} onChange={handleChange}
                className="w-full p-3 border rounded-lg" disabled={isLoading} />
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-1">Personentyp</label>
            <select name="personentyp" value={formData.personentyp} onChange={handleChange}
              className="w-full p-3 border rounded-lg" disabled={isLoading}>
              <option value="natuerliche_person">Natürliche Person</option>
              <option value="firma">Firma</option>
            </select>
          </div>

          {formData.personentyp === "firma" ? (
            <>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Firmenname</label>
                <input type="text" name="firma" required value={formData.firma} onChange={handleChange}
                  className="w-full p-3 border rounded-lg" disabled={isLoading} />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Mitarbeitende</label>
                <input type="number" name="mitarbeiteranzahl" required value={formData.mitarbeiteranzahl} onChange={handleChange}
                  className="w-full p-3 border rounded-lg" disabled={isLoading} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Vorname</label>
                <input type="text" name="vorname" required value={formData.vorname} onChange={handleChange}
                  className="w-full p-3 border rounded-lg" disabled={isLoading} />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Nachname</label>
                <input type="text" name="nachname" required value={formData.nachname} onChange={handleChange}
                  className="w-full p-3 border rounded-lg" disabled={isLoading} />
              </div>
            </>
          )}

          <div>
            <label className="block text-gray-700 font-semibold mb-1">Berufsnachweis (optional)</label>
            <input type="text" name="berufsnachweis" value={formData.berufsnachweis} onChange={handleChange}
              className="w-full p-3 border rounded-lg" disabled={isLoading} />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Fachbereiche (Mehrfachauswahl möglich)</label>
            <div className="grid md:grid-cols-2 gap-3">
              {fachbereicheList.map((bereich) => (
                <label key={bereich} className="flex items-center space-x-3 bg-white border p-3 rounded-lg cursor-pointer">
                  <input type="checkbox" name="fachbereiche" value={bereich}
                    checked={formData.fachbereiche.includes(bereich)}
                    onChange={handleChange} disabled={isLoading} />
                  <span>{bereich}</span>
                </label>
              ))}
            </div>
          </div>

          {message && (
            <p className="text-center font-semibold text-red-600 mt-2">{message}</p>
          )}

          <button type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
            disabled={isLoading}>
            {isLoading ? "Bitte warten..." : "Registrieren"}
          </button>
        </form>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-xl shadow-xl text-center max-w-md">
            <CheckCircle className="text-green-500 w-12 h-12 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Registrierung erfolgreich!</h2>
            <p className="text-gray-600">Wir prüfen Ihre Angaben und benachrichtigen Sie per E-Mail.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpertRegister;
