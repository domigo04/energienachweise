// frontend/src/lib/cooling.js
// Kühllast-Engine (Frontend-only). Einfach, erweiterbar, SIA-nah.
// Formeln (vereinfachte Spitzenlast):
//  Q_trans  = U * A * ΔT
//  Q_int    = Personen_sens + Geräte + Licht
//  Q_vent_s = rho * V̇ * cp * ΔT     (V̇ in m³/s)
//  Q_lat    = Personen_lat + rho * V̇ * h_fg * Δw
//  Q_solar  = direkt W ODER Fensterfläche * g * Orientierung * Einstrahlung * 0.9
//  Speicherfaktor optional (Bauschwere/Orientierung)
//  Q_total  = Q_sens + Q_lat

import { calcVentilationFromCO2 } from "./library";

export const RHO_AIR = 1.2;          // kg/m³
export const CP_AIR  = 1005.0;       // J/(kg·K)
export const H_FG    = 2_501_000.0;  // J/kg

// sehr grobe Expositionsfaktoren (Süd = 1.0)
export const ORIENT_FACTORS = {
  N: 0.55, NO: 0.75, O: 0.9, SO: 1.0, S: 1.0, SW: 1.0, W: 0.9, NW: 0.75, H: 0.8,
};

export function round3(x) {
  return Math.round((Number(x) + Number.EPSILON) * 1000) / 1000;
}
export function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Optionaler Speicherfaktor (Bauschwere * Orientierung)
// - Entweder explizit: room.storage_factor_override (z.B. 0.7)
// - Oder via JSON-Faktoren: room._solarFactors[mass][orient]
function withStorageFactor(baseSolarW, room) {
  if (room.storage_factor_override != null) return baseSolarW * room.storage_factor_override;
  const mass = (room.mass_class || "medium").toLowerCase();
  const ori = String(room.orient || "S").toUpperCase();
  const table = room._solarFactors?.[mass];
  const sf = table ? (table[ori] ?? 1) : 1;
  return baseSolarW * sf;
}

/** Solare Gewinne */
function calcSolar(room) {
  const mode = room?.solar_mode || "direct";
  if (mode !== "calc") {
    // direkte Eingabe in W
    return Math.max(0, safeNum(room?.solar_gains_W, 0));
  }
  // vereinfachte Berechnung
  const A = Math.max(0, safeNum(room.fenster_area_m2, 0));
  const g = Math.min(1, Math.max(0, safeNum(room.g_value, 0.6)));
  const F = ORIENT_FACTORS[String(room.orient || "S").toUpperCase()] ?? 1.0;
  const E = Math.max(0, safeNum(room.solar_irr_W_m2, 450)); // Sommer-Design
  const raw = A * g * F * E * 0.9; // 0.9 = Rahmen/Behang pauschal
  return withStorageFactor(raw, room);
}

export function calcRoom(room) {
  const name = room?.name || "Raum";

  // Hülle
  const A_env = Math.max(0, safeNum(room.envelope_area_m2));
  const U     = Math.max(0, safeNum(room.u_value_W_m2K));
  const dT    = safeNum(room.delta_t_K, 0);
  const q_trans = U * A_env * dT;

  // Personen + interne Lasten
  const people = Math.max(0, safeNum(room.people_count, 0));
  const q_people_sens = people * Math.max(0, safeNum(room.sensible_per_person_W, 75));
  const q_people_lat  = people * Math.max(0, safeNum(room.latent_per_person_W, 55));
  const q_int_sens    = q_people_sens
                      + Math.max(0, safeNum(room.equipment_W, 0))
                      + Math.max(0, safeNum(room.lighting_W, 0));

  // Ventilationsstrategie (direkt m³/h oder CO₂-basiert)
  let airflow_m3h = safeNum(room.airflow_m3h, 0);
  if ((room.ventilation_strategy || "direct") === "co2") {
    airflow_m3h = calcVentilationFromCO2({
      persons: people,
      co2_emission_lph_per_person: safeNum(room.co2_emission_lph_per_person, 18),
      co2_indoor_limit_ppm: safeNum(room.co2_indoor_limit_ppm, 1000),
      co2_outdoor_ppm: safeNum(room.co2_outdoor_ppm, 400),
    });
  }

  const V_m3s = airflow_m3h / 3600.0;
  const m_kgs = RHO_AIR * V_m3s;

  // Ventilation sensibel
  const dT_vent = safeNum(room.ventilation_deltaT_K, null) ?? dT;
  const q_vent_sens = m_kgs * CP_AIR * Math.max(0, dT_vent);

  // Ventilation latent (aus Δw)
  const dW = safeNum(room.ventilation_deltaW_kg_per_kg, 0);
  const q_vent_lat = dW > 0 ? m_kgs * H_FG * dW : 0;

  // Solar
  const q_solar = calcSolar(room);

  // Summen
  const q_sensible_total = q_trans + q_int_sens + q_solar + q_vent_sens;
  const q_latent_total   = q_people_lat + q_vent_lat;
  const q_total          = q_sensible_total + q_latent_total;

  return {
    name,
    q_trans_W:          round3(q_trans),
    q_int_sens_W:       round3(q_int_sens),
    q_vent_sens_W:      round3(q_vent_sens),
    q_solar_W:          round3(q_solar),
    q_people_lat_W:     round3(q_people_lat),
    q_vent_lat_W:       round3(q_vent_lat),
    q_sensible_total_W: round3(q_sensible_total),
    q_latent_total_W:   round3(q_latent_total),
    q_total_W:          round3(q_total),
  };
}

export function calcProject(project) {
  const rooms = (project?.rooms || []).map(calcRoom);
  const sum = (key) => round3(rooms.reduce((a, r) => a + (r[key] || 0), 0));
  return {
    project_name: project?.project_name || "Unbenanntes Projekt",
    climate_station: project?.climate_station || null,
    rooms,
    totals: {
      q_trans_W:          sum("q_trans_W"),
      q_int_sens_W:       sum("q_int_sens_W"),
      q_vent_sens_W:      sum("q_vent_sens_W"),
      q_solar_W:          sum("q_solar_W"),
      q_people_lat_W:     sum("q_people_lat_W"),
      q_vent_lat_W:       sum("q_vent_lat_W"),
      q_sensible_total_W: sum("q_sensible_total_W"),
      q_latent_total_W:   sum("q_latent_total_W"),
      q_total_W:          sum("q_total_W"),
    },
  };
}

// ---------- JSON Import/Export ----------
export function exportJSON(project) {
  const result = calcProject(project);
  return JSON.stringify({ input: project, result }, null, 2);
}
export function importJSONText(text) {
  const obj = JSON.parse(text);
  if (obj?.input?.rooms) return obj.input;
  if (obj?.rooms) return obj;
  throw new Error("Ungültiges JSON-Format");
}

// ---------- CSV Import/Export ----------
export const CSV_COLUMNS = [
  // Inputs
  "name","envelope_area_m2","u_value_W_m2K","delta_t_K",
  "ventilation_strategy","airflow_m3h","co2_emission_lph_per_person","co2_indoor_limit_ppm","co2_outdoor_ppm",
  "ventilation_deltaT_K","ventilation_deltaW_kg_per_kg",
  "solar_mode","solar_gains_W","fenster_area_m2","g_value","orient","solar_irr_W_m2","mass_class","storage_factor_override",
  "people_count","sensible_per_person_W","latent_per_person_W","equipment_W","lighting_W",
  // Outputs
  "q_trans_W","q_int_sens_W","q_vent_sens_W","q_solar_W","q_people_lat_W","q_vent_lat_W",
  "q_sensible_total_W","q_latent_total_W","q_total_W",
];

export function exportCSV(project) {
  const calc = calcProject(project);
  const rows = project.rooms.map((rin, i) => {
    const r = calc.rooms[i];
    const out = {
      name: rin.name || "Raum",
      envelope_area_m2: safeNum(rin.envelope_area_m2),
      u_value_W_m2K: safeNum(rin.u_value_W_m2K),
      delta_t_K: safeNum(rin.delta_t_K),

      ventilation_strategy: rin.ventilation_strategy || "direct",
      airflow_m3h: safeNum(rin.airflow_m3h, ""),
      co2_emission_lph_per_person: safeNum(rin.co2_emission_lph_per_person, ""),
      co2_indoor_limit_ppm: safeNum(rin.co2_indoor_limit_ppm, ""),
      co2_outdoor_ppm: safeNum(rin.co2_outdoor_ppm, ""),

      ventilation_deltaT_K: rin.ventilation_deltaT_K ?? "",
      ventilation_deltaW_kg_per_kg: rin.ventilation_deltaW_kg_per_kg ?? "",

      solar_mode: rin.solar_mode || "direct",
      solar_gains_W: safeNum(rin.solar_gains_W, ""),
      fenster_area_m2: safeNum(rin.fenster_area_m2, ""),
      g_value: safeNum(rin.g_value, ""),
      orient: rin.orient || "",
      solar_irr_W_m2: safeNum(rin.solar_irr_W_m2, ""),
      mass_class: rin.mass_class || "",
      storage_factor_override: rin.storage_factor_override ?? "",

      people_count: safeNum(rin.people_count),
      sensible_per_person_W: safeNum(rin.sensible_per_person_W, 75),
      latent_per_person_W: safeNum(rin.latent_per_person_W, 55),
      equipment_W: safeNum(rin.equipment_W),
      lighting_W: safeNum(rin.lighting_W),

      q_trans_W: r.q_trans_W,
      q_int_sens_W: r.q_int_sens_W,
      q_vent_sens_W: r.q_vent_sens_W,
      q_solar_W: r.q_solar_W,
      q_people_lat_W: r.q_people_lat_W,
      q_vent_lat_W: r.q_vent_lat_W,
      q_sensible_total_W: r.q_sensible_total_W,
      q_latent_total_W: r.q_latent_total_W,
      q_total_W: r.q_total_W,
    };
    return CSV_COLUMNS.map((k) => out[k] ?? "");
  });

  return [CSV_COLUMNS.join(","), ...rows.map((cols) => cols.join(","))].join("\n");
}

export function importCSVText(text, { project_name = "Import CSV", climate_station = null } = {}) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV leer");
  const header = lines[0].split(",");
  const idx = (k) => header.indexOf(k);
  const rows = lines.slice(1).filter(Boolean).map((ln) => ln.split(","));
  const val = (cols, k) => (idx(k) >= 0 ? cols[idx(k)] : "");
  const num = (cols, k, def = undefined) => {
    const raw = val(cols, k);
    if (raw === "" || raw === undefined) return def;
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  };

  const rooms = rows.map((cols) => ({
    name: val(cols, "name") || "Raum",
    envelope_area_m2: num(cols, "envelope_area_m2", 0),
    u_value_W_m2K: num(cols, "u_value_W_m2K", 0),
    delta_t_K: num(cols, "delta_t_K", 0),

    ventilation_strategy: val(cols, "ventilation_strategy") || "direct",
    airflow_m3h: num(cols, "airflow_m3h", 0),
    co2_emission_lph_per_person: num(cols, "co2_emission_lph_per_person", 18),
    co2_indoor_limit_ppm: num(cols, "co2_indoor_limit_ppm", 1000),
    co2_outdoor_ppm: num(cols, "co2_outdoor_ppm", 400),

    ventilation_deltaT_K: num(cols, "ventilation_deltaT_K"),
    ventilation_deltaW_kg_per_kg: num(cols, "ventilation_deltaW_kg_per_kg"),

    solar_mode: val(cols, "solar_mode") || "direct",
    solar_gains_W: num(cols, "solar_gains_W", 0),
    fenster_area_m2: num(cols, "fenster_area_m2", 0),
    g_value: num(cols, "g_value", 0.6),
    orient: val(cols, "orient") || "S",
    solar_irr_W_m2: num(cols, "solar_irr_W_m2", 450),
    mass_class: val(cols, "mass_class") || "medium",
    storage_factor_override: num(cols, "storage_factor_override"),

    people_count: num(cols, "people_count", 0),
    sensible_per_person_W: num(cols, "sensible_per_person_W", 75),
    latent_per_person_W: num(cols, "latent_per_person_W", 55),
    equipment_W: num(cols, "equipment_W", 0),
    lighting_W: num(cols, "lighting_W", 0),
  }));

  return { project_name, climate_station, rooms };
}
