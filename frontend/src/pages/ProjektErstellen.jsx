import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, API_BASE } from "../api";
 import { getToken } from "../api";

function ProjektErstellen() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    adresse: "",
    gebaeudetyp: "",
    kontrollart: "",
  });
  const [message, setMessage] = useState("");
  const autocompleteRef = useRef(null);
  const inputRef = useRef(null);

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!window.google && mapsApiKey) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places`;
      script.async = true;
      script.onload = initAutocomplete;
      document.body.appendChild(script);
    } else {
      initAutocomplete();
    }
  }, []);

  const initAutocomplete = () => {
    if (!inputRef.current || !window.google) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(
      inputRef.current,
      { types: ["geocode"], componentRestrictions: { country: "ch" } }
    );
    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current.getPlace();
      if (place.formatted_address) {
        setFormData((prev) => ({ ...prev, adresse: place.formatted_address }));
      }
    });
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();


    try {
      await api.post("/projects/create", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage("✅ Projekt erfolgreich erstellt!");
      setTimeout(() => navigate("/kunde-dashboard"), 1500);
    } catch (err) {
      console.error("❌ Fehler beim Erstellen:", err.response?.data || err.message);
      setMessage("❌ Fehler beim Erstellen des Projekts.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          📝 Neues Projekt erstellen
        </h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block mb-2 font-semibold text-gray-700">Adresse</label>
            <input
              ref={inputRef}
              type="text"
              name="adresse"
              placeholder="Adresse eingeben"
              className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              required
              value={formData.adresse}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block mb-2 font-semibold text-gray-700">Gebäudetyp</label>
            <select
              name="gebaeudetyp"
              value={formData.gebaeudetyp}
              onChange={handleChange}
              className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500"
              required
            >
              <option value="">Bitte wählen</option>
              <option value="EFH">Einfamilienhaus</option>
              <option value="MFH">Mehrfamilienhaus</option>
              <option value="Gewerbe">Gewerbebau</option>
            </select>
          </div>

          <div>
            <label className="block mb-2 font-semibold text-gray-700">Kontrollart</label>
            <select
              name="kontrollart"
              value={formData.kontrollart}
              onChange={handleChange}
              className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500"
              required
            >
              <option value="">Bitte wählen</option>
              <option value="private_kontrolle">Private Kontrolle</option>
              <option value="ausfuehrungskontrolle">Ausführungskontrolle</option>
              <option value="beides">Beides</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            Projekt erstellen
          </button>

          {message && (
            <div
              className={`p-4 rounded-xl text-center font-medium ${
                message.includes("✅")
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default ProjektErstellen;
