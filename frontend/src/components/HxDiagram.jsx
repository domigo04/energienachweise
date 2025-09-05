import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

export default function HxDiagram({
  initialPressureKPa = 101.325,
  initialTRange = [-20, 50], // Minusbereich default
  initialXmax = 30,
  heightVh = 70,
  standalone = true,
}) {
  // -------------------- Konstanten --------------------
  const RATIO = 0.62198;   // m_wv/m_dry
  const Rd = 287.058;      // J/(kg·K)
  const Rv = 461.495;      // J/(kg·K)

  // -------------------- Zustand (simpel & robust) --------------------
  const [pressure, setPressure] = useState(initialPressureKPa);
  const [tempMin, setTempMin] = useState(initialTRange[0]);
  const [tempMax, setTempMax] = useState(initialTRange[1]);
  const [xMax, setXMax] = useState(Math.max(1, initialXmax)); // nie 0

  const [showIsoT, setShowIsoT] = useState(true);
  const [showRH, setShowRH] = useState(true);
  const [showSat, setShowSat] = useState(true);
  const [showHover, setShowHover] = useState(true);
  const [showClick, setShowClick] = useState(true);

  // Schritt 1 – WRG Eingänge
  const [T_oa, setT_oa] = useState(0);     // Außenluft T
  const [phi_oa, setPhi_oa] = useState(80);// Außenluft φ
  const [T_exh, setT_exh] = useState(22);  // Abluft T
  const [phi_exh, setPhi_exh] = useState(45); // Abluft φ
  const [Vdot_sup, setVdot_sup] = useState(2000); // Zuluft m³/h
  const [Vdot_exh, setVdot_exh] = useState(2000); // Abluft m³/h
  const [eta_wrg, setEta_wrg] = useState(70);     // sensible Effektivität %

  // Ergebnis WRG
  const [wrg, setWrg] = useState(null); // {T2, phi2, w_oa, h_oa, h2, Q, Cmin, Csup, Crec}

  // Schritt 2 – Heizer
  const [inletTemp, setInletTemp] = useState(18);
  const [inletHumidity, setInletHumidity] = useState(50);
  const [outletTemp, setOutletTemp] = useState(30);
  const [tempDiff, setTempDiff] = useState(""); // optional ΔT (String)
  const [volumeFlow, setVolumeFlow] = useState(2000); // = Zuluft; kann = Vdot_sup

  // Plot helpers
  const [plotTemp, setPlotTemp] = useState(20);
  const [plotHumidity, setPlotHumidity] = useState(50);

  const [points, setPoints] = useState([]);      // {x_gpkg, h, label}
  const [processes, setProcesses] = useState([]);// {type:'wrg'|'heater', p1, p2}
  const [msgWRG, setMsgWRG] = useState("");
  const [msgHeater, setMsgHeater] = useState("");
  const [msgPoint, setMsgPoint] = useState("");

  // Canvas refs
  const canvasRef = useRef(null);
  const animationRef = useRef();

  // -------------------- Psychrometrie --------------------
  const saturationPressure = (T) => 610.94 * Math.exp((17.625 * T) / (T + 243.04)); // ok ca. -45..60°C
  const humidityRatio = (T, RH, P) => {
    const phi = Math.max(0, Math.min(1, RH / 100));
    const pws = saturationPressure(T);
    const pw = phi * pws;
    const denom = P - pw;
    if (denom <= 1e-3 || !Number.isFinite(denom)) return 0;
    const w = (RATIO * pw) / denom;
    return Math.max(0, w);
  };
  const enthalpy = (T, w) => 1.006 * T + w * (2501 + 1.86 * T); // kJ/kg_dry
  const relHum = (T, w, P) => {
    const pws = saturationPressure(T);
    const pw = (w * P) / (RATIO + w);
    return 100 * Math.max(0, Math.min(1, pw / pws));
  };
  const Tfrom_h_w = (h, w) => (h - 2501 * w) / (1.006 + 1.86 * w);
  const rho_moist = (T, w, P) => {
    const TK = T + 273.15;
    const pw = (w * P) / (RATIO + w);
    const pd = P - pw;
    return pd / (Rd * TK) + pw / (Rv * TK);
  };

  // -------------------- Skalen (jetzt mit yMin dynamisch) --------------------
  const { yMin, yMaxCalc } = useMemo(() => {
    const wMax = Math.max(0, xMax / 1000);
    const hTop = enthalpy(tempMax, wMax);
    const hBottom = enthalpy(tempMin, 0); // minimal bei Tmin & trocken
    let ymax = Math.ceil((Math.max(hTop, 5) + 5) / 5) * 5;
    let ymin = Math.floor((Math.min(0, hBottom) - 5) / 5) * 5;
    if (ymax - ymin < 10) ymax = ymin + 10; // safety
    return { yMin: ymin, yMaxCalc: ymax };
  }, [tempMin, tempMax, xMax]);

  // -------------------- Zeichnen --------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Layout
    const pad = { left: 80, right: 50, top: 40, bottom: 70 };
    const plotW = Math.max(1, W - pad.left - pad.right);
    const plotH = Math.max(1, H - pad.top - pad.bottom);

    const x2px = (x) => pad.left + (x / xMax) * plotW;
    const y2py = (y) => pad.top + (1 - (y - yMin) / (yMaxCalc - yMin)) * plotH;
    const px2x = (px) => ((px - pad.left) / plotW) * xMax;
    const py2y = (py) => yMin + (1 - (py - pad.top) / plotH) * (yMaxCalc - yMin);

    // Grid X
    ctx.lineWidth = 1;
    ctx.font = "13px system-ui";
    for (let x = 0; x <= xMax; x += 2) {
      const px = x2px(x);
      ctx.strokeStyle = x % 10 === 0 ? "#cbd5e1" : "#f1f5f9";
      ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, pad.top + plotH); ctx.stroke();
      if (x % 10 === 0) {
        ctx.fillStyle = "#334155";
        ctx.textAlign = "center";
        ctx.fillText(String(x), px, pad.top + plotH + 20);
      }
    }
    // Grid Y
    const yStep = 5;
    const yStart = Math.ceil(yMin / yStep) * yStep;
    for (let y = yStart; y <= yMaxCalc; y += yStep) {
      const py = y2py(y);
      ctx.strokeStyle = (Math.round(y) % 20 === 0) ? "#cbd5e1" : "#f1f5f9";
      ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(pad.left + plotW, py); ctx.stroke();
      if (Math.round(y) % 10 === 0) {
        ctx.fillStyle = "#334155";
        ctx.textAlign = "right";
        ctx.fillText(String(y), pad.left - 10, py + 4);
      }
    }

    // Labels
    ctx.fillStyle = "#0f172a";
    ctx.font = "15px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("x [g/kg trockene Luft]", pad.left + plotW / 2, H - 18);

    ctx.save();
    ctx.translate(22, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("h [kJ/kg trockene Luft]", 0, 0);
    ctx.restore();

    // Isothermen
    if (showIsoT) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#0284c7";
      for (let T = tempMin; T <= tempMax; T += 5) {
        const h0 = enthalpy(T, 0);
        const h1 = enthalpy(T, xMax / 1000);
        ctx.beginPath();
        ctx.moveTo(x2px(0), y2py(h0));
        ctx.lineTo(x2px(xMax), y2py(h1));
        ctx.stroke();
        // Label am rechten Rand
        ctx.fillStyle = "#0369a1";
        ctx.font = "12px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(`${T}°C`, x2px(xMax) - 6, y2py(h1) - 4);
      }
    }

    // φ-Kurven
    if (showRH) {
      const P = pressure * 1000;
      const RHs = [10,20,30,40,50,60,70,80,90];
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = "#7c3aed";
      for (const RH of RHs) {
        let moved = false;
        ctx.beginPath();
        for (let T = tempMin; T <= tempMax; T += 0.5) {
          const w = humidityRatio(T, RH, P);
          const x = 1000 * w;
          if (!Number.isFinite(w) || x > xMax) continue;
          const h = enthalpy(T, w);
          const X = x2px(x), Y = y2py(h);
          if (!moved) { ctx.moveTo(X, Y); moved = true; } else { ctx.lineTo(X, Y); }
        }
        moved && ctx.stroke();
        // Label an letzter gültiger Stelle
        for (let T = tempMax; T >= tempMin; T -= 1) {
          const w = humidityRatio(T, RH, P), x = 1000 * w;
          if (Number.isFinite(w) && x <= xMax) {
            const h = enthalpy(T, w);
            ctx.fillStyle = "#6d28d9";
            ctx.font = "11px system-ui";
            ctx.textAlign = "left";
            ctx.fillText(`φ ${RH}%`, x2px(x) + 6, y2py(h) + 4);
            break;
          }
        }
      }
    }

    // Sättigung
    if (showSat) {
      const P = pressure * 1000;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let moved = false;
      for (let T = tempMin; T <= tempMax; T += 0.3) {
        const w = humidityRatio(T, 100, P);
        const x = 1000 * w;
        if (!Number.isFinite(w) || x > xMax) continue;
        const h = enthalpy(T, w);
        const X = x2px(x), Y = y2py(h);
        if (!moved) { ctx.moveTo(X, Y); moved = true; } else { ctx.lineTo(X, Y); }
      }
      moved && ctx.stroke();
    }

    // Prozesse
    for (const pr of processes) {
      const { p1, p2, type } = pr;
      const col = type === "wrg" ? "#3b82f6" : "#fb923c";
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x2px(p1.x_gpkg), y2py(p1.h));
      ctx.lineTo(x2px(p2.x_gpkg), y2py(p2.h));
      ctx.stroke();
    }

    // Punkte
    for (const p of points) {
      ctx.fillStyle = "#0ea5e9";
      ctx.strokeStyle = "#0369a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x2px(p.x_gpkg), y2py(p.h), 5.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.font = "12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(p.label, x2px(p.x_gpkg) + 8, y2py(p.h) - 8);
    }

    // Expose scaler
    canvas._x2px = x2px;
    canvas._y2py = y2py;
    canvas._px2x = px2x;
    canvas._py2y = py2y;
    canvas._pad = pad;
    canvas._plotW = plotW;
    canvas._plotH = plotH;
    canvas._yMin = yMin;
    canvas._yMax = yMaxCalc;
  }, [pressure, tempMin, tempMax, xMax, yMin, yMaxCalc, showIsoT, showRH, showSat, points, processes]);

  // -------------------- Maus / Crosshair --------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e) => {
      if (!showHover) { draw(); return; }
      const rect = canvas.getBoundingClientRect();
      const x = canvas._px2x?.(e.clientX - rect.left) ?? 0;
      const h = canvas._py2y?.(e.clientY - rect.top) ?? 0;
      if (x < 0 || x > xMax || h < yMin || h > yMaxCalc) { draw(); return; }

      draw();
      const ctx = canvas.getContext("2d");
      const x2px = canvas._x2px, y2py = canvas._y2py, pad = canvas._pad;

      // Crosshair
      ctx.strokeStyle = "#94a3b8";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x2px(x), pad.top); ctx.lineTo(x2px(x), pad.top + canvas._plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.left, y2py(h)); ctx.lineTo(pad.left + canvas._plotW, y2py(h)); ctx.stroke();
      ctx.setLineDash([]);

      // Info
      const w = Math.max(0, x / 1000);
      const T = Tfrom_h_w(h, w);
      const RH = relHum(T, w, pressure * 1000);
      const boxX = x2px(x) + 12, boxY = y2py(h) - 12;
      const lines = [
        `x = ${x.toFixed(2)} g/kg`,
        `h = ${h.toFixed(1)} kJ/kg`,
        `T ≈ ${T.toFixed(1)} °C`,
        `φ ≈ ${Math.max(0, Math.min(100, RH)).toFixed(0)} %`,
      ];
      const bw = 150, bh = 90;
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.strokeStyle = "#e2e8f0";
      ctx.fillRect(boxX, boxY - bh, bw, bh); ctx.strokeRect(boxX, boxY - bh, bw, bh);
      ctx.fillStyle = "#0f172a"; ctx.font = "12px system-ui"; ctx.textAlign = "left";
      lines.forEach((ln, i) => ctx.fillText(ln, boxX + 8, boxY - bh + 20 + i * 16));
    };

    const onLeave = () => draw();
    const onClick = (e) => {
      if (!showClick) return;
      const rect = canvas.getBoundingClientRect();
      const x = canvas._px2x?.(e.clientX - rect.left) ?? 0;
      const h = canvas._py2y?.(e.clientY - rect.top) ?? 0;
      if (x < 0 || x > xMax || h < yMin || h > yMaxCalc) return;

      const w = Math.max(0, x / 1000);
      const T = Tfrom_h_w(h, w);
      const RH = relHum(T, w, pressure * 1000);
      const pt = { x_gpkg: x, h, label: `${T.toFixed(0)}°C/${Math.max(0, Math.min(100, RH)).toFixed(0)}%` };
      setPoints((p) => [...p, pt]);
      setMsgPoint(`Punkt: T=${T.toFixed(1)}°C · φ=${Math.max(0, Math.min(100, RH)).toFixed(0)}% · x=${x.toFixed(2)} g/kg · h=${h.toFixed(1)} kJ/kg`);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [showHover, showClick, xMax, yMin, yMaxCalc, pressure, draw]);

  // -------------------- Render/Resize --------------------
  useEffect(() => {
    const onResize = () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [draw]);

  // -------------------- Eingabefelder (fokus-sicher) --------------------
  const NumberField = ({ label, value, onCommit, unit, min, max, placeholder }) => {
    const [draft, setDraft] = useState(String(value));
    useEffect(() => { setDraft(String(value)); }, [value]);
    const parseDraft = (s) => {
      const t = String(s).trim().replace(",", ".");
      if (t === "" || t === "-" || t === "." || t === "-.") return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    };
    const commit = () => {
      const n = parseDraft(draft);
      if (n === null) { setDraft(String(value)); return; }
      if (typeof min === "number" && n < min) { onCommit(min); setDraft(String(min)); return; }
      if (typeof max === "number" && n > max) { onCommit(max); setDraft(String(max)); return; }
      onCommit(n);
    };
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
          {unit && <span className="absolute right-3 top-2 text-sm text-slate-400 select-none">{unit}</span>}
        </div>
      </div>
    );
  };

  const Check = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  const Card = ({ title, children }) => (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="p-4">
        <h3 className="text-base font-semibold text-slate-900 mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );

  const Btn = ({ children, onClick, kind="primary", disabled }) => {
    const cls = kind === "primary"
      ? "bg-blue-600 hover:bg-blue-700 text-white"
      : kind === "warn"
      ? "bg-orange-600 hover:bg-orange-700 text-white"
      : "bg-slate-200 hover:bg-slate-300 text-slate-800";
    return (
      <button onClick={onClick} disabled={disabled}
        className={`px-3 py-2 rounded-lg text-sm font-medium ${cls} disabled:opacity-50`}>
        {children}
      </button>
    );
  };

  // -------------------- Aktionen --------------------
  const addPoint = () => {
    try {
      const P = pressure * 1000;
      const w = humidityRatio(plotTemp, plotHumidity, P);
      const h = enthalpy(plotTemp, w);
      const x = 1000 * w;
      const pt = { x_gpkg: x, h, label: `${plotTemp}°C/${plotHumidity}%` };
      setPoints(p => [...p, pt]);
      setMsgPoint(`Punkt: x=${x.toFixed(2)} g/kg · h=${h.toFixed(1)} kJ/kg`);
    } catch { setMsgPoint("Fehler bei Punktberechnung"); }
  };

  // WRG (sensible) mit Capacity-Rates
  const calcWRG = () => {
    try {
      const P = pressure * 1000;
      const w_oa = humidityRatio(T_oa, phi_oa, P);
      const w_ex = humidityRatio(T_exh, phi_exh, P);
      const h_oa = enthalpy(T_oa, w_oa);

      const rho_sa = rho_moist(T_oa, w_oa, P); // Zuluft Dichte bei OA
      const rho_ra = rho_moist(T_exh, w_ex, P); // Abluft Dichte bei Abluftzustand

      const m_m_sa = (rho_sa * Math.max(0, Vdot_sup)) / 3600; // kg/s
      const m_m_ra = (rho_ra * Math.max(0, Vdot_exh)) / 3600; // kg/s
      const m_d_sa = m_m_sa / (1 + w_oa);
      const m_d_ra = m_m_ra / (1 + w_ex);

      const c_p_sa = 1.006 + 1.86 * w_oa; // kJ/(kg_dry·K) – dh/dT|w
      const c_p_ra = 1.006 + 1.86 * w_ex;

      const Csup = m_d_sa * c_p_sa; // kW/K
      const Crec = m_d_ra * c_p_ra; // kW/K
      if (!(Csup > 0 && Crec > 0)) { setMsgWRG("WRG: ungültige Volumenströme/Zustände"); return; }

      const Cmin = Math.min(Csup, Crec);
      const eps = Math.max(0, Math.min(1, eta_wrg / 100));

      // Q = ε * Cmin * (T_ra - T_oa)
      const QkW = eps * Cmin * (T_exh - T_oa);
      const T2 = T_oa + QkW / Csup; // Zuluft nach WRG
      const h2 = enthalpy(T2, w_oa);
      const phi2 = relHum(T2, w_oa, P);

      // Plot: von OA → WRG-Auslass (Zuluftseite)
      const x = 1000 * w_oa;
      const p1 = { x_gpkg: x, h: h_oa, label: `Außen ${T_oa.toFixed(0)}°C/${phi_oa.toFixed(0)}%` };
      const p2 = { x_gpkg: x, h: h2,  label: `WRG ${T2.toFixed(0)}°C/${Math.max(0,Math.min(100,phi2)).toFixed(0)}%` };
      setPoints(p => [...p, p1, p2]);
      setProcesses(pr => [...pr, { type: "wrg", p1, p2 }]);

      setWrg({ T2, phi2, w_oa, h_oa, h2, Q: QkW, Cmin, Csup, Crec });
      setMsgWRG(`WRG: T₂=${T2.toFixed(1)}°C · φ₂=${Math.max(0,Math.min(100,phi2)).toFixed(0)}% · Q=${QkW.toFixed(2)} kW (ε=${(eps*100).toFixed(0)}%, Cmin=${Cmin.toFixed(2)} kW/K)`);
    } catch (e) {
      setMsgWRG("WRG: Fehler – " + e.message);
    }
  };

  const applyWRGtoHeaterInlet = () => {
    if (!wrg) return;
    setInletTemp(+wrg.T2.toFixed(2));
    setInletHumidity(+Math.max(0, Math.min(100, wrg.phi2)).toFixed(0));
    setVolumeFlow(Vdot_sup); // Zuluftfluss übernehmen
  };

  // Heizer (nur Lüftungsseite, w = konst.)
  const calcHeater = () => {
    try {
      const P = pressure * 1000;
      const dT = parseFloat(String(tempDiff).replace(",", "."));
      const T2eff = tempDiff !== "" && Number.isFinite(dT) ? inletTemp + dT : outletTemp;
      if (!(T2eff > inletTemp)) { setMsgHeater("Heizer: T₂ muss > T₁ sein"); return; }

      const w = humidityRatio(inletTemp, inletHumidity, P); // w bleibt
      const h1 = enthalpy(inletTemp, w);
      const h2 = enthalpy(T2eff, w);
      const x = 1000 * w;

      const rho1 = rho_moist(inletTemp, w, P);
      const m_m = (rho1 * Math.max(0, volumeFlow)) / 3600; // kg/s
      const m_d = m_m / (1 + w);
      const QkW = m_d * (h2 - h1);
      const phi2 = relHum(T2eff, w, P);

      const p1 = { x_gpkg: x, h: h1, label: `Ein ${inletTemp.toFixed(0)}°C/${inletHumidity.toFixed(0)}%` };
      const p2 = { x_gpkg: x, h: h2, label: `Aus ${T2eff.toFixed(0)}°C/${Math.max(0,Math.min(100,phi2)).toFixed(0)}%` };
      setPoints(p => [...p, p1, p2]);
      setProcesses(pr => [...pr, { type: "heater", p1, p2 }]);

      setMsgHeater(`Heizer: Q=${QkW.toFixed(2)} kW · ṁ_da=${m_d.toFixed(3)} kg/s · φ₂=${Math.max(0,Math.min(100,phi2)).toFixed(0)}%`);
    } catch (e) {
      setMsgHeater("Heizer: Fehler – " + e.message);
    }
  };

  const clearAll = () => {
    setPoints([]); setProcesses([]); setMsgPoint(""); setMsgWRG(""); setMsgHeater(""); setWrg(null);
  };

  // -------------------- Export (einfach gehalten) --------------------
  const savePNG = () => {
    const a = document.createElement("a");
    a.download = "hx-diagramm.png";
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
  };

  const buildSVG = () => {
    const W = 1123, H = 794, padL = 80, padR = 50, padT = 40, padB = 70;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x2px = (x) => padL + (x / xMax) * plotW;
    const y2py = (y) => padT + (1 - (y - yMin) / (yMaxCalc - yMin)) * plotH;
    const P = pressure * 1000;

    const pathIsoT = (T) => `M ${x2px(0)} ${y2py(enthalpy(T,0))} L ${x2px(xMax)} ${y2py(enthalpy(T,xMax/1000))}`;
    const pathRH = (RH) => {
      let d="", first=true;
      for (let T = tempMin; T <= tempMax; T += 0.5) {
        const w = humidityRatio(T, RH, P), x = 1000*w;
        if (!Number.isFinite(w) || x > xMax) continue;
        const X = x2px(x), Y = y2py(enthalpy(T,w));
        d += first ? `M ${X.toFixed(1)} ${Y.toFixed(1)}` : ` L ${X.toFixed(1)} ${Y.toFixed(1)}`;
        first = false;
      }
      return d;
    };

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="#fff"/>`;

    // grid X
    for (let x = 0; x <= xMax; x += 2) {
      const col = x%10===0 ? "#cbd5e1" : "#f1f5f9";
      svg += `\n<line x1="${x2px(x)}" y1="${padT}" x2="${x2px(x)}" y2="${padT+plotH}" stroke="${col}" stroke-width="1"/>`;
      if (x%10===0) svg += `\n<text x="${x2px(x)}" y="${padT+plotH+20}" text-anchor="middle" fill="#334155" font-size="12">${x}</text>`;
    }
    // grid Y
    for (let y = Math.ceil(yMin/5)*5; y <= yMaxCalc; y += 5) {
      const col = (Math.round(y)%20===0) ? "#cbd5e1" : "#f1f5f9";
      svg += `\n<line x1="${padL}" y1="${y2py(y)}" x2="${padL+plotW}" y2="${y2py(y)}" stroke="${col}" stroke-width="1"/>`;
      if (Math.round(y)%10===0) svg += `\n<text x="${padL-10}" y="${y2py(y)+4}" text-anchor="end" fill="#334155" font-size="12">${y}</text>`;
    }

    if (showIsoT) for (let T = tempMin; T <= tempMax; T+=5) svg += `\n<path d="${pathIsoT(T)}" stroke="#0284c7" stroke-width="1.2" fill="none"/>`;
    if (showRH)  for (const rh of [10,20,30,40,50,60,70,80,90]) svg += `\n<path d="${pathRH(rh)}" stroke="#7c3aed" stroke-width="1.1" fill="none"/>`;
    if (showSat) svg += `\n<path d="${pathRH(100)}" stroke="#ef4444" stroke-width="2" fill="none"/>`;

    // axes labels
    svg += `\n<text x="${padL+plotW/2}" y="${H-18}" text-anchor="middle" fill="#0f172a" font-size="14">x [g/kg trockene Luft]</text>`;
    svg += `\n<g transform="translate(22 ${padT+plotH/2}) rotate(-90)"><text text-anchor="middle" fill="#0f172a" font-size="14">h [kJ/kg trockene Luft]</text></g>`;

    // processes
    for (const pr of processes) {
      const col = pr.type==="wrg" ? "#3b82f6" : "#fb923c";
      svg += `\n<line x1="${x2px(pr.p1.x_gpkg)}" y1="${y2py(pr.p1.h)}" x2="${x2px(pr.p2.x_gpkg)}" y2="${y2py(pr.p2.h)}" stroke="${col}" stroke-width="3.5"/>`;
    }
    // points
    for (const p of points) {
      svg += `\n<circle cx="${x2px(p.x_gpkg)}" cy="${y2py(p.h)}" r="5.5" fill="#0ea5e9" stroke="#0369a1" stroke-width="2"/>`;
    }

    svg += `\n</svg>`;
    return svg;
  };

  const saveSVG = () => {
    const svg = buildSVG();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hx-diagramm.svg"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const svg = buildSVG();
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>@page{size:A4 landscape;margin:0}html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;background:#fff}svg{width:100%;height:auto}</style>
</head><body onload="setTimeout(()=>{print()},100)">${svg}</body></html>`;
    const w = window.open("", "_blank"); if (!w) return alert("Popup-Blocker?");
    w.document.open(); w.document.write(html); w.document.close();
  };

  // -------------------- Legende: frei verschiebbar (viewport) --------------------
  const legendRef = useRef(null);
  const [legendFree, setLegendFree] = useState(true);
  const [legendPos, setLegendPos] = useState({ x: 24, y: 24 }); // viewport-Koordinaten
  const dragRef = useRef({ dragging:false, dx:0, dy:0 });

  useEffect(() => {
    const move = (cx, cy) => {
      if (!dragRef.current.dragging || !legendRef.current) return;
      const nx = cx - dragRef.current.dx;
      const ny = cy - dragRef.current.dy;
      // Optional: an den Viewportrand clampen (damit nicht "weg")
      const vw = window.innerWidth, vh = window.innerHeight;
      const lw = legendRef.current.offsetWidth, lh = legendRef.current.offsetHeight;
      const margin = 4;
      setLegendPos({
        x: Math.max(-lw + margin, Math.min(nx, vw - margin)),
        y: Math.max(-lh + margin, Math.min(ny, vh - margin))
      });
    };
    const onMouseMove = (e) => move(e.clientX, e.clientY);
    const onMouseUp = () => { dragRef.current.dragging = false; };
    const onTouchMove = (e) => { if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchEnd = () => { dragRef.current.dragging = false; };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive:false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const startLegendDrag = (e) => {
    if (!legendFree) return;
    const rect = legendRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current.dragging = true;
    dragRef.current.dx = cx - rect.left;
    dragRef.current.dy = cy - rect.top;
    e.preventDefault();
  };

  const resetLegend = () => setLegendPos({ x: 24, y: 24 });

  // -------------------- UI --------------------
  const Main = () => (
    <div className="max-w-7xl mx-auto p-6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* Schritt 0 – Anzeige/Diagramm */}
        <div className="xl:col-span-1 space-y-6">
          <Card title="Diagramm">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="p" value={pressure} onCommit={setPressure} unit="kPa" />
              <NumberField label="x max" value={xMax} onCommit={(v)=>setXMax(Math.max(1, v))} unit="g/kg" />
              <NumberField label="T min" value={tempMin} onCommit={setTempMin} unit="°C" />
              <NumberField label="T max" value={tempMax} onCommit={setTempMax} unit="°C" />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <Check label="Isothermen" checked={showIsoT} onChange={setShowIsoT} />
              <Check label="φ-Kurven" checked={showRH} onChange={setShowRH} />
              <Check label="Sättigung" checked={showSat} onChange={setShowSat} />
              <Check label="Hover" checked={showHover} onChange={setShowHover} />
              <Check label="Klick→Punkt" checked={showClick} onChange={setShowClick} />
            </div>
          </Card>

          {/* Schritt 1 – WRG */}
          <Card title="Schritt 1 · WRG (Plattentauscher, sensible)">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Außenluft T" value={T_oa} onCommit={setT_oa} unit="°C" />
              <NumberField label="Außenluft φ" value={phi_oa} onCommit={setPhi_oa} unit="%" />
              <NumberField label="Abluft T" value={T_exh} onCommit={setT_exh} unit="°C" />
              <NumberField label="Abluft φ" value={phi_exh} onCommit={setPhi_exh} unit="%" />
              <NumberField label="Zuluft V̇" value={Vdot_sup} onCommit={setVdot_sup} unit="m³/h" />
              <NumberField label="Abluft V̇" value={Vdot_exh} onCommit={setVdot_exh} unit="m³/h" />
              <NumberField label="WRG ε (sens.)" value={eta_wrg} onCommit={setEta_wrg} unit="%" />
            </div>
            <div className="mt-3 flex gap-2">
              <Btn onClick={calcWRG} kind="primary">WRG berechnen</Btn>
              <Btn onClick={applyWRGtoHeaterInlet} disabled={!wrg}>→ Heizer-Eintritt übernehmen</Btn>
            </div>
            {msgWRG && <div className="mt-3 text-sm p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">{msgWRG}</div>}
            <p className="mt-2 text-xs text-slate-500">Methode: ε·C<sub>min</sub>·ΔT; keine Feuchterückgewinnung.</p>
          </Card>

          {/* Schritt 2 – Heizer */}
          <Card title="Schritt 2 · Lufterhitzer (nur Lüftungsseite)">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="T₁ (Eintritt)" value={inletTemp} onCommit={setInletTemp} unit="°C" />
              <NumberField label="φ₁ (Eintritt)" value={inletHumidity} onCommit={setInletHumidity} unit="%" />
              <NumberField label="Ziel T₂" value={outletTemp} onCommit={setOutletTemp} unit="°C" />
              <NumberField label="oder ΔT" value={tempDiff} onCommit={(v)=>setTempDiff(String(v))} unit="K" />
              <NumberField label="Zuluft V̇" value={volumeFlow} onCommit={setVolumeFlow} unit="m³/h" />
            </div>
            <div className="mt-3 flex gap-2">
              <Btn onClick={calcHeater} kind="warn">Heizleistung berechnen</Btn>
              <Btn onClick={clearAll}>Alles löschen</Btn>
            </div>
            {msgHeater && <div className="mt-3 text-sm p-2 rounded bg-orange-50 border border-orange-200 text-orange-800">{msgHeater}</div>}
          </Card>

          {/* Zusatz: Punkt plotten */}
          <Card title="Punkt plotten (T/φ)">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="T" value={plotTemp} onCommit={setPlotTemp} unit="°C" />
              <NumberField label="φ" value={plotHumidity} onCommit={setPlotHumidity} unit="%" />
            </div>
            <div className="mt-3 flex gap-2">
              <Btn onClick={addPoint}>Punkt hinzufügen</Btn>
              <Btn onClick={savePNG}>PNG</Btn>
              <Btn onClick={saveSVG}>SVG</Btn>
              <Btn onClick={exportPDF}>PDF</Btn>
            </div>
            {msgPoint && <div className="mt-3 text-sm p-2 rounded bg-blue-50 border border-blue-200 text-blue-800">{msgPoint}</div>}
          </Card>
        </div>

        {/* Diagramm */}
        <div className="xl:col-span-3">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
            <div className="text-sm text-slate-600 mb-2">h–x Mollier (SI) · {pressure} kPa</div>
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="w-full rounded border border-slate-200 bg-white"
                style={{ height: `${heightVh}vh`, minHeight: "600px", cursor: "crosshair" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* FREI BEWEGLICHE LEGENDE (viewport-fixed) */}
      <div
        ref={legendRef}
        onMouseDown={startLegendDrag}
        onTouchStart={startLegendDrag}
        className="fixed z-[9999] bg-white/95 backdrop-blur-sm border border-slate-300 rounded-lg shadow-md select-none"
        style={{ left: `${legendPos.x}px`, top: `${legendPos.y}px`, width: 220 }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200"
             style={{ cursor: legendFree ? "grab" : "default" }}>
          <div className="text-sm font-semibold text-slate-800">Legende</div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={!legendFree} onChange={(e)=>setLegendFree(!e.target.checked)} />
              fixieren
            </label>
            <button onClick={resetLegend} title="zurücksetzen">↺</button>
          </div>
        </div>
        <div className="p-3 text-xs text-slate-700 space-y-1">
          <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-sky-600" /> Isothermen (T=konst.)</div>
          <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-purple-600" /> φ-Kurven</div>
          <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-red-500" /> Sättigung</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-sky-500 border border-sky-700" /> Punkt</div>
          <div className="flex items-center gap-2"><div className="w-5 h-1 bg-blue-500" /> WRG-Prozess</div>
          <div className="flex items-center gap-2"><div className="w-5 h-1 bg-orange-400" /> Heizer-Prozess</div>
          <div className="pt-2 text-[11px] text-slate-500">Drag & Drop überall; „fixieren“ sperrt Drag.</div>
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <h1 className="text-2xl font-bold text-slate-900">Mollier h–x Diagramm (SI)</h1>
            <p className="text-slate-600 text-sm">Schritt 1: WRG → Schritt 2: Heizer · Minus-T unterstützt</p>
          </div>
        </header>
        <Main />
      </div>
    );
  }
  return <Main />;
}
