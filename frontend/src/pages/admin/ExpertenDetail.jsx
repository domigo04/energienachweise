import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Building, Award, FileText, Save } from "lucide-react";
import { useParams } from "react-router-dom";

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
  const { id: expert_id } = useParams();


  useEffect(() => {
    const userEmail = localStorage.getItem("email");
    if (!userEmail) return navigate("/login");

    async function fetchProfile() {
      try {
        const res = await fetch(`http://localhost:8000/admin/experten/${expert_id}`);
        const data = await res.json();

        setFormData({
          email: data.email,
          personentyp: data.personentyp || "natuerliche_person",
          fachbereiche: data.fachbereiche || [],
          berufsnachweis: data.berufsnachweis || "",
          mitarbeiteranzahl: data.mitarbeiteranzahl?.toString() || "",
          profilbild: null,
        });
      } catch (err) {
        console.error("Fehler beim Laden des Profils:", err);
      }
    }

    fetchProfile();
  }, [navigate, expert_id]);

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;

    if (type === "file") {
      setFormData({ ...formData, profilbild: files[0] });
    } else if (type === "checkbox") {
      const newList = formData.fachbereiche.includes(value)
        ? formData.fachbereiche.filter((fb) => fb !== value)
        : [...formData.fachbereiche, value];
      setFormData({ ...formData, fachbereiche: newList });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header mit Zurück-Button */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{formData.email}</h2>
                  <p className="text-blue-100">Expertenprofil</p>
                </div>
              </div>
              <button
                onClick={() => navigate("/admin-dashboard")}
                type="button"
                className="bg-white/20 hover:bg-white/30 text-white font-medium px-4 py-2 rounded-lg transition"
              >
                Zurück
              </button>
            </div>
          </div>

          {/* Formular */}
          <div className="p-8 grid lg:grid-cols-2 gap-8">
            {/* Personentyp */}
            <div className="bg-gray-50 rounded-xl p-6">
              <label className="flex items-center space-x-2 text-lg font-semibold text-gray-800 mb-4">
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

            {/* Mitarbeiteranzahl */}
            {formData.personentyp === "firma" && (
              <div className="bg-gray-50 rounded-xl p-6">
                <label className="flex items-center space-x-2 text-lg font-semibold text-gray-800 mb-4">
                  <User className="w-5 h-5 text-blue-600" />
                  <span>Mitarbeitende</span>
                </label>
                <input
                  type="number"
                  name="mitarbeiteranzahl"
                  value={formData.mitarbeiteranzahl}
                  onChange={handleChange}
                  className="w-full p-3 border-2 border-gray-200 rounded-lg"
                  placeholder="Anzahl Mitarbeitende"
                />
              </div>
            )}

            {/* Berufsnachweis */}
            <div className="bg-gray-50 rounded-xl p-6 col-span-2">
              <label className="flex items-center space-x-2 text-lg font-semibold text-gray-800 mb-4">
                <Award className="w-5 h-5 text-blue-600" />
                <span>Berufsnachweis</span>
              </label>
              <input
                type="text"
                name="berufsnachweis"
                value={formData.berufsnachweis}
                onChange={handleChange}
                className="w-full p-3 border-2 border-gray-200 rounded-lg"
                placeholder="z. B. Fachausweis Gebäudetechnik"
              />
            </div>

            {/* Fachbereiche */}
            <div className="bg-gray-50 rounded-xl p-6 col-span-2">
              <label className="flex items-center space-x-2 text-lg font-semibold text-gray-800 mb-4">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>Fachbereiche</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fachbereicheList.map((bereich) => (
                  <label
                    key={bereich}
                    className="flex items-center p-3 bg-white rounded-lg border-2 border-gray-200 hover:border-blue-300"
                  >
                    <input
                      type="checkbox"
                      name="fachbereiche"
                      value={bereich}
                      checked={formData.fachbereiche.includes(bereich)}
                      onChange={handleChange}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="ml-3">{bereich}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Speichern */}
            <div className="col-span-2 mt-8 pt-4 border-t border-gray-200">
              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all"
              >
                <Save className="w-6 h-6" />
                <span>Profil speichern</span>
              </button>
              {message && (
                <div className="mt-4 p-3 text-center bg-green-100 text-green-800 font-semibold rounded-lg">
                  {message}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ExpertProfile;
