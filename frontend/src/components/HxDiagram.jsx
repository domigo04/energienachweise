import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

export default function HxDiagramSimple({ standalone = true }) {
  // ---- Defaults ----
  const TMIN_DEFAULT = -20;
  const TMAX_DEFAULT = 40;
  const XMAX_DEFAULT = 30;

  // ---- State (schlank & robust) ----
  const [p_kPa, setP] = useState(100); // runder Default
  const [tMin, setTMin] = useState(TMIN_DEFAULT);
  const [tMax, setTMax] = useState(TMAX_DEFAULT);
  const [xMax, setXMax] = useState(XMAX_DEFAULT);

  const [showT, setShowT] = useState(true);
  const [showRH, setShowRH] = useState(true);
  const [showSat, setShowSat] = useState(true);
  const [showHover, setShowHover] = useState(true);
  const [clickAdd, setClickAdd] = useState(true);

  // Punkte / Prozesse
  const [points, setPoints] = useState([]); // {x_gpkg, h, label}
  const [processes, setProcesses] = useState([]); // {type:'wrg'|'heater', p1, p2}

  // --- WRG (sensible, Platten) ---
  const [Toa, setToa] = useState(-10), [phi_oa, setPhiOA] = useState(80);
  const [Texh, setTexh] = useState(22), [phi_exh, setPhiEX] = useState(45);
  const [Vsup, setVsup] = useState(2000), [Vexh, setVexh] = useState(2000);
  const [eta, setEta] = useState(70); // %

  // --- Heizer (nur Lüftungsseite) ---
  const [Tin, setTin] = useState(18), [phi_in, setPhiIn] = useState(40);
  const [Tout, setTout] = useState(30), [dT, setdT] = useState("");
  const [Vheiz, setVheiz] = useState(2000);

  // „Punkt plotten“
  const [Tplot, setTplot] = useState(20), [RHplot, setRHplot] = useState(50);

  // Messages
  const [msgWRG, setMsgWRG] = useState(""), [msgHeiz, setMsgHeiz] = useState("");

  // ---- Konstanten ----
  const RATIO = 0.62198, Rd = 287.058, Rv = 461.495;

  // ---- Canvas ----
  const canvasRef = useRef(null);
  const rafRef = useRef();

  // ---- Psychrometrie (korrekt & stabil) ----
  const pws = (T) => {
    const Tc = Math.max(-45, Math.min(60, T));
    return 610.94 * Math.exp((17.625 * Tc) / (Tc + 243.04));
  };
  const w_from_T_RH = (T, RH, P) => {
    const phi = Math.max(0, Math.min(1, RH / 100));
    const pw = phi * pws(T);
    const denom = P - pw;
    if (!Number.isFinite(denom) || denom <= 1e-6) return 0;
    return Math.max(0, (RATIO * pw) / denom);
  };
  // WICHTIG: 1.86 * T (dein Snippet hatte fälschlich 1.86 * w)
  const h_from_T_w = (T, w) => 1.006 * T + w * (2501 + 1.86 * T); // kJ/kg_dry
  const T_from_h_w = (h, w) => (h - 2501 * w) / (1.006 + 1.86 * w);
  const RH_from_T_w = (T, w, P) => {
    const pw = (w * P) / (RATIO + w);
    return 100 * Math.max(0, Math.min(1, pw / pws(T)));
  };
  const rho_moist = (T, w, P) => {
    const TK = T + 273.15;
    const pw = (w * P) / (RATIO + w);
    const pd = P - pw;
    return pd / (Rd * TK) + pw / (Rv * TK);
  };

  // ---- y-Achse dynamisch (auch negativ) ----
  const { yMin, yMax } = useMemo(() => {
    const wMax = xMax / 1000;
    const top = h_from_T_w(tMax, wMax);
    const bottom = h_from_T_w(tMin, 0);
    let ymax = Math.ceil((Math.max(top, 5) + 5) / 5) * 5;
    let ymin = Math.floor((Math.min(0, bottom) - 5) / 5) * 5;
    if (ymax - ymin < 20) ymax = ymin + 20;
    return { yMin: ymin, yMax: ymax };
  }, [tMin, tMax, xMax]);

  // ---- Zeichnen (einfach & robust) ----
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Layout – „wie ein Game“: viel Plotfläche, knappe Ränder
    const pad = { left: 70, right: 34, top: 30, bottom: 34 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const x2px = (x) => pad.left + (x / xMax) * plotW;
    const y2py = (y) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
    const px2x = (px) => ((px - pad.left) / plotW) * xMax;
    const py2y = (py) => yMin + (1 - (py - pad.top) / plotH) * (yMax - yMin);

    // Hintergrund
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

    // Grid X
    ctx.lineWidth = 1; ctx.font = "12px system-ui";
    for (let x = 0; x <= xMax; x += 2) {
      const px = x2px(x);
      ctx.strokeStyle = x % 10 === 0 ? "#cbd5e1" : "#eef2f7";
      ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, pad.top + plotH); ctx.stroke();
      if (x % 10 === 0) { ctx.fillStyle = "#334155"; ctx.textAlign = "center"; ctx.fillText(String(x), px, pad.top + plotH + 14); }
    }
    // Grid Y
    const yStep = 5; const yStart = Math.ceil(yMin / yStep) * yStep;
    for (let y = yStart; y <= yMax; y += yStep) {
      const py = y2py(y);
      ctx.strokeStyle = Math.round(y) % 20 === 0 ? "#cbd5e1" : "#eef2f7";
      ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(pad.left + plotW, py); ctx.stroke();
      if (Math.round(y) % 10 === 0) { ctx.fillStyle = "#334155"; ctx.textAlign = "right"; ctx.fillText(String(y), pad.left - 8, py + 4); }
    }

    // Achsentitel
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.font = "13px system-ui";
    ctx.fillText("x  [g/kg trockene Luft]", pad.left + plotW / 2, H - 6);
    ctx.save(); ctx.translate(18, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("h  [kJ/kg trockene Luft]", 0, 0); ctx.restore();

    // Isothermen
    if (showT) {
      ctx.strokeStyle = "#0ea5e9"; ctx.lineWidth = 1.1;
      for (let T = tMin; T <= tMax; T += 5) {
        ctx.beginPath();
        ctx.moveTo(x2px(0), y2py(h_from_T_w(T, 0)));
        ctx.lineTo(x2px(xMax), y2py(h_from_T_w(T, xMax / 1000)));
        ctx.stroke();
        ctx.fillStyle = "#0369a1"; ctx.font = "11px system-ui"; ctx.textAlign = "right";
        ctx.fillText(`${T}°C`, x2px(xMax) - 4, y2py(h_from_T_w(T, xMax / 1000)) - 2);
      }
    }

    // φ-Kurven
    if (showRH) {
      const P = p_kPa * 1000; ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1;
      for (const RH of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
        ctx.beginPath(); let started = false;
        for (let T = tMin; T <= tMax; T += 0.5) {
          const w = w_from_T_RH(T, RH, P), x = 1000 * w;
          if (!Number.isFinite(w) || x > xMax) continue;
          const h = h_from_T_w(T, w), X = x2px(x), Y = y2py(h);
          if (!started) { ctx.moveTo(X, Y); started = true; } else { ctx.lineTo(X, Y); }
        }
        started && ctx.stroke();
        // Label
        for (let T = tMax; T >= tMin; T -= 1) {
          const w = w_from_T_RH(T, RH, P), x = 1000 * w;
          if (Number.isFinite(w) && x <= xMax) { const h = h_from_T_w(T, w);
            ctx.fillStyle = "#6d28d9"; ctx.font = "10px system-ui"; ctx.textAlign = "left";
            ctx.fillText(`φ ${RH}%`, x2px(x) + 4, y2py(h) + 3);
            break;
          }
        }
      }
    }

    // Sättigung
    if (showSat) {
      const P = p_kPa * 1000; ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2;
      ctx.beginPath(); let started = false;
      for (let T = tMin; T <= tMax; T += 0.3) {
        const w = w_from_T_RH(T, 100, P), x = 1000 * w; if (!Number.isFinite(w) || x > xMax) continue;
        const h = h_from_T_w(T, w), X = x2px(x), Y = y2py(h);
        if (!started) { ctx.moveTo(X, Y); started = true; } else { ctx.lineTo(X, Y); }
      }
      started && ctx.stroke();
    }

    // Prozesse (WRG/Heizer)
    for (const pr of processes) {
      const col = pr.type === "wrg" ? "#3b82f6" : "#fb923c";
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x2px(pr.p1.x_gpkg), y2py(pr.p1.h)); ctx.lineTo(x2px(pr.p2.x_gpkg), y2py(pr.p2.h)); ctx.stroke();
    }

    // Punkte
    for (const p of points) {
      ctx.fillStyle = "#38bdf8"; ctx.strokeStyle = "#0369a1"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x2px(p.x_gpkg), y2py(p.h), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0f172a"; ctx.font = "11px system-ui"; ctx.textAlign = "left";
      ctx.fillText(p.label, x2px(p.x_gpkg) + 8, y2py(p.h) - 8);
    }

    // expose scaler
    c._px2x = px2x; c._py2y = py2y; c._x2px = x2px; c._y2py = y2py;
    c._pad = pad; c._plotW = plotW; c._plotH = plotH; c._yMin = yMin; c._yMax = yMax;
  }, [p_kPa, tMin, tMax, xMax, yMin, yMax, showT, showRH, showSat, points, processes]);

  // ---- Hover/Klick ----
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const onMove = (e) => {
      if (!showHover) { draw(); return; }
      const r = c.getBoundingClientRect();
      const x = c._px2x?.(e.clientX - r.left) ?? 0;
      const h = c._py2y?.(e.clientY - r.top) ?? 0;
      if (x < 0 || x > xMax || h < c._yMin || h > c._yMax) { draw(); return; }
      draw();
      const ctx = c.getContext("2d"); const pad = c._pad;
      ctx.strokeStyle = "#94a3b8"; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(c._x2px(x), pad.top); ctx.lineTo(c._x2px(x), pad.top + c._plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.left, c._y2py(h)); ctx.lineTo(pad.left + c._plotH + (c._plotW - c._plotH), c._y2py(h)); ctx.stroke();
      ctx.setLineDash([]);
      const w = Math.max(0, x / 1000); const T = T_from_h_w(h, w); const RH = RH_from_T_w(T, w, p_kPa * 1000);
      const bx = c._x2px(x) + 10, by = c._y2py(h) - 10;
      const lines = [`x ${x.toFixed(2)} g/kg`,`h ${h.toFixed(1)} kJ/kg`,`T ≈ ${T.toFixed(1)} °C`,`φ ≈ ${Math.max(0,Math.min(100,RH)).toFixed(0)} %`];
      const bw = 140, bh = 86;
      ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.strokeStyle = "#e2e8f0"; ctx.fillRect(bx, by - bh, bw, bh); ctx.strokeRect(bx, by - bh, bw, bh);
      ctx.fillStyle = "#0f172a"; ctx.font = "11px system-ui"; ctx.textAlign = "left";
      lines.forEach((t, i) => ctx.fillText(t, bx + 8, by - bh + 18 + i * 16));
    };
    const onLeave = () => draw();
    const onClick = (e) => {
      if (!clickAdd) return;
      const r = c.getBoundingClientRect();
      const x = c._px2x?.(e.clientX - r.left) ?? 0;
      const h = c._py2y?.(e.clientY - r.top) ?? 0;
      if (x < 0 || x > xMax || h < c._yMin || h > c._yMax) return;
      const w = Math.max(0, x / 1000); const T = T_from_h_w(h, w); const RH = RH_from_T_w(T, w, p_kPa * 1000);
      const pt = { x_gpkg: x, h, label: `${T.toFixed(0)}°C/${Math.max(0, Math.min(100, RH)).toFixed(0)}%` };
      setPoints((ps) => [...ps, pt]);
    };
    c.addEventListener("mousemove", onMove);
    c.addEventListener("mouseleave", onLeave);
    c.addEventListener("click", onClick);
    return () => { c.removeEventListener("mousemove", onMove); c.removeEventListener("mouseleave", onLeave); c.removeEventListener("click", onClick); };
  }, [showHover, clickAdd, xMax, draw, p_kPa]);

  // ---- Resize + initial draw ----
  useEffect(() => {
    const onR = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw); };
    draw(); window.addEventListener("resize", onR);
    return () => { window.removeEventListener("resize", onR); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // ---- Eingabe-Controls (draft + commit) ----
  const NumberField = ({ label, unit, value, onCommit }) => {
    const [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);
    const commit = () => {
      const t = draft.replace(",", ".").trim();
      if (t === "" || t === "-" || t === "." || t === "-.") { setDraft(String(value)); return; }
      const n = parseFloat(t); if (!Number.isFinite(n)) { setDraft(String(value)); return; }
      onCommit(n);
    };
    return (
      <label className="text-sm text-slate-700">
        <div className="mb-1">{label}</div>
        <div className="relative">
          <input
            type="text" inputMode="decimal" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none"
          />
          {unit && <span className="absolute right-3 top-2 text-xs text-slate-400 select-none">{unit}</span>}
        </div>
      </label>
    );
  };

  const Btn = ({ children, onClick, tone = "primary", disabled }) => {
    const cls = tone === "primary" ? "bg-blue-600 hover:bg-blue-700 text-white"
      : tone === "warn" ? "bg-orange-600 hover:bg-orange-700 text-white"
      : "bg-slate-200 hover:bg-slate-300 text-slate-800";
    return <button onClick={onClick} disabled={disabled} className={`px-3 py-2 rounded-lg text-sm font-medium ${cls} disabled:opacity-50`}>{children}</button>;
  };

  // ---- Aktionen ----
  const addPlotPoint = () => {
    const P = p_kPa * 1000; const w = w_from_T_RH(Tplot, RHplot, P);
    const h = h_from_T_w(Tplot, w); const x = 1000 * w;
    const pt = { x_gpkg: x, h, label: `${Tplot}°C/${RHplot}%` };
    setPoints((ps) => [...ps, pt]);
  };

  const calcWRG = () => {
    try {
      const P = p_kPa * 1000;
      const w_oa = w_from_T_RH(Toa, phi_oa, P), w_ra = w_from_T_RH(Texh, phi_exh, P);
      const rho_oa = rho_moist(Toa, w_oa, P), rho_ra = rho_moist(Texh, w_ra, P);
      const m_sa = (rho_oa * Math.max(0, Vsup)) / 3600, m_ra = (rho_ra * Math.max(0, Vexh)) / 3600; // kg/s (feucht)
      const m_da_sa = m_sa / (1 + w_oa), m_da_ra = m_ra / (1 + w_ra);
      const c_sa = 1.006 + 1.86 * w_oa, c_ra = 1.006 + 1.86 * w_ra; // kJ/(kg_dry K)
      const Csup = m_da_sa * c_sa, Crec = m_da_ra * c_ra; if (!(Csup > 0 && Crec > 0)) { setMsgWRG("WRG: ungültige Volumenströme"); return; }
      const Cmin = Math.min(Csup, Crec), eps = Math.max(0, Math.min(1, eta / 100));
      let Q = eps * Cmin * (Texh - Toa);           // kW
      let T2 = Toa + Q / Csup;                     // °C (Zuluft nach WRG)
      // physikalisch zwischen OA und Abluft clampen
      T2 = Math.max(Math.min(Texh, Math.max(Toa, T2)), Math.min(Toa, Texh));
      Q = Csup * (T2 - Toa);

      // Plot (w konstant)
      const x = 1000 * w_oa;
      const p1 = { x_gpkg: x, h: h_from_T_w(Toa, w_oa), label: `Außen ${Toa}°C/${phi_oa}%` };
      const p2 = { x_gpkg: x, h: h_from_T_w(T2,  w_oa), label: `WRG ${T2.toFixed(0)}°C/${Math.max(0, Math.min(100, RH_from_T_w(T2, w_oa, P))).toFixed(0)}%` };
      setPoints((ps) => [...ps, p1, p2]); setProcesses((pr) => [...pr, { type: "wrg", p1, p2 }]);
      // Übergabe an Heizer
      setTin(+T2.toFixed(2)); setPhiIn(+Math.max(0, Math.min(100, RH_from_T_w(T2, w_oa, P))).toFixed(0)); setVheiz(Vsup);
      setMsgWRG(`WRG: T₂=${T2.toFixed(1)}°C · Q=${Q.toFixed(2)} kW (ε=${(eps * 100).toFixed(0)}%, Cmin=${Cmin.toFixed(2)} kW/K)`);
    } catch (e) {
      setMsgWRG("WRG: Fehler");
    }
  };

  const calcHeater = () => {
    try {
      const P = p_kPa * 1000; const dTn = parseFloat(String(dT).replace(",", "."));
      const T2 = (dT !== "" && Number.isFinite(dTn)) ? (Tin + dTn) : Tout;
      if (!(T2 > Tin)) { setMsgHeiz("Heizer: T₂ muss > T₁"); return; }
      const w = w_from_T_RH(Tin, phi_in, P);
      const h1 = h_from_T_w(Tin, w), h2 = h_from_T_w(T2, w), x = 1000 * w;
      const rho = rho_moist(Tin, w, P), m_m = (rho * Math.max(0, Vheiz)) / 3600, m_da = m_m / (1 + w);
      const Q = m_da * (h2 - h1); const phi2 = RH_from_T_w(T2, w, P);
      const p1 = { x_gpkg: x, h: h1, label: `Ein ${Tin.toFixed(0)}°C/${phi_in.toFixed(0)}%` };
      const p2 = { x_gpkg: x, h: h2, label: `Aus ${T2.toFixed(0)}°C/${Math.max(0, Math.min(100, phi2)).toFixed(0)}%` };
      setPoints((ps) => [...ps, p1, p2]); setProcesses((pr) => [...pr, { type: "heater", p1, p2 }]);
      setMsgHeiz(`Heizer: Q=${Q.toFixed(2)} kW · ṁ_da=${m_da.toFixed(3)} kg/s · φ₂=${Math.max(0, Math.min(100, phi2)).toFixed(0)}%`);
    } catch {
      setMsgHeiz("Heizer: Fehler");
    }
  };

  const clearAll = () => { setPoints([]); setProcesses([]); setMsgWRG(""); setMsgHeiz(""); };

  // ---- Exporte ----
  const savePNG = () => { const a = document.createElement("a"); a.download = "hx.png"; a.href = canvasRef.current.toDataURL("image/png"); a.click(); };

  const buildSVG = () => {
    const W = 1123, H = 794, padL = 70, padR = 34, padT = 30, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x2px = (x) => padL + (x / xMax) * plotW;
    const y2py = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;
    const P = p_kPa * 1000;

    const pathIsoT = (T) => `M ${x2px(0)} ${y2py(h_from_T_w(T, 0))} L ${x2px(xMax)} ${y2py(h_from_T_w(T, xMax / 1000))}`;
    const pathRH = (RH) => {
      let d = "", first = true;
      for (let T = tMin; T <= tMax; T += 0.5) {
        const w = w_from_T_RH(T, RH, P), x = 1000 * w; if (!Number.isFinite(w) || x > xMax) continue;
        const X = x2px(x), Y = y2py(h_from_T_w(T, w));
        d += first ? `M ${X.toFixed(1)} ${Y.toFixed(1)}` : ` L ${X.toFixed(1)} ${Y.toFixed(1)}`; first = false;
      }
      return d;
    };

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="#fff"/>`;

    // Grid
    for (let x = 0; x <= xMax; x += 2) {
      const col = x % 10 === 0 ? "#cbd5e1" : "#eef2f7";
      svg += `\n<line x1="${x2px(x)}" y1="${padT}" x2="${x2px(x)}" y2="${padT + plotH}" stroke="${col}" stroke-width="1"/>`;
      if (x % 10 === 0) svg += `\n<text x="${x2px(x)}" y="${padT + plotH + 14}" text-anchor="middle" fill="#334155" font-size="12">${x}</text>`;
    }
    for (let y = Math.ceil(yMin / 5) * 5; y <= yMax; y += 5) {
      const col = Math.round(y) % 20 === 0 ? "#cbd5e1" : "#eef2f7";
      svg += `\n<line x1="${padL}" y1="${y2py(y)}" x2="${padL + plotW}" y2="${y2py(y)}" stroke="${col}" stroke-width="1"/>`;
      if (Math.round(y) % 10 === 0) svg += `\n<text x="${padL - 8}" y="${y2py(y) + 4}" text-anchor="end" fill="#334155" font-size="12">${y}</text>`;
    }

    if (showT) for (let T = tMin; T <= tMax; T += 5) svg += `\n<path d="${pathIsoT(T)}" stroke="#0ea5e9" stroke-width="1.1" fill="none"/>`;
    if (showRH) for (const rh of [10,20,30,40,50,60,70,80,90]) svg += `\n<path d="${pathRH(rh)}" stroke="#8b5cf6" stroke-width="1" fill="none"/>`;
    if (showSat) svg += `\n<path d="${pathRH(100)}" stroke="#ef4444" stroke-width="2" fill="none"/>`;

    // Prozesse & Punkte
    for (const pr of processes) {
      const col = pr.type === "wrg" ? "#3b82f6" : "#fb923c";
      svg += `\n<line x1="${x2px(pr.p1.x_gpkg)}" y1="${y2py(pr.p1.h)}" x2="${x2px(pr.p2.x_gpkg)}" y2="${y2py(pr.p2.h)}" stroke="${col}" stroke-width="3"/>`;
    }
    for (const p of points) svg += `\n<circle cx="${x2px(p.x_gpkg)}" cy="${y2py(p.h)}" r="5" fill="#38bdf8" stroke="#0369a1" stroke-width="2"/>`;

    // Labels
    svg += `\n<text x="${padL + plotW / 2}" y="${H - 6}" text-anchor="middle" fill="#0f172a" font-size="13">x  [g/kg trockene Luft]</text>`;
    svg += `\n<g transform="translate(18 ${padT + plotH / 2}) rotate(-90)"><text text-anchor="middle" fill="#0f172a" font-size="13">h  [kJ/kg trockene Luft]</text></g>`;
    svg += `\n</svg>`;
    return svg;
  };

  const saveSVG = () => {
    const svg = buildSVG();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hx.svg"; a.click();
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

  // ---- Legende: frei verschiebbar (viewport) ----
  const [legPos, setLegPos] = useState({ x: 24, y: 24 });
  const [legLocked, setLegLocked] = useState(false);
  const legRef = useRef(null); const dragRef = useRef({ on: false, dx: 0, dy: 0 });
  const startDrag = (e) => {
    if (legLocked) return;
    const rect = legRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current.on = true; dragRef.current.dx = cx - rect.left; dragRef.current.dy = cy - rect.top; e.preventDefault();
  };
  useEffect(() => {
    const move = (cx, cy) => {
      if (!dragRef.current.on || !legRef.current) return;
      const lw = legRef.current.offsetWidth, lh = legRef.current.offsetHeight;
      setLegPos({
        x: Math.max(-lw + 4, Math.min(cx - dragRef.current.dx, window.innerWidth - 4)),
        y: Math.max(-lh + 4, Math.min(cy - dragRef.current.dy, window.innerHeight - 4)),
      });
    };
    const mm = (e) => move(e.clientX, e.clientY);
    const mu = () => { dragRef.current.on = false; };
    const tm = (e) => { if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY); };
    const tu = () => { dragRef.current.on = false; };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
    document.addEventListener("touchmove", tm, { passive: false }); document.addEventListener("touchend", tu);
    return () => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); document.removeEventListener("touchmove", tm); document.removeEventListener("touchend", tu); };
  }, []);

  // ---- UI ----
  const Main = () => (
    <div className="max-w-7xl mx-auto p-6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold mb-3">Diagramm</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="p" unit="kPa" value={p_kPa} onCommit={setP} />
              <NumberField label="x max" unit="g/kg" value={xMax} onCommit={(v)=>setXMax(Math.max(1,v))} />
              <NumberField label="T min" unit="°C" value={tMin} onCommit={setTMin} />
              <NumberField label="T max" unit="°C" value={tMax} onCommit={setTMax} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-700">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showT} onChange={(e)=>setShowT(e.target.checked)}/>Isothermen</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showRH} onChange={(e)=>setShowRH(e.target.checked)}/>φ-Kurven</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showSat} onChange={(e)=>setShowSat(e.target.checked)}/>Sättigung</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showHover} onChange={(e)=>setShowHover(e.target.checked)}/>Hover</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={clickAdd} onChange={(e)=>setClickAdd(e.target.checked)}/>Klick→Punkt</label>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold mb-3">Schritt 1 · WRG (sensible)</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Außen T"  unit="°C" value={Toa} onCommit={setToa}/>
              <NumberField label="Außen φ"  unit="%"  value={phi_oa} onCommit={setPhiOA}/>
              <NumberField label="Abluft T" unit="°C" value={Texh} onCommit={setTexh}/>
              <NumberField label="Abluft φ" unit="%"  value={phi_exh} onCommit={setPhiEX}/>
              <NumberField label="Zuluft V̇" unit="m³/h" value={Vsup} onCommit={setVsup}/>
              <NumberField label="Abluft V̇" unit="m³/h" value={Vexh} onCommit={setVexh}/>
              <NumberField label="WRG ε"   unit="%"    value={eta}  onCommit={setEta}/>
            </div>
            <div className="mt-3 flex gap-2">
              <Btn onClick={calcWRG}>WRG berechnen</Btn>
              <Btn onClick={clearAll} tone="ghost">Reset Punkte</Btn>
            </div>
            {msgWRG && <div className="mt-3 text-sm p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">{msgWRG}</div>}
            <p className="mt-1 text-[11px] text-slate-500">Methode: ε·C<sub>min</sub>·ΔT (keine Feuchterückgewinnung)</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold mb-3">Schritt 2 · Heizer</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="T₁ (Ein)" unit="°C" value={Tin} onCommit={setTin}/>
              <NumberField label="φ₁ (Ein)" unit="%"  value={phi_in} onCommit={setPhiIn}/>
              <NumberField label="Ziel T₂"  unit="°C" value={Tout} onCommit={setTout}/>
              <NumberField label="oder ΔT"  unit="K"  value={dT}   onCommit={(v)=>setdT(String(v))}/>
              <NumberField label="V̇ Zuluft" unit="m³/h" value={Vheiz} onCommit={setVheiz}/>
            </div>
            <div className="mt-3 flex gap-2">
              <Btn onClick={calcHeater} tone="warn">Heizleistung</Btn>
              <Btn onClick={savePNG} tone="ghost">PNG</Btn>
              <Btn onClick={saveSVG} tone="ghost">SVG</Btn>
              <Btn onClick={exportPDF} tone="ghost">PDF</Btn>
            </div>
            {msgHeiz && <div className="mt-3 text-sm p-2 rounded bg-orange-50 border border-orange-200 text-orange-800">{msgHeiz}</div>}
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold mb-2">Punkt plotten</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="T" unit="°C" value={Tplot} onCommit={setTplot}/>
              <NumberField label="φ" unit="%"  value={RHplot} onCommit={setRHplot}/>
            </div>
            <div className="mt-3"><Btn onClick={addPlotPoint}>Punkt hinzufügen</Btn></div>
          </div>
        </div>

        {/* Diagramm */}
        <div className="xl:col-span-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold">Mollier h-x Diagramm ({p_kPa} kPa)</h3>
              <p className="text-sm text-slate-600">Bereich: {tMin}…{tMax} °C · 0…{xMax} g/kg</p>
            </div>
            <div className="p-4">
              <canvas
                ref={canvasRef}
                className="w-full rounded border border-slate-200 bg-white"
                style={{ height: "82vh", minHeight: "560px", cursor: showHover ? "crosshair" : "default" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* FREI BEWEGLICHE LEGENDE */}
      <div
        ref={legRef}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        className="fixed z-[9999] bg-white/95 border border-slate-300 rounded-lg shadow-md select-none"
        style={{ left: legPos.x, top: legPos.y, width: 210 }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200" style={{ cursor: legLocked ? "default" : "grab" }}>
          <div className="text-sm font-semibold text-slate-800">Legende</div>
          <label className="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" checked={legLocked} onChange={(e)=>setLegLocked(e.target.checked)} />fixieren</label>
        </div>
        <div className="p-3 text-xs text-slate-700 space-y-1">
          <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-sky-600" /> Isothermen</div>
          <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-purple-600" /> φ-Kurven</div>
          <div className="flex items-center gap-2"><div className="w-5 h-0.5 bg-red-500" /> Sättigung</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-sky-500 border border-sky-700" /> Punkt</div>
          <div className="flex items-center gap-2"><div className="w-5 h-1 bg-blue-500" /> WRG</div>
          <div className="flex items-center gap-2"><div className="w-5 h-1 bg-orange-400" /> Heizer</div>
          <div className="pt-1 text-[10px] text-slate-500">Drag überall; „fixieren“ sperrt Drag.</div>
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 p-4">
          <h1 className="text-2xl font-bold text-slate-900">Mollier h–x Diagramm · simple core</h1>
          <p className="text-slate-600 text-sm">Default −20…+40 °C · frei verschiebbare Legende · WRG + Heizer</p>
        </header>
        <Main />
      </div>
    );
  }
  return <Main />;
}
