// frontend/src/lib/library.js
export async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Load failed: ${path}`);
  return res.json();
}

export async function loadLibrary() {
  const [roomTypes, solar, climateZH, ventDefs] = await Promise.all([
    loadJSON("/data/room_types.json"),
    loadJSON("/data/solar_factors.json"),
    loadJSON("/data/climate_zurich.json"),
    loadJSON("/data/ventilation_defaults.json"),
  ]);
  return { roomTypes, solar, climateZH, ventDefs };
}

// Ableitung Raum-Vorlage aus Nutzungstyp + Fläche
export function applyRoomType({ type, area_m2 }) {
  const people = Math.round((type.people_per_m2 || 0) * area_m2);
  const airflow_m3h = Math.round((type.vent_m3h_per_m2 || 0) * area_m2 + (type.vent_m3h_per_person || 0) * people);

  return {
    name: type.title,
    envelope_area_m2: Math.round(area_m2 * 1.1), // grobe Ableitung
    u_value_W_m2K: 0.6,
    delta_t_K: 8,
    ventilation_strategy: "direct",
    airflow_m3h,
    // Solar (berechnet)
    solar_mode: "calc",
    fenster_area_m2: Math.round(0.25 * area_m2),
    g_value: 0.6,
    orient: "S",
    mass_class: "medium",
    solar_irr_W_m2: 450,
    // Intern
    people_count: people,
    sensible_per_person_W: type.sensible_per_person_W ?? 75,
    latent_per_person_W: type.latent_per_person_W ?? 55,
    equipment_W: Math.round((type.equipment_W_m2 || 0) * area_m2),
    lighting_W: Math.round((type.lighting_W_m2 || 0) * area_m2),
  };
}

// CO2-basierte Luftmenge (vereinfachte SIA-Logik)
// qv [m3/h] = (G_CO2 [l/h]) / (ΔC [l/l]) / 1000
export function calcVentilationFromCO2({
  persons,
  co2_emission_lph_per_person = 18,
  co2_indoor_limit_ppm = 1000,
  co2_outdoor_ppm = 400,
}) {
  const G_lph = persons * co2_emission_lph_per_person; // l/h
  const dC = Math.max(100, co2_indoor_limit_ppm - co2_outdoor_ppm); // ppm
  const dC_l_per_l = dC / 1_000_000; // l/l
  return (G_lph / dC_l_per_l) / 1000; // m³/h
}
