import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Building,
  Award,
  FileText,
  Save,
  ArrowLeft
} from "lucide-react";

const fachbereicheList = [
  "Wärmedämmung",
  "Heizungsanlagen",
  "Klima- und Belüftungsanlagen",
  "Beleuchtungsanlagen",
  "Schutz vor Lärm",
];

function ExpertProfile() {
  const [formData, setFormData] = useState({
    email: "",
    personentyp: "natuerliche_person",
    fachbereiche: [],
    berufsnachweis: "",
    mitarbeiteranzahl: "",
    profilbild: null,
  });

  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const userEmail = localStorage.getItem("email");
    const userId = localStorage.getItem("user_id");

    if (!userEmail || !userId) return navigate("/login");

    const fetchProfile = async () => {
      try {
        const res = await fetch(`http://localhost:8000/experts/${userId}`);
        const data = await res.json();

        setFormData({
          email: data.email,
          personentyp: data.personentyp,
          fachbereiche: data.fachbereiche || [],
          berufsnachweis: data.berufsnachweis || "",
          mitarbeiteranzahl: data.mitarbeiteranzahl || "",
          profilbild: null,
        });
      } catch (err) {
        console.error("Fehler beim Laden des Profils:", err);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;

    if (type === "file") {
      setFormData({ ...formData, profilbild: files[0] });
    } else if (type === "checkbox") {
      const updatedList = formData.fachbereiche.includes(value)
        ? formData.fachbereiche.filter((item) => item !== value)
        : [...formData.fachbereiche, value];
      setFormData({ ...formData, fachbereiche: updatedList });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const expert_id = localStorage.getItem("user_id");

    const payload = {
      personentyp: formData.personentyp,
      fachbereiche: formData.fachbereiche,
      berufsnachweis: formData.berufsnachweis || null,
      mitarbeiteranzahl:
        formData.personentyp === "firma" && formData.mitarbeiteranzahl
          ? parseInt(formData.mitarbeiteranzahl)
          : null,
    };

    try {
      const res = await fetch(`http://localhost:8000/experts/${expert_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Update fehlgeschlagen");

      setMessage("✅ Profil erfolgreich gespeichert");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("❌ Fehler beim Speichern:", err);
      setMessage("❌ Fehler beim Speichern");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Zurück Button */}
        <div className="mb-4">
          <button
  onClick={() => navigate("/experte-dashboard")}
  className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
>
  Zurück zum Dashboard
</button>

        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-center space-x-3">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Mein Expertenprofil</h1>
          </div>
          <p className="text-center text-gray-600 mt-2">Bearbeiten Sie Ihre Profilinformationen</p>
        </div>

        {/* Formular */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                <User className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{formData.email}</h2>
                <p className="text-blue-100">Expertenprofil</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Linke Spalte */}
              <div className="space-y-6">
                {/* Personentyp */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <label className="flex items-center space-x-2 font-semibold text-gray-800 mb-4">
                    <Building className="w-5 h-5 text-blue-600" />
                    <span>Personentyp</span>
                  </label>
                  <select
                    name="personentyp"
                    value={formData.personentyp}
                    onChange={handleChange}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg"
                  >
                    <option value="natuerliche_person">Natürliche Person</option>
                    <option value="firma">Firma</option>
                  </select>
                </div>

                {/* Mitarbeitende */}
                {formData.personentyp === "firma" && (
                  <div className="bg-gray-50 rounded-xl p-6">
                    <label className="flex items-center space-x-2 font-semibold text-gray-800 mb-4">
                      <User className="w-5 h-5 text-blue-600" />
                      <span>Mitarbeitende</span>
                    </label>
                    <input
                      type="number"
                      name="mitarbeiteranzahl"
                      value={formData.mitarbeiteranzahl}
                      onChange={handleChange}
                      placeholder="Anzahl Mitarbeitende"
                      className="w-full p-3 border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                )}

                {/* Berufsnachweis */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <label className="flex items-center space-x-2 font-semibold text-gray-800 mb-4">
                    <Award className="w-5 h-5 text-blue-600" />
                    <span>Berufsnachweis</span>
                  </label>
                  <input
                    type="text"
                    name="berufsnachweis"
                    value={formData.berufsnachweis}
                    onChange={handleChange}
                    placeholder="z. B. Fachausweis Gebäudetechnik"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Rechte Spalte */}
              <div className="space-y-6">
                {/* Fachbereiche */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <label className="flex items-center space-x-2 font-semibold text-gray-800 mb-4">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span>Fachbereiche</span>
                  </label>
                  <p className="text-sm text-gray-600 mb-4">Mehrfachauswahl möglich</p>
                  <div className="space-y-2">
                    {fachbereicheList.map((bereich) => (
                      <label key={bereich} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          name="fachbereiche"
                          value={bereich}
                          checked={formData.fachbereiche.includes(bereich)}
                          onChange={handleChange}
                          className="w-5 h-5"
                        />
                        <span>{bereich}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Speichern Button */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold text-lg shadow-lg hover:scale-105 transition"
              >
                <Save className="w-6 h-6" />
                <span>Profil speichern</span>
              </button>
            </div>

            {/* Feedback */}
            {message && (
              <div className="mt-6 p-4 bg-green-100 border border-green-300 text-green-800 rounded-lg text-center font-semibold">
                {message}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default ExpertProfile;
