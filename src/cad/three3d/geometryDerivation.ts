/**
 * Zentrale 3D-Ableitung (Paket 01, Schritt 1).
 *
 * 2D-CAD bleibt führend: Diese Datei liest ausschließlich bestehende
 * Szene-Objekte und erzeugt daraus rein abgeleitete, flüchtige 3D-Körper.
 * Nichts davon wird gespeichert. Welthöhe = Blatthöhe + Objekthöhe.
 */
import type { Vec2 } from "../geometry";
import type { Sheet } from "../SheetManager";
import { sheetElevationM, sheetParticipatesIn3D } from "../SheetManager";
import { buildWallSolidRing } from "../wallSolid";
import { wallBandPolygon, wallReferenceLengths } from "../doorGeom";
import { computeStairGeometry } from "../stairGeometry";
import { objectElevationM } from "../objectMeta";

export type Solid3DSource =
  | "wall" | "hatch" | "stair" | "document" | "textbox" | "table" | "library"
  | "segment" | "dimension" | "freeStroke";

/** Senkrecht extrudierter Körper: Grundriss (+Löcher) von z0 bis z1. */
export interface Prism3D {
  type: "prism";
  source: Solid3DSource;
  sourceId: string;
  sheetId: string;
  footprint: Vec2[];
  holes: Vec2[][];
  z0: number;
  z1: number;
  color: string;
}

/** Flache, horizontale Fläche auf Höhe z (Körperhöhe 0, Dokumente, Texte …). */
export interface Plane3D {
  type: "plane";
  source: Solid3DSource;
  sourceId: string;
  sheetId: string;
  outline: Vec2[];
  holes: Vec2[][];
  z: number;
  color: string;
}

/** Flaches Linien-Overlay (Linien, Maße, Freihand) ohne Extrusion. */
export interface Line3D {
  type: "line";
  source: Solid3DSource;
  sourceId: string;
  sheetId: string;
  points: Vec2[];
  z: number;
  color: string;
}

export type Derived3D = Prism3D | Plane3D | Line3D;

export interface DeriveOptions {
  /** Grundrissgröße eines Bibliotheksobjekts (lokal, vor Skalierung). */
  libraryBounds?: (definitionId: string) => { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Ersatzhöhe für Bibliotheksobjekte ohne eigene Höhe. */
  libraryDefaultHeightM?: number;
}

const EPS = 1e-6;

function rect(center: Vec2, w: number, h: number, rot: number): Vec2[] {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
    x: center.x + x * c - y * s,
    y: center.y + x * s + y * c,
  }));
}

/** Wand mit echten Durchbrüchen für Türen/Fenster. */
export function deriveWall(wall: any, doors: any[], sheetId: string, base: number): Prism3D[] {
  const h = Math.max(0, Number(wall.heightM) || 0);
  if (h <= EPS || !wall.corners || wall.corners.length < 2) return [];
  const z0 = base + objectElevationM(wall);
  const color = wall.fillColor || "#d9d4c7";
  const mk = (fp: Vec2[], a: number, b: number): Prism3D => ({
    type: "prism", source: "wall", sourceId: wall.id, sheetId, footprint: fp, holes: [],
    z0: z0 + a, z1: z0 + b, color,
  });
  const own = doors.filter(d => d && d.wallId === wall.id);
  if (!own.length) {
    const ring = buildWallSolidRing(wall);
    return ring.length >= 3 ? [mk(ring, 0, h)] : [];
  }
  const { total } = wallReferenceLengths(wall);
  const half = wall.thicknessM / 2;
  const openings = own
    .map(d => ({
      from: Math.max(0, d.posM - d.widthM / 2),
      to: Math.min(total, d.posM + d.widthM / 2),
      sill: Math.max(0, Number(d.breakHeightM) || 0),
      top: Math.max(0, Number(d.breakHeightM) || 0) + Math.max(0, Number(d.heightM) || 0),
    }))
    .filter(o => o.to - o.from > EPS)
    .sort((a, b) => a.from - b.from);
  const out: Prism3D[] = [];
  let s = 0;
  for (const o of openings) {
    if (o.from > s + EPS) out.push(mk(wallBandPolygon(wall, s, o.from, half), 0, h));
    const band = wallBandPolygon(wall, Math.max(s, o.from), o.to, half);
    if (o.sill > EPS) out.push(mk(band, 0, Math.min(o.sill, h)));
    if (o.top < h - EPS) out.push(mk(band, o.top, h));
    s = Math.max(s, o.to);
  }
  if (total > s + EPS) out.push(mk(wallBandPolygon(wall, s, total, half), 0, h));
  return out;
}

export function deriveHatch(hatch: any, sheetId: string, base: number): Derived3D | null {
  if (!hatch.points || hatch.points.length < 3) return null;
  const z = base + objectElevationM(hatch);
  const h = Math.max(0, Number(hatch.heightM) || 0);
  const holes = (hatch.holes || []).filter((r: Vec2[]) => r && r.length >= 3);
  const color = hatch.fillColor || "#cfc6b0";
  if (h <= EPS) return { type: "plane", source: "hatch", sourceId: hatch.id, sheetId, outline: hatch.points, holes, z, color };
  return { type: "prism", source: "hatch", sourceId: hatch.id, sheetId, footprint: hatch.points, holes, z0: z, z1: z + h, color };
}

/** Treppe als diskrete Stufen und Podeste (Blockstufen). */
export function deriveStair(stair: any, sheetId: string, base: number): Prism3D[] {
  let g;
  try { g = computeStairGeometry(stair); } catch { return []; }
  if (!g || !g.treads?.length) return [];
  const riser = g.riserCount > 0 && g.totalHeightM > 0 ? g.totalHeightM / g.riserCount : (Number(stair.riserHeightM) || 0.175);
  const z0 = base + objectElevationM(stair);
  const down = stair.direction === "down";
  const n = g.treads.length;
  const lvl = (k: number) => (down ? (n + 1 - k) : k) * riser;
  const color = stair.fillColor || "#c8b48a";
  const out: Prism3D[] = [];
  g.treads.forEach((t, i) => {
    if (t.poly.length < 3) return;
    out.push({ type: "prism", source: "stair", sourceId: stair.id, sheetId, footprint: t.poly, holes: [], z0, z1: z0 + lvl(i + 1), color });
  });
  for (const l of g.landings) {
    if (l.poly.length < 3) continue;
    const before = typeof l.treadIndex === "number"
      ? l.treadIndex + 1
      : g.treads.filter(t => t.run <= l.knick).length;
    out.push({ type: "prism", source: "stair", sourceId: stair.id, sheetId, footprint: l.poly, holes: [], z0, z1: z0 + Math.max(riser, lvl(before)), color });
  }
  return out;
}

/** Leitet alle 3D-Körper eines Blattes ab. */
export function deriveScene3D(scene: any, sheet: Sheet, opts: DeriveOptions = {}): Derived3D[] {
  if (!scene) return [];
  const sheetId = sheet.id;
  const base = sheetElevationM(sheet);
  const out: Derived3D[] = [];
  const doors = scene.doors || [];
  for (const w of scene.walls || []) out.push(...deriveWall(w, doors, sheetId, base));
  for (const h of scene.hatches || []) { const d = deriveHatch(h, sheetId, base); if (d) out.push(d); }
  for (const s of scene.stairs || []) out.push(...deriveStair(s, sheetId, base));
  const flat = (source: Solid3DSource, o: any, center: Vec2, w: number, h: number, color: string) => {
    if (!(w > EPS && h > EPS)) return;
    out.push({ type: "plane", source, sourceId: o.id, sheetId, outline: rect(center, w, h, o.rotationRad), holes: [], z: base + objectElevationM(o), color });
  };
  for (const d of scene.documents || []) flat("document", d, d.position, d.widthM, d.heightM, "#ffffff");
  for (const t of scene.textBoxes || []) flat("textbox", t, t.center, t.widthM, t.heightM, "#f6f3ea");
  for (const t of scene.tables || []) flat("table", t, t.center, t.widthM, t.heightM, "#f6f3ea");
  for (const li of scene.libraryInstances || []) {
    const b = opts.libraryBounds?.(li.definitionId);
    if (!b) continue;
    const w = (b.maxX - b.minX) * Math.abs(li.scaleX || 1);
    const d = (b.maxY - b.minY) * Math.abs(li.scaleY || 1);
    if (!(w > EPS && d > EPS)) continue;
    const z0 = base + objectElevationM(li);
    const h = Number.isFinite(li.heightM) && li.heightM > 0 ? li.heightM : (opts.libraryDefaultHeightM ?? 1);
    out.push({ type: "prism", source: "library", sourceId: li.id, sheetId, footprint: rect(li.position, w, d, li.rotationRad), holes: [], z0, z1: z0 + h, color: "#b9c2b0" });
  }
  const line = (source: Solid3DSource, o: any, points: Vec2[], color: string) => {
    if (points.length >= 2) out.push({ type: "line", source, sourceId: o.id, sheetId, points, z: base + objectElevationM(o), color });
  };
  for (const s of scene.segments || []) if (!s.isGuide) line("segment", s, [s.a, s.b], s.color || "#111111");
  for (const d of scene.dimensions || []) line("dimension", d, [d.p1, d.p2], d.lineColor || "#111111");
  for (const f of scene.freeStrokes || []) line("freeStroke", f, f.points || [], f.color || "#111111");
  return out;
}

/** Alle am 3D teilnehmenden Blätter zusammen ableiten. */
export function deriveProject3D(sheets: Sheet[], sceneOf: (id: string) => any, opts: DeriveOptions = {}): Derived3D[] {
  const out: Derived3D[] = [];
  for (const sh of sheets) {
    if (!sheetParticipatesIn3D(sh)) continue;
    out.push(...deriveScene3D(sceneOf(sh.id), sh, opts));
  }
  return out;
}
