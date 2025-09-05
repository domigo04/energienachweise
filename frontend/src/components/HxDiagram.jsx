import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

export default function HxDiagram({
  initialPressureKPa = 101.325,
  initialTRange = [0, 50],
  initialXmax = 30,
  heightVh = 70,
  standalone = true,
}) {
  // -------------------- Konstanten --------------------
  const RATIO = 0.62198;   // m_wv/m_dry
  const Rd = 287.058;      // J/(kg·K)
  const Rv = 461.495;      // J/(kg·K)

  // -------------------- Zustand --------------------
  const [pressure, setPressure] = useState(initialPressureKPa);
  const [tempMin, setTempMin] = useState(initialTRange[0]);
  const [tempMax, setTempMax] = useState(initialTRange[1]);
  const [xMax, setXMax] = useState(initialXmax);

  const [showIsoT, setShowIsoT] = useState(true);
  const [showRH, setShowRH] = useState(true);
  const [showSat, setShowSat] = useState(true);
  const [showHover, setShowHover] = useState(true);
  const [showClick, setShowClick] = useState(true);

  const [plotTemp, setPlotTemp] = useState(20);
  const [plotHumidity, setPlotHumidity] = useState(50);

  // Heizer (Zuluftseite)
  const [volumeFlow, setVolumeFlow] = useState(2000); // m³/h Zuluft
  const [inletTemp, setInletTemp] = useState(20);
  const [inletHumidity, setInletHumidity] = useState(40);
  const [outletTemp, setOutletTemp] = useState(30);
  const [tempDiff, setTempDiff] = useState(""); // optional ΔT (String)

  // WRG / Plattentauscher (sensible)
  const [T_oa, setT_oa] = useState(0);     // Außenluft T
  const [phi_oa, setPhi_oa] = useState(80); // Außenluft φ
  const [T_exh, setT_exh] = useState(22);   // Abluft T
  const [eta_wrg, setEta_wrg] = useState(70); // sensible WRG in %

  // WRG Ergebnis (Zuluft vor Heizer)
  const [wrgResult, setWrgResult] = useState(null); // {T2, phi2, x_gpkg, h1, h2, Q_wrg}

  const [points, setPoints] = useState([]);      // {x_gpkg, h, label}
  const [processes, setProcesses] = useState([]); // {type:'heater'|'wrg', p1, p2}
  const [outputText, setOutputText] = useState("");
  const [processText, setProcessText] = useState("");
  const [wrgText, setWrgText] = useState("");

  // -------------------- Canvas & Wrapper --------------------
  const canvasRef = useRef(null);
  const chartWrapRef = useRef(null);
  const animationRef = useRef();

  // Legende: draggable
  const legendRef = useRef(null);
  const [legendPos, setLegendPos] = useState({ x: null, y: null });
  const dragStateRef = useRef({ dragging: false, dx: 0, dy: 0 });

  // -------------------- Psychrometrie --------------------
  const saturationPressure = (T) => 610.94 * Math.exp((17.625 * T) / (T + 243.04)); // 0..50°C
  const humidityRatio = (T, RH, P) => {
    const phi = Math.max(0, Math.min(1, RH / 100));
    const pws = saturationPressure(T);
    const pw = phi * pws;
    const denom = P - pw;
    return denom <= 1e-3 ? 0 : (RATIO * pw) / denom;
  };
  const enthalpy = (T, w) => 1.006 * T + w * (2501 + 1.86 * T);
  const relativeHumidity = (T, w, P) => {
    const pws = saturationPressure(T);
    const pw = (w * P) / (RATIO + w);
    return 100 * Math.max(0, Math.min(1, pw / pws));
  };
  const temperatureFromEnthalpy = (h, w) => (h - 2501 * w) / (1.006 + 1.86 * w);
  const density = (T, w, P) => {
    const TK = T + 273.15;
    const pw = (w * P) / (RATIO + w);
    const pd = P - pw;
    return pd / (Rd * TK) + pw / (Rv * TK);
  };

  // -------------------- Skalen --------------------
  const yMaxCalc = useMemo(() => {
    const w = Math.min(xMax / 1000, 0.05);
    const h = enthalpy(tempMax, w);
    return Math.ceil((h + 5) / 5) * 5;
  }, [tempMax, xMax]);

  // -------------------- Zeichnen --------------------
  const drawDiagram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Hintergrund
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Layout
    const pad = { left: 80, right: 50, top: 50, bottom: 80 };
    const plotWidth = rect.width - pad.left - pad.right;
    const plotHeight = rect.height - pad.top - pad.bottom;

    // Skalen
    const xScale = (x) => pad.left + (x / xMax) * plotWidth;
    const yScale = (y) => pad.top + (1 - y / yMaxCalc) * plotHeight;
    const xInverse = (px) => ((px - pad.left) / plotWidth) * xMax;
    const yInverse = (py) => (1 - (py - pad.top) / plotHeight) * yMaxCalc;

    // Grid
    ctx.lineWidth = 1;
    ctx.font = "13px system-ui";

    for (let x = 0; x <= xMax; x += 2) {
      const px = xScale(x);
      ctx.strokeStyle = x % 10 === 0 ? "#cbd5e1" : "#f1f5f9";
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotHeight);
      ctx.stroke();
      if (x % 10 === 0) {
        ctx.fillStyle = "#475569";
        ctx.textAlign = "center";
        ctx.fillText(String(x), px, pad.top + plotHeight + 20);
      }
    }
    for (let y = 0; y <= yMaxCalc; y += 5) {
      const py = yScale(y);
      ctx.strokeStyle = y % 20 === 0 ? "#cbd5e1" : "#f1f5f9";
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotWidth, py);
      ctx.stroke();
      if (y % 10 === 0) {
        ctx.fillStyle = "#475569";
        ctx.textAlign = "right";
        ctx.fillText(String(y), pad.left - 10, py + 5);
      }
    }

    // Achsen
    ctx.fillStyle = "#1e293b";
    ctx.font = "16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Feuchtigkeitsgehalt x [g/kg trockene Luft]", pad.left + plotWidth / 2, rect.height - 20);
    ctx.save();
    ctx.translate(25, pad.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Enthalpie h [kJ/kg trockene Luft]", 0, 0);
    ctx.restore();

    // Isothermen
    if (showIsoT) {
      ctx.lineWidth = 1.5;
      for (let T = tempMin; T <= tempMax; T += 5) {
        const h0 = enthalpy(T, 0);
        const h1 = enthalpy(T, xMax / 1000);
        ctx.strokeStyle = "#0ea5e9"; // sky-500
        ctx.beginPath();
        ctx.moveTo(xScale(0), yScale(h0));
        ctx.lineTo(xScale(xMax), yScale(h1));
        ctx.stroke();

        ctx.fillStyle = "#0369a1";
        ctx.font = "12px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(`${T}°C`, xScale(xMax) - 8, yScale(h1) - 5);
      }
    }

    // φ-Kurven
    if (showRH) {
      const P = pressure * 1000;
      const rhValues = [10, 20, 30, 40, 50, 60, 70, 80, 90];
      ctx.lineWidth = 1.2;
      for (const rh of rhValues) {
        ctx.strokeStyle = "#a78bfa"; // purple-400
        ctx.beginPath();
        let first = true;
        for (let T = tempMin; T <= tempMax; T += 0.5) {
          const w = humidityRatio(T, rh, P);
          const x = w * 1000;
          if (!Number.isFinite(w) || w < 0 || x > xMax) continue;
          const h = enthalpy(T, w);
          const px = xScale(x), py = yScale(h);
          if (first) { ctx.moveTo(px, py); first = false; } else { ctx.lineTo(px, py); }
        }
        ctx.stroke();

        for (let T = tempMax; T >= tempMin; T -= 2) {
          const w = humidityRatio(T, rh, P);
          const x = w * 1000;
          if (Number.isFinite(w) && w >= 0 && x <= xMax - 3) {
            const h = enthalpy(T, w);
            ctx.fillStyle = "#7c3aed";
            ctx.font = "11px system-ui";
            ctx.textAlign = "left";
            ctx.fillText(`φ ${rh}%`, xScale(x) + 8, yScale(h) + 4);
            break;
          }
        }
      }
    }

    // Sättigung
    if (showSat) {
      const P = pressure * 1000;
      ctx.strokeStyle = "#ef4444"; // red-500
      ctx.lineWidth = 3;
      ctx.beginPath();
      let first = true;
      for (let T = tempMin; T <= tempMax; T += 0.3) {
        const w = humidityRatio(T, 100, P);
        const x = w * 1000;
        if (!Number.isFinite(w) || x > xMax) continue;
        const h = enthalpy(T, w);
        const px = xScale(x), py = yScale(h);
        if (first) { ctx.moveTo(px, py); first = false; } else { ctx.lineTo(px, py); }
      }
      ctx.stroke();

      ctx.fillStyle = "#b91c1c";
      ctx.font = "13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("Sättigung", xScale(4), yScale(25));
    }

    // Prozesse
    for (const proc of processes) {
      const { p1, p2, type } = proc;
      let col = "#fb923c"; // heater default
      if (type === "wrg") col = "#3b82f6"; // blue
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(xScale(p1.x_gpkg), yScale(p1.h));
      ctx.lineTo(xScale(p2.x_gpkg), yScale(p2.h));
      ctx.stroke();

      // Pfeilspitze
      const dx = xScale(p2.x_gpkg) - xScale(p1.x_gpkg);
      const dy = yScale(p2.h) - yScale(p1.h);
      const len = Math.hypot(dx, dy);
      if (len > 15) {
        const ux = dx / len, uy = dy / len;
        const px = xScale(p2.x_gpkg), py = yScale(p2.h);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 15 * ux + 5 * uy, py - 15 * uy - 5 * ux);
        ctx.lineTo(px - 15 * ux - 5 * uy, py - 15 * uy + 5 * ux);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Punkte
    for (const point of points) {
      ctx.fillStyle = "#38bdf8";   // sky-400
      ctx.strokeStyle = "#0284c7"; // sky-600
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xScale(point.x_gpkg), yScale(point.h), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#1e293b";
      ctx.font = "12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(point.label, xScale(point.x_gpkg) + 10, yScale(point.h) - 10);
    }

    // speichern für Interaktion
    canvas._xScale = xScale;
    canvas._yScale = yScale;
    canvas._xInverse = xInverse;
    canvas._yInverse = yInverse;
    canvas._pad = pad;
    canvas._plotWidth = plotWidth;
    canvas._plotHeight = plotHeight;
  }, [pressure, tempMin, tempMax, xMax, yMaxCalc, showIsoT, showRH, showSat, points, processes]);

  // -------------------- Maus --------------------
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;

    const handleMove = (e) => {
      if (!showHover) { drawDiagram(); return; }
      const rect = canvas.getBoundingClientRect();
      const x = canvas._xInverse?.(e.clientX - rect.left) ?? 0;
      const h = canvas._yInverse?.(e.clientY - rect.top) ?? 0;
      if (x < 0 || x > xMax || h < 0 || h > yMaxCalc) { drawDiagram(); return; }

      drawDiagram();
      const ctx = canvas.getContext("2d");
      const xScale = canvas._xScale, yScale = canvas._yScale, pad = canvas._pad;

      // Crosshair
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(xScale(x), pad.top); ctx.lineTo(xScale(x), pad.top + canvas._plotHeight); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.left, yScale(h)); ctx.lineTo(pad.left + canvas._plotWidth, yScale(h)); ctx.stroke();
      ctx.setLineDash([]);

      // Info
      const w = Math.max(0, x / 1000);
      const T = temperatureFromEnthalpy(h, w);
      const RH = relativeHumidity(T, w, pressure * 1000);
      const boxX = xScale(x) + 15, boxY = yScale(h) - 15;
      const lines = [
        `x = ${x.toFixed(2)} g/kg`,
        `h = ${h.toFixed(1)} kJ/kg`,
        `T ≈ ${T.toFixed(1)} °C`,
        `φ ≈ ${Math.max(0, Math.min(100, RH)).toFixed(0)} %`,
      ];
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.strokeStyle = "#e2e8f0";
      const boxW = 140, boxH = 88;
      ctx.fillRect(boxX, boxY - boxH, boxW, boxH);
      ctx.strokeRect(boxX, boxY - boxH, boxW, boxH);
      ctx.fillStyle = "#1e293b";
      ctx.font = "12px system-ui"; ctx.textAlign = "left";
      lines.forEach((ln, i) => ctx.fillText(ln, boxX + 8, boxY - boxH + 20 + i * 16));
    };

    const handleLeave = () => drawDiagram();

    const handleClick = (e) => {
      if (!showClick) return;
      const rect = canvas.getBoundingClientRect();
      const x = canvas._xInverse?.(e.clientX - rect.left) ?? 0;
      const h = canvas._yInverse?.(e.clientY - rect.top) ?? 0;
      if (x < 0 || x > xMax || h < 0 || h > yMaxCalc) return;

      const w = Math.max(0, x / 1000);
      const T = temperatureFromEnthalpy(h, w);
      const RH = relativeHumidity(T, w, pressure * 1000);
      const point = { x_gpkg: x, h, label: `${T.toFixed(0)}°C/${Math.max(0, Math.min(100, RH)).toFixed(0)}%` };
      setPoints((p) => [...p, point]);
      setOutputText(`Punkt: T=${T.toFixed(1)}°C, φ=${Math.max(0, Math.min(100, RH)).toFixed(0)}%, x=${x.toFixed(2)} g/kg, h=${h.toFixed(1)} kJ/kg`);
    };

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseleave", handleLeave);
    canvas.addEventListener("click", handleClick);
    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [showHover, showClick, xMax, yMaxCalc, pressure, drawDiagram]);

  // -------------------- Render/Resize --------------------
  useEffect(() => {
    const onResize = () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(drawDiagram);
    };
    drawDiagram();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [drawDiagram]);

  // -------------------- NumberField (fokus-sicher) --------------------
  const NumberField = ({ label, value, onCommit, unit, step = "any", min, max, className = "", placeholder }) => {
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
      if (typeof min === "number" && n < min) { setDraft(String(min)); onCommit(min); return; }
      if (typeof max === "number" && n > max) { setDraft(String(max)); onCommit(max); return; }
      onCommit(n);
    };

    return (
      <div className={`space-y-1 ${className}`}>
        <label className="block text-sm font-medium text-slate-600">{label}</label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-colors"
          />
          {unit && <span className="absolute right-3 top-2 text-sm text-slate-400 select-none">{unit}</span>}
        </div>
      </div>
    );
  };

  const CheckBox = ({ label, checked, onChange }) => (
    <label className="flex items-center space-x-2 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
  );

  const Card = ({ title, children, className = "" }) => (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );

  const Button = ({ children, onClick, variant = "primary", className = "", ...props }) => {
    const variants = {
      primary: "bg-blue-600 hover:bg-blue-700 text-white",
      secondary: "bg-slate-200 hover:bg-slate-300 text-slate-700",
      success: "bg-emerald-600 hover:bg-emerald-700 text-white",
      warning: "bg-orange-600 hover:bg-orange-700 text-white"
    };
    return (
      <button
        onClick={onClick}
        className={`px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  };

  // -------------------- Aktionen: Punkt & Heizer --------------------
  const addPoint = () => {
    try {
      const P = pressure * 1000;
      const w = humidityRatio(plotTemp, plotHumidity, P);
      const h = enthalpy(plotTemp, w);
      const x_gpkg = w * 1000;
      const pt = { x_gpkg, h, label: `${plotTemp}°C/${plotHumidity}%` };
      setPoints((prev) => [...prev, pt]);
      setOutputText(`Punkt: x=${x_gpkg.toFixed(2)} g/kg, h=${h.toFixed(1)} kJ/kg`);
    } catch {
      setOutputText("Fehler bei Punktberechnung");
    }
  };

  const calculateHeater = () => {
    try {
      const P = pressure * 1000;
      const dT = parseFloat(String(tempDiff).replace(",", "."));
      const T2_calc = tempDiff !== "" && Number.isFinite(dT) ? inletTemp + dT : outletTemp;
      if (!(T2_calc > inletTemp)) {
        setProcessText("Austrittstemperatur muss größer als Eintritt sein.");
        return;
      }
      const w = humidityRatio(inletTemp, inletHumidity, P);
      const h1 = enthalpy(inletTemp, w);
      const h2 = enthalpy(T2_calc, w);
      const x_gpkg = w * 1000;

      const rho1 = density(inletTemp, w, P);
      const m_moist = (rho1 * volumeFlow) / 3600; // kg/s
      const m_dry = m_moist / (1 + w);
      const Q_kW = m_dry * (h2 - h1);
      const RH2 = relativeHumidity(T2_calc, w, P);

      const p1 = { x_gpkg, h: h1, label: `Ein ${inletTemp.toFixed(0)}°C/${inletHumidity.toFixed(0)}%` };
      const p2 = { x_gpkg, h: h2, label: `Aus ${T2_calc.toFixed(0)}°C/${Math.max(0, Math.min(100, RH2)).toFixed(0)}%` };
      setPoints((prev) => [...prev, p1, p2]);
      setProcesses((prev) => [...prev, { type: "heater", p1, p2 }]);

      setProcessText(
        `Heizleistung: ${Q_kW.toFixed(2)} kW | ρ₁=${rho1.toFixed(3)} kg/m³ | ṁ_da=${m_dry.toFixed(3)} kg/s | φ₂=${Math.max(0, Math.min(100, RH2)).toFixed(0)}%`
      );
    } catch (e) {
      setProcessText("Fehler bei Berechnung: " + e.message);
    }
  };

  const clearAll = () => {
    setPoints([]); setProcesses([]); setOutputText(""); setProcessText(""); setWrgText(""); setWrgResult(null);
  };

  // -------------------- WRG (Plattentauscher, sensible) --------------------
  function computeWRG() {
    const P = pressure * 1000;
    // Außenluft (Eintritt Zuluft)
    const w_oa = humidityRatio(T_oa, phi_oa, P);
    const h_oa = enthalpy(T_oa, w_oa);
    // Ablufttemperatur (sensible Treiber)
    const eta = Math.max(0, Math.min(1, eta_wrg / 100));
    const T2 = T_oa + eta * (T_exh - T_oa); // Zuluft nach WRG (sensible)
    const h2 = enthalpy(T2, w_oa);          // w bleibt gleich (Plattentauscher ohne Feuchterückgewinnung)
    const phi2 = relativeHumidity(T2, w_oa, P);
    const x_gpkg = w_oa * 1000;

    // Zuluft-Massenstrom (bei Außenluftzustand)
    const rho_oa = density(T_oa, w_oa, P);
    const m_moist = (rho_oa * volumeFlow) / 3600;
    const m_dry = m_moist / (1 + w_oa);
    const Q_wrg = m_dry * (h2 - h_oa); // kW (auf Zuluftseite)

    const p1 = { x_gpkg, h: h_oa, label: `Außen ${T_oa.toFixed(0)}°C/${phi_oa.toFixed(0)}%` };
    const p2 = { x_gpkg, h: h2,  label: `WRG ${T2.toFixed(0)}°C/${Math.max(0, Math.min(100, phi2)).toFixed(0)}%` };
    setPoints((prev) => [...prev, p1, p2]);
    setProcesses((prev) => [...prev, { type: "wrg", p1, p2 }]);

    setWrgResult({ T2, phi2: Math.max(0, Math.min(100, phi2)), x_gpkg, h1: h_oa, h2, Q_wrg, w_oa });
    setWrgText(
      `WRG: T₂=${T2.toFixed(1)}°C · φ₂=${Math.max(0, Math.min(100, phi2)).toFixed(0)}% · Δh=${(h2 - h_oa).toFixed(2)} kJ/kg · Q_WRG=${Q_wrg.toFixed(2)} kW`
    );
  }

  function applyWRGtoHeaterInlet() {
    if (!wrgResult) return;
    setInletTemp(+wrgResult.T2.toFixed(2));
    setInletHumidity(+wrgResult.phi2.toFixed(0));
  }

  // -------------------- Export --------------------
  const savePNG = () => {
    const a = document.createElement("a");
    a.download = "hx-diagramm.png";
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
  };

  const buildSVG = () => {
    const W = 1123, H = 794, padL = 80, padR = 50, padT = 50, padB = 80;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x2px = (x) => padL + (x / xMax) * plotW;
    const y2py = (y) => padT + (1 - y / yMaxCalc) * plotH;
    const P = pressure * 1000;

    const pathIsoT = (T) => {
      const h0 = enthalpy(T, 0), h1 = enthalpy(T, xMax / 1000);
      return `M ${x2px(0)} ${y2py(h0)} L ${x2px(xMax)} ${y2py(h1)}`;
    };
    const pathRH = (RH) => {
      let d = "", first = true;
      for (let T = tempMin; T <= tempMax; T += 0.5) {
        const w = humidityRatio(T, RH, P), x = w * 1000;
        if (!Number.isFinite(w) || w < 0 || x > xMax) continue;
        const h = enthalpy(T, w);
        const X = x2px(x), Y = y2py(h);
        d += first ? `M ${X.toFixed(1)} ${Y.toFixed(1)}` : ` L ${X.toFixed(1)} ${Y.toFixed(1)}`;
        first = false;
      }
      return d;
    };

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#fbfcfd"/>`;

    for (let x = 0; x <= xMax; x += 2) {
      const col = x % 10 === 0 ? "#cbd5e1" : "#f1f5f9";
      svg += `\n  <line x1="${x2px(x)}" y1="${padT}" x2="${x2px(x)}" y2="${padT + plotH}" stroke="${col}" stroke-width="1"/>`;
      if (x % 10 === 0) {
        svg += `\n  <text x="${x2px(x)}" y="${padT + plotH + 20}" text-anchor="middle" fill="#475569" font-size="13">${x}</text>`;
      }
    }
    for (let y = 0; y <= yMaxCalc; y += 5) {
      const col = y % 20 === 0 ? "#cbd5e1" : "#f1f5f9";
      svg += `\n  <line x1="${padL}" y1="${y2py(y)}" x2="${padL + plotW}" y2="${y2py(y)}" stroke="${col}" stroke-width="1"/>`;
      if (y % 10 === 0) {
        svg += `\n  <text x="${padL - 10}" y="${y2py(y) + 5}" text-anchor="end" fill="#475569" font-size="13">${y}</text>`;
      }
    }

    if (showIsoT) {
      for (let T = tempMin; T <= tempMax; T += 5) {
        svg += `\n  <path d="${pathIsoT(T)}" stroke="#0ea5e9" stroke-width="1.5" fill="none"/>`;
      }
    }
    if (showRH) {
      for (const rh of [10,20,30,40,50,60,70,80,90]) {
        svg += `\n  <path d="${pathRH(rh)}" stroke="#a78bfa" stroke-width="1.2" fill="none"/>`;
      }
    }
    if (showSat) {
      svg += `\n  <path d="${pathRH(100)}" stroke="#ef4444" stroke-width="3" fill="none"/>`;
    }

    svg += `
  <text x="${padL + plotW/2}" y="${H - 20}" text-anchor="middle" fill="#1e293b" font-size="16">
    Feuchtigkeitsgehalt x [g/kg trockene Luft]
  </text>
  <g transform="translate(25 ${padT + plotH/2}) rotate(-90)">
    <text text-anchor="middle" fill="#1e293b" font-size="16">Enthalpie h [kJ/kg trockene Luft]</text>
  </g>`;

    for (const pr of processes) {
      const col = pr.type === "wrg" ? "#3b82f6" : "#fb923c";
      svg += `\n  <line x1="${x2px(pr.p1.x_gpkg)}" y1="${y2py(pr.p1.h)}" x2="${x2px(pr.p2.x_gpkg)}" y2="${y2py(pr.p2.h)}" stroke="${col}" stroke-width="4"/>`;
    }
    for (const p of points) {
      svg += `\n  <circle cx="${x2px(p.x_gpkg)}" cy="${y2py(p.h)}" r="6" fill="#38bdf8" stroke="#0284c7" stroke-width="2"/>`;
    }

    // kompakte Legende oben rechts (statisch im PDF)
    svg += `
  <g transform="translate(${W - 240} 20)">
    <rect width="220" height="130" rx="10" fill="#ffffff" stroke="#e2e8f0"/>
    <text x="12" y="22" fill="#334155" font-size="14" font-weight="600">Legende</text>
    <g transform="translate(12 34)" font-size="12" fill="#334155">
      <g transform="translate(0 0)"><rect x="0" y="4" width="24" height="2" fill="#0ea5e9"/><text x="30" y="8">Isothermen</text></g>
      <g transform="translate(0 18)"><rect x="0" y="4" width="24" height="2" fill="#a78bfa"/><text x="30" y="8">φ-Kurven</text></g>
      <g transform="translate(0 36)"><rect x="0" y="4" width="24" height="3" fill="#ef4444"/><text x="30" y="8">Sättigung</text></g>
      <g transform="translate(0 54)"><circle cx="6" cy="6" r="6" fill="#38bdf8" stroke="#0284c7" stroke-width="2"/><text x="30" y="9">Punkt</text></g>
      <g transform="translate(0 72)"><rect x="0" y="4" width="24" height="4" fill="#3b82f6"/><text x="30" y="8">WRG-Prozess</text></g>
      <g transform="translate(0 90)"><rect x="0" y="4" width="24" height="4" fill="#fb923c"/><text x="30" y="8">Heizer-Prozess</text></g>
    </g>
  </g>`;

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
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>h-x Diagramm</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { height: 100%; }
  body { margin:0; display:flex; align-items:center; justify-content:center; background:#fff; }
  svg { width: 100%; height: auto; }
</style>
</head>
<body onload="setTimeout(() => { window.print(); }, 100)">${svg}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return alert("Pop-up Blocker verhindert PDF-Export.");
    w.document.open(); w.document.write(html); w.document.close();
  };

  // -------------------- Legend Dragging --------------------
  useEffect(() => {
    // Initial: oben rechts platzieren
    if (legendPos.x == null && chartWrapRef.current && legendRef.current) {
      const cw = chartWrapRef.current.clientWidth;
      const lw = legendRef.current.clientWidth;
      setLegendPos({ x: Math.max(8, cw - lw - 16), y: 16 });
    }
  }, [legendPos.x]);

  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (!dragStateRef.current.dragging || !chartWrapRef.current || !legendRef.current) return;
      const wrap = chartWrapRef.current.getBoundingClientRect();
      const lw = legendRef.current.clientWidth;
      const lh = legendRef.current.clientHeight;
      let nx = clientX - wrap.left - dragStateRef.current.dx;
      let ny = clientY - wrap.top - dragStateRef.current.dy;
      nx = Math.max(0, Math.min(nx, wrap.width - lw));
      ny = Math.max(0, Math.min(ny, wrap.height - lh));
      setLegendPos({ x: nx, y: ny });
    };

    const handleMouseMove = (e) => onMove(e.clientX, e.clientY);
    const handleMouseUp = () => { dragStateRef.current.dragging = false; };
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleTouchEnd = () => { dragStateRef.current.dragging = false; };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const startDrag = (e) => {
    e.preventDefault();
    if (!legendRef.current || !chartWrapRef.current) return;
    const wrapRect = chartWrapRef.current.getBoundingClientRect();
    const legendRect = legendRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStateRef.current.dragging = true;
    dragStateRef.current.dx = clientX - legendRect.left + wrapRect.left;
    dragStateRef.current.dy = clientY - legendRect.top + wrapRect.top;
  };

  const resetLegend = () => {
    if (!chartWrapRef.current || !legendRef.current) return;
    const cw = chartWrapRef.current.clientWidth;
    const lw = legendRef.current.clientWidth;
    setLegendPos({ x: Math.max(8, cw - lw - 16), y: 16 });
  };

  // -------------------- UI --------------------
  const MainContent = () => (
    <div className="max-w-7xl mx-auto p-6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="xl:col-span-1 space-y-6">
          {/* Einstellungen */}
          <Card title="Diagramm-Einstellungen">
            <div className="space-y-4">
              <NumberField label="Luftdruck" value={pressure} onCommit={setPressure} unit="kPa" />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="T min" value={tempMin} onCommit={setTempMin} unit="°C" />
                <NumberField label="T max" value={tempMax} onCommit={setTempMax} unit="°C" />
              </div>
              <NumberField label="x max" value={xMax} onCommit={setXMax} unit="g/kg" />
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <p className="text-sm font-medium text-slate-600">Anzeige</p>
                <CheckBox label="Isothermen" checked={showIsoT} onChange={setShowIsoT} />
                <CheckBox label="φ-Kurven" checked={showRH} onChange={setShowRH} />
                <CheckBox label="Sättigung" checked={showSat} onChange={setShowSat} />
                <CheckBox label="Hover-Info" checked={showHover} onChange={setShowHover} />
                <CheckBox label="Klick → Punkt" checked={showClick} onChange={setShowClick} />
              </div>
            </div>
          </Card>

          {/* WRG / Plattentauscher */}
          <Card title="WRG · Plattentauscher (sensible)">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Außenluft T" value={T_oa} onCommit={setT_oa} unit="°C" />
                <NumberField label="Außenluft φ" value={phi_oa} onCommit={setPhi_oa} unit="%" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Abluft T" value={T_exh} onCommit={setT_exh} unit="°C" />
                <NumberField label="WRG (sens.)" value={eta_wrg} onCommit={setEta_wrg} unit="%" />
              </div>
              <NumberField label="Zuluft Volumenstrom" value={volumeFlow} onCommit={setVolumeFlow} unit="m³/h" />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="success" onClick={computeWRG}>WRG berechnen</Button>
                <Button variant="secondary" onClick={applyWRGtoHeaterInlet} disabled={!wrgResult}>→ Heizer-Eintritt übernehmen</Button>
              </div>
              {wrgText && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">{wrgText}</div>}
              <p className="text-xs text-slate-500">
                Annahme: reine **sensible** WRG (Plattentauscher), keine Feuchterückgewinnung. Vereisung/Kondensation nicht berücksichtigt.
              </p>
            </div>
          </Card>

          {/* Lufterhitzer */}
          <Card title="Lufterhitzer (Zuluftseite)">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="T₁ (Eintritt)" value={inletTemp} onCommit={setInletTemp} unit="°C" />
                <NumberField label="φ₁ (Eintritt)" value={inletHumidity} onCommit={setInletHumidity} unit="%" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="T₂ (Ziel)" value={outletTemp} onCommit={setOutletTemp} unit="°C" />
                <NumberField label="oder ΔT" value={tempDiff} onCommit={(v) => setTempDiff(String(v))} unit="K" placeholder="optional" />
              </div>
              <Button onClick={calculateHeater} variant="warning" className="w-full">Heizleistung berechnen</Button>
              {processText && <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">{processText}</div>}
            </div>
          </Card>

          {/* Punkt */}
          <Card title="Punkt plotten">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Temperatur" value={plotTemp} onCommit={setPlotTemp} unit="°C" />
                <NumberField label="rel. Feuchte" value={plotHumidity} onCommit={setPlotHumidity} unit="%" />
              </div>
              <Button onClick={addPoint} variant="success" className="w-full">Punkt hinzufügen</Button>
              {outputText && <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">{outputText}</div>}
            </div>
          </Card>

          {/* Aktionen / Export */}
          <Card title="Aktionen">
            <div className="grid grid-cols-1 gap-2">
              <Button onClick={clearAll} variant="secondary">Alles löschen</Button>
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={savePNG} variant="primary">PNG</Button>
                <Button onClick={saveSVG} variant="primary">SVG</Button>
                <Button onClick={exportPDF} variant="primary" title="Als PDF speichern (Druckdialog)">PDF</Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Diagramm */}
        <div className="xl:col-span-3">
          <Card title={`Mollier h-x Diagramm (${pressure} kPa)`} className="h-full">
            <div ref={chartWrapRef} className="relative">
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg border border-slate-200 bg-slate-50"
                style={{ height: `${heightVh}vh`, minHeight: "600px", cursor: "crosshair" }}
              />
              {/* DRAGGABLE LEGENDE */}
              <div
                ref={legendRef}
                onMouseDown={startDrag}
                onTouchStart={startDrag}
                onDoubleClick={resetLegend}
                className="absolute bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm select-none"
                style={{
                  left: legendPos.x ?? 16,
                  top: legendPos.y ?? 16,
                  width: 220
                }}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 cursor-move">
                  <div className="text-sm font-semibold text-slate-700">Legende</div>
                  <div className="text-slate-400" title="Doppelklick: zurücksetzen">↔︎</div>
                </div>
                <div className="p-3 space-y-1 text-xs text-slate-700">
                  <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-sky-500" /> Isothermen (T=konst.)</div>
                  <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-purple-400" /> φ-Kurven (rel. Feuchte)</div>
                  <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-red-500" /> Sättigungsgrenze</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-sky-400 border border-sky-600" /> Punkt (T/φ → x,h)</div>
                  <div className="flex items-center gap-2"><div className="w-5 h-1 bg-blue-500" /> WRG-Prozess</div>
                  <div className="flex items-center gap-2"><div className="w-5 h-1 bg-orange-400" /> Heizer-Prozess</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <h1 className="text-3xl font-bold text-slate-900">Mollier h-x Diagramm</h1>
            <p className="text-slate-600 mt-1">WRG · Zuluft vor Heizer · Heizerleistung</p>
          </div>
        </header>
        <MainContent />
      </div>
    );
  }
  return <MainContent />;
}
