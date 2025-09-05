import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

// Mollier h–x Diagramm - KOMPLETT ÜBERARBEITET
// FIXIERT: Eingabefelder funktionieren richtig, Canvas stabil, besseres Design

export default function HxDiagram({
  initialPressureKPa = 101.325,
  initialTRange = [0, 50],
  initialXmax = 30,
  heightVh = 70,
  standalone = true,
}) {
  // -------------------- State - VEREINFACHT --------------------
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

  const [volumeFlow, setVolumeFlow] = useState(2000);
  const [inletTemp, setInletTemp] = useState(20);
  const [inletHumidity, setInletHumidity] = useState(40);
  const [outletTemp, setOutletTemp] = useState(30);
  const [tempDiff, setTempDiff] = useState("");

  const [points, setPoints] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [outputText, setOutputText] = useState("");
  const [processText, setProcessText] = useState("");

  // -------------------- Canvas --------------------
  const canvasRef = useRef(null);
  const animationRef = useRef();

  // -------------------- Psychrometrie --------------------
  const RATIO = 0.62198;
  const Rd = 287.058;
  const Rv = 461.495;

  const saturationPressure = (T) => 610.94 * Math.exp((17.625 * T) / (T + 243.04));
  
  const humidityRatio = (T, RH, P) => {
    const phi = Math.max(0, Math.min(1, RH / 100));
    const pws = saturationPressure(T);
    const pw = phi * pws;
    return (RATIO * pw) / Math.max(1, P - pw);
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

  // -------------------- Canvas Drawing --------------------
  const yMaxCalc = useMemo(() => {
    const w = Math.min(xMax / 1000, 0.05);
    const h = enthalpy(tempMax, w);
    return Math.ceil((h + 5) / 5) * 5;
  }, [tempMax, xMax]);

  const drawDiagram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Canvas setup
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Layout
    const pad = { left: 80, right: 50, top: 50, bottom: 80 };
    const plotWidth = rect.width - pad.left - pad.right;
    const plotHeight = rect.height - pad.top - pad.bottom;

    // Scale functions
    const xScale = (x) => pad.left + (x / xMax) * plotWidth;
    const yScale = (y) => pad.top + (1 - y / yMaxCalc) * plotHeight;
    const xInverse = (px) => ((px - pad.left) / plotWidth) * xMax;
    const yInverse = (py) => (1 - (py - pad.top) / plotHeight) * yMaxCalc;

    // Grid
    ctx.lineWidth = 1;
    ctx.font = "13px system-ui";
    
    // Vertical grid
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
        ctx.fillText(x.toString(), px, pad.top + plotHeight + 20);
      }
    }
    
    // Horizontal grid
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
        ctx.fillText(y.toString(), pad.left - 10, py + 5);
      }
    }

    // Axis labels
    ctx.fillStyle = "#1e293b";
    ctx.font = "16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Feuchtigkeitsgehalt x [g/kg]", pad.left + plotWidth/2, rect.height - 20);
    
    ctx.save();
    ctx.translate(25, pad.top + plotHeight/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText("Enthalpie h [kJ/kg]", 0, 0);
    ctx.restore();

    // Isotherms
    if (showIsoT) {
      ctx.lineWidth = 1.5;
      for (let T = tempMin; T <= tempMax; T += 5) {
        const h0 = enthalpy(T, 0);
        const h1 = enthalpy(T, xMax / 1000);
        ctx.strokeStyle = "#7dd3fc";
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

    // RH curves
    if (showRH) {
      const P = pressure * 1000;
      const rhValues = [10, 20, 30, 40, 50, 60, 70, 80, 90];
      ctx.lineWidth = 1.2;
      
      for (const rh of rhValues) {
        ctx.strokeStyle = "#c084fc";
        ctx.beginPath();
        let first = true;
        
        for (let T = tempMin; T <= tempMax; T += 0.5) {
          try {
            const w = humidityRatio(T, rh, P);
            const x = w * 1000;
            if (x <= xMax && w >= 0) {
              const h = enthalpy(T, w);
              const px = xScale(x);
              const py = yScale(h);
              if (first) {
                ctx.moveTo(px, py);
                first = false;
              } else {
                ctx.lineTo(px, py);
              }
            }
          } catch (e) {
            continue;
          }
        }
        ctx.stroke();
        
        // Label
        try {
          for (let T = tempMax; T >= tempMin; T -= 2) {
            const w = humidityRatio(T, rh, P);
            const x = w * 1000;
            if (x <= xMax - 3 && w >= 0) {
              const h = enthalpy(T, w);
              ctx.fillStyle = "#7c3aed";
              ctx.font = "11px system-ui";
              ctx.textAlign = "left";
              ctx.fillText(`φ${rh}%`, xScale(x) + 8, yScale(h) + 4);
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Saturation
    if (showSat) {
      const P = pressure * 1000;
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 3;
      ctx.beginPath();
      let first = true;
      
      for (let T = tempMin; T <= tempMax; T += 0.3) {
        try {
          const w = humidityRatio(T, 100, P);
          const x = w * 1000;
          if (x <= xMax) {
            const h = enthalpy(T, w);
            const px = xScale(x);
            const py = yScale(h);
            if (first) {
              ctx.moveTo(px, py);
              first = false;
            } else {
              ctx.lineTo(px, py);
            }
          }
        } catch (e) {
          continue;
        }
      }
      ctx.stroke();
      
      ctx.fillStyle = "#dc2626";
      ctx.font = "13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("Sättigung", xScale(4), yScale(25));
    }

    // Processes
    for (const proc of processes) {
      const { p1, p2 } = proc;
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(xScale(p1.x_gpkg), yScale(p1.h));
      ctx.lineTo(xScale(p2.x_gpkg), yScale(p2.h));
      ctx.stroke();
      
      // Arrow
      const dx = xScale(p2.x_gpkg) - xScale(p1.x_gpkg);
      const dy = yScale(p2.h) - yScale(p1.h);
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len > 15) {
        const ux = dx / len;
        const uy = dy / len;
        const px = xScale(p2.x_gpkg);
        const py = yScale(p2.h);
        
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 15*ux + 5*uy, py - 15*uy - 5*ux);
        ctx.lineTo(px - 15*ux - 5*uy, py - 15*uy + 5*ux);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Points
    for (const point of points) {
      ctx.fillStyle = "#38bdf8";
      ctx.strokeStyle = "#0284c7";
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

    // Store scale functions for mouse handling
    canvas._xScale = xScale;
    canvas._yScale = yScale;
    canvas._xInverse = xInverse;
    canvas._yInverse = yInverse;
    canvas._pad = pad;
    canvas._plotWidth = plotWidth;
    canvas._plotHeight = plotHeight;

  }, [pressure, tempMin, tempMax, xMax, yMaxCalc, showIsoT, showRH, showSat, points, processes]);

  // -------------------- Mouse Handling --------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e) => {
      if (!showHover) {
        drawDiagram();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = canvas._xInverse ? canvas._xInverse(e.clientX - rect.left) : 0;
      const h = canvas._yInverse ? canvas._yInverse(e.clientY - rect.top) : 0;

      if (x < 0 || x > xMax || h < 0 || h > yMaxCalc) {
        drawDiagram();
        return;
      }

      drawDiagram();

      // Crosshair
      const ctx = canvas.getContext("2d");
      const xScale = canvas._xScale;
      const yScale = canvas._yScale;
      const pad = canvas._pad;

      if (xScale && yScale && pad) {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xScale(x), pad.top);
        ctx.lineTo(xScale(x), pad.top + canvas._plotHeight);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pad.left, yScale(h));
        ctx.lineTo(pad.left + canvas._plotWidth, yScale(h));
        ctx.stroke();
        ctx.setLineDash([]);

        // Info box
        const w = Math.max(0, x / 1000);
        const T = temperatureFromEnthalpy(h, w);
        const RH = relativeHumidity(T, w, pressure * 1000);

        const boxX = xScale(x) + 15;
        const boxY = yScale(h) - 15;
        const lines = [
          `x = ${x.toFixed(2)} g/kg`,
          `h = ${h.toFixed(1)} kJ/kg`,
          `T ≈ ${T.toFixed(1)}°C`,
          `φ ≈ ${Math.max(0, Math.min(100, RH)).toFixed(0)}%`
        ];

        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        const boxWidth = 120;
        const boxHeight = 80;
        ctx.fillRect(boxX, boxY - boxHeight, boxWidth, boxHeight);
        ctx.strokeRect(boxX, boxY - boxHeight, boxWidth, boxHeight);

        ctx.fillStyle = "#1e293b";
        ctx.font = "12px system-ui";
        ctx.textAlign = "left";
        lines.forEach((line, i) => {
          ctx.fillText(line, boxX + 8, boxY - boxHeight + 20 + i * 16);
        });
      }
    };

    const handleMouseLeave = () => drawDiagram();

    const handleClick = (e) => {
      if (!showClick) return;

      const rect = canvas.getBoundingClientRect();
      const x = canvas._xInverse ? canvas._xInverse(e.clientX - rect.left) : 0;
      const h = canvas._yInverse ? canvas._yInverse(e.clientY - rect.top) : 0;

      if (x < 0 || x > xMax || h < 0 || h > yMaxCalc) return;

      const w = Math.max(0, x / 1000);
      const T = temperatureFromEnthalpy(h, w);
      const RH = relativeHumidity(T, w, pressure * 1000);
      
      const point = {
        x_gpkg: x,
        h: h,
        label: `${T.toFixed(0)}°C/${Math.max(0, Math.min(100, RH)).toFixed(0)}%`
      };
      
      setPoints(prev => [...prev, point]);
      setOutputText(`Punkt: T=${T.toFixed(1)}°C, φ=${Math.max(0, Math.min(100, RH)).toFixed(0)}%, x=${x.toFixed(2)} g/kg, h=${h.toFixed(1)} kJ/kg`);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [showHover, showClick, xMax, yMaxCalc, pressure, drawDiagram]);

  // -------------------- Effects --------------------
  useEffect(() => {
    const resizeHandler = () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(drawDiagram);
    };

    drawDiagram();
    window.addEventListener("resize", resizeHandler);
    return () => {
      window.removeEventListener("resize", resizeHandler);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [drawDiagram]);

  // -------------------- Actions --------------------
  const addPoint = () => {
    try {
      const P = pressure * 1000;
      const w = humidityRatio(plotTemp, plotHumidity, P);
      const h = enthalpy(plotTemp, w);
      const x_gpkg = w * 1000;
      
      const point = {
        x_gpkg,
        h,
        label: `${plotTemp}°C/${plotHumidity}%`
      };
      
      setPoints(prev => [...prev, point]);
      setOutputText(`Punkt berechnet: x=${x_gpkg.toFixed(2)} g/kg, h=${h.toFixed(1)} kJ/kg`);
    } catch (error) {
      setOutputText("Fehler bei Punktberechnung");
    }
  };

  const calculateHeater = () => {
    try {
      const P = pressure * 1000;
      const T2_calc = tempDiff !== "" && !isNaN(+tempDiff) ? inletTemp + (+tempDiff) : outletTemp;
      
      if (T2_calc <= inletTemp) {
        setProcessText("Austrittstemperatur muss höher sein als Eintrittstemperatur");
        return;
      }
      
      const w = humidityRatio(inletTemp, inletHumidity, P);
      const h1 = enthalpy(inletTemp, w);
      const h2 = enthalpy(T2_calc, w);
      const x_gpkg = w * 1000;
      
      // Dichte bei Eintritt
      const rho1 = density(inletTemp, w, P);
      const massFlow = (rho1 * volumeFlow) / 3600; // kg/s
      const dryAirFlow = massFlow / (1 + w); // kg_dry/s
      const heatingPower = dryAirFlow * (h2 - h1); // kW
      const outletRH = relativeHumidity(T2_calc, w, P);

      const p1 = { x_gpkg, h: h1, label: `Ein ${inletTemp}°C/${inletHumidity}%` };
      const p2 = { x_gpkg, h: h2, label: `Aus ${T2_calc.toFixed(0)}°C/${Math.max(0, Math.min(100, outletRH)).toFixed(0)}%` };
      
      setPoints(prev => [...prev, p1, p2]);
      setProcesses(prev => [...prev, { type: "heater", p1, p2 }]);

      setProcessText(
        `Heizleistung: ${heatingPower.toFixed(2)} kW | ρ₁=${rho1.toFixed(3)} kg/m³ | ṁ_da=${dryAirFlow.toFixed(3)} kg/s | φ₂=${Math.max(0, Math.min(100, outletRH)).toFixed(0)}%`
      );
    } catch (error) {
      setProcessText("Fehler bei Berechnung: " + error.message);
    }
  };

  const clearAll = () => {
    setPoints([]);
    setProcesses([]);
    setOutputText("");
    setProcessText("");
  };

  // -------------------- UI Components --------------------
  const InputGroup = ({ label, value, onChange, unit, step = "any", min, max, className = "" }) => (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-slate-600">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : +e.target.value)}
          step={step}
          min={min}
          max={max}
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-colors"
        />
        {unit && (
          <span className="absolute right-3 top-2 text-sm text-slate-400">{unit}</span>
        )}
      </div>
    </div>
  );

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

  // -------------------- Main Component --------------------
  const MainContent = () => (
    <div className="max-w-7xl mx-auto p-6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="xl:col-span-1 space-y-6">
          {/* Settings */}
          <Card title="Diagramm-Einstellungen">
            <div className="space-y-4">
              <InputGroup
                label="Luftdruck"
                value={pressure}
                onChange={setPressure}
                unit="kPa"
                step="0.1"
                min="80"
                max="120"
              />
              <div className="grid grid-cols-2 gap-3">
                <InputGroup
                  label="T min"
                  value={tempMin}
                  onChange={setTempMin}
                  unit="°C"
                  step="1"
                />
                <InputGroup
                  label="T max"
                  value={tempMax}
                  onChange={setTempMax}
                  unit="°C"
                  step="1"
                />
              </div>
              <InputGroup
                label="x max"
                value={xMax}
                onChange={setXMax}
                unit="g/kg"
                step="1"
                min="5"
                max="50"
              />
              
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

          {/* Point calculation */}
          <Card title="Punkt berechnen">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputGroup
                  label="Temperatur"
                  value={plotTemp}
                  onChange={setPlotTemp}
                  unit="°C"
                  step="0.1"
                />
                <InputGroup
                  label="rel. Feuchte"
                  value={plotHumidity}
                  onChange={setPlotHumidity}
                  unit="%"
                  step="1"
                  min="0"
                  max="100"
                />
              </div>
              <Button onClick={addPoint} variant="success" className="w-full">
                Punkt hinzufügen
              </Button>
              {outputText && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  {outputText}
                </div>
              )}
            </div>
          </Card>

          {/* Heater calculation */}
          <Card title="Lufterhitzer">
            <div className="space-y-4">
              <InputGroup
                label="Volumenstrom"
                value={volumeFlow}
                onChange={setVolumeFlow}
                unit="m³/h"
                step="100"
                min="0"
              />
              <div className="grid grid-cols-2 gap-3">
                <InputGroup
                  label="T₁ (Eintritt)"
                  value={inletTemp}
                  onChange={setInletTemp}
                  unit="°C"
                  step="0.1"
                />
                <InputGroup
                  label="φ₁ (Eintritt)"
                  value={inletHumidity}
                  onChange={setInletHumidity}
                  unit="%"
                  step="1"
                  min="0"
                  max="100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputGroup
                  label="T₂ (Austritt)"
                  value={outletTemp}
                  onChange={setOutletTemp}
                  unit="°C"
                  step="0.1"
                />
                <InputGroup
                  label="oder ΔT"
                  value={tempDiff}
                  onChange={setTempDiff}
                  unit="K"
                  step="0.1"
                />
              </div>
              <Button onClick={calculateHeater} variant="warning" className="w-full">
                Heizung berechnen
              </Button>
              {processText && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                  {processText}
                </div>
              )}
            </div>
          </Card>

          {/* Actions */}
          <Card title="Aktionen">
            <Button onClick={clearAll} variant="secondary" className="w-full">
              Alles löschen
            </Button>
          </Card>
        </div>

        {/* Diagram */}
        <div className="xl:col-span-3">
          <Card title={`Mollier h-x Diagramm (${pressure} kPa)`} className="h-full">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg border border-slate-200 bg-slate-50"
                style={{ 
                  height: `${heightVh}vh`,
                  minHeight: "600px",
                  cursor: "crosshair"
                }}
              />
              
              {/* Legend */}
              <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-sm">
                <div className="text-sm font-medium text-slate-700 mb-2">Legende</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-sky-300"></div>
                    <span>Isothermen</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-purple-300"></div>
                    <span>φ-Kurven</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-red-400"></div>
                    <span>Sättigung</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-sky-400 rounded-full"></div>
                    <span>Punkte</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-orange-400"></div>
                    <span>Prozesse</span>
                  </div>
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
            <p className="text-slate-600 mt-1">Psychrometrische Berechnungen mit Dichtekorrektur</p>
          </div>
        </header>
        <MainContent />
      </div>
    );
  }

  return <MainContent />;
}