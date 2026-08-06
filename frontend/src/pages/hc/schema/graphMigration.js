// Rückwärtskompatible Geometrieschicht (Punkt 2/19).
//
// Ein gespeichertes Schema kann aus jeder früheren Fassung stammen. Beim Laden
// wird es hier auf den aktuellen Stand gehoben, OHNE dabei Geometrie zu
// verändern: keine Punkte verschieben, keine Punkte erfinden, keine Leitung
// wegwerfen. Die Migration ergänzt nur, was fehlt.
//
// Sie ist rein und getestet, weil hier der Bestand auf dem Spiel steht.

import { NUMMERIERT } from '../../../components/hc/nodes/HydraulikNodes';

export const GRID_OPTIONEN = [2, 5, 10, 20, 25, 50];   // mm
export const CAD_GRID = 10;

export const DEFAULT_DRAWING_CONFIG = {
  corner_radius: 8,
  grid_size: CAD_GRID,
  snap_tolerance: 10,
  shortcut_polyline: 'p',
  shortcut_line: 'l',
  shortcut_rotate: 'd',
  shortcut_mirror: 's',
  shortcut_align: 'a',
  // Verschieben (CAD-MOVE). Frei belegbar; die Befehlstasten haben Vorrang vor
  // den festen Layer-Tasten V/R/B, damit auch «v» wählbar ist.
  shortcut_move: 'm',
  // Mit Lücke trennen (BREAK) und Dehnen (STRETCH), wie im CAD frei belegbar.
  shortcut_break: 'k',
  shortcut_stretch: 'x',
  // Leitungen ändern (Issue #72). Alle vier sind frei belegbar; die Vorgaben
  // sind bewusst so gewählt, dass sie keine bestehende Belegung verdrängen:
  //
  //   `t`  bleibt der Auftakt der Befehlsfolge `TR` = ECKE VERBINDEN. Diese
  //        Belegung ist gesetzt (Dominic 2026-08-06) und wird von Stutzen
  //        ausdrücklich NICHT übernommen — Stutzen bekommt `w`.
  //   `v`/`r`/`b` sind die Layer-Schnellwahl und bleiben frei von Befehlen.
  //   `q` ist in `frontend/e2e/bedienung.mjs` die frei gewählte Umbelegungs-
  //        taste und bleibt darum ebenfalls unbelegt.
  //   `p l d s a m k x` sind bereits vergeben (siehe oben).
  shortcut_offset: 'o',
  shortcut_trim: 'w',
  shortcut_extend: 'e',
  shortcut_join: 'j',
  // Auto-Rücklauf ist AUS, solange ein Schema ihn nicht ausdrücklich einschaltet.
  auto_return: false,
  // CAD-Zustände. Fehlen sie (jedes Altschema), gilt der bisherige Default:
  // orthogonal an, Objektfang an — also exakt das bisherige Verhalten.
  ortho: true,
  object_snap: true,
  polar_snap: false,
  polar_angle: 45,
  dynamic_input: true,
  // Das Raster ist eine Zeichenhilfe, kein Planinhalt: beurteilt wird ein
  // Schema auf leerem Grund, so wie es später im PDF steht (Dominic
  // 2026-08-06). Gefangen wird trotzdem aufs Raster — Sichtbarkeit und Fang
  // sind zwei verschiedene Dinge.
  raster_sichtbar: false,
};

const shortcutTaste = (value, fallback) =>
  String(value || fallback).trim().slice(-1).toLowerCase();

const flagge = (wert, fallback) => (typeof wert === 'boolean' ? wert : fallback);

export function normalisiereDrawingConfig(config = {}) {
  const c = config || {};
  return {
    corner_radius: Math.max(0, Math.min(40, Number(c.corner_radius ?? DEFAULT_DRAWING_CONFIG.corner_radius) || 0)),
    grid_size: GRID_OPTIONEN.includes(Number(c.grid_size)) ? Number(c.grid_size) : DEFAULT_DRAWING_CONFIG.grid_size,
    snap_tolerance: Math.max(2, Math.min(40,
      Number(c.snap_tolerance ?? DEFAULT_DRAWING_CONFIG.snap_tolerance) || DEFAULT_DRAWING_CONFIG.snap_tolerance)),
    shortcut_polyline: shortcutTaste(c.shortcut_polyline, DEFAULT_DRAWING_CONFIG.shortcut_polyline),
    shortcut_line: shortcutTaste(c.shortcut_line, DEFAULT_DRAWING_CONFIG.shortcut_line),
    shortcut_rotate: shortcutTaste(c.shortcut_rotate, DEFAULT_DRAWING_CONFIG.shortcut_rotate),
    shortcut_mirror: shortcutTaste(c.shortcut_mirror, DEFAULT_DRAWING_CONFIG.shortcut_mirror),
    shortcut_align: shortcutTaste(c.shortcut_align, DEFAULT_DRAWING_CONFIG.shortcut_align),
    shortcut_move: shortcutTaste(c.shortcut_move, DEFAULT_DRAWING_CONFIG.shortcut_move),
    shortcut_break: shortcutTaste(c.shortcut_break, DEFAULT_DRAWING_CONFIG.shortcut_break),
    shortcut_stretch: shortcutTaste(c.shortcut_stretch, DEFAULT_DRAWING_CONFIG.shortcut_stretch),
    shortcut_offset: shortcutTaste(c.shortcut_offset, DEFAULT_DRAWING_CONFIG.shortcut_offset),
    shortcut_trim: shortcutTaste(c.shortcut_trim, DEFAULT_DRAWING_CONFIG.shortcut_trim),
    shortcut_extend: shortcutTaste(c.shortcut_extend, DEFAULT_DRAWING_CONFIG.shortcut_extend),
    shortcut_join: shortcutTaste(c.shortcut_join, DEFAULT_DRAWING_CONFIG.shortcut_join),
    auto_return: c.auto_return === true,
    ortho: flagge(c.ortho, DEFAULT_DRAWING_CONFIG.ortho),
    object_snap: flagge(c.object_snap, DEFAULT_DRAWING_CONFIG.object_snap),
    polar_snap: flagge(c.polar_snap, DEFAULT_DRAWING_CONFIG.polar_snap),
    polar_angle: [90, 45, 30, 15].includes(Number(c.polar_angle))
      ? Number(c.polar_angle) : DEFAULT_DRAWING_CONFIG.polar_angle,
    dynamic_input: flagge(c.dynamic_input, DEFAULT_DRAWING_CONFIG.dynamic_input),
    raster_sichtbar: flagge(c.raster_sichtbar, DEFAULT_DRAWING_CONFIG.raster_sichtbar),
  };
}

/**
 * Gespeicherter Graph → Editorzustand.
 *
 * Leitungen behalten ihre Punkte unverändert. Fehlt `points` (Altbestand vor
 * der Polyline), bleibt es weg — die Route wird dann wie bisher aus Quelle und
 * Ziel gerechnet (`adaptivePolyline`). Es wird ausdrücklich KEINE Punktliste
 * erfunden, weil das die Leitung sichtbar verändern würde.
 */
export function graphFuerEditor(graph = {}) {
  const rohNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  let maxNr = rohNodes.reduce((max, node) => Math.max(max, parseInt(node?.data?.nr, 10) || 0), 0);

  const nodes = rohNodes.map((node) => {
    // Alte freie Leitungsenden lagen um die halbe Ankergrösse versetzt. Einmalig
    // korrigieren und markieren, damit es nicht bei jedem Laden erneut passiert.
    if (node.type === 'junction' && !node.data?.cad_anchor) {
      return {
        ...node,
        position: { x: (node.position?.x || 0) + 6, y: (node.position?.y || 0) + 6 },
        data: { ...(node.data || {}), cad_anchor: true },
      };
    }
    return (NUMMERIERT.includes(node.type) && node.data?.nr == null)
      ? { ...node, data: { ...node.data, nr: ++maxNr } }
      : node;
  });

  const drawingConfig = normalisiereDrawingConfig(graph?.drawing_config);
  const edges = (Array.isArray(graph?.edges) ? graph.edges : []).map((edge) => ({
    ...edge,
    data: {
      ...(edge.data || {}),
      cad_polyline: true,
      polyline_version: 1,
      corner_radius: edge.data?.corner_radius ?? drawingConfig.corner_radius,
    },
  }));

  return { nodes, edges, drawingConfig, layerConfig: graph?.layer_config || {} };
}
