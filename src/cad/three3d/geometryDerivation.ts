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
import { documentVisibleCornersWorld } from "../documentGeometry";
import { orderedLabelItems } from "../stackOrder";
import { buildHealedWallSolidRing } from "../wallSolid";
import { subtractPrism } from "./relations";
import { faceMesh, resolveTilt, slabMesh, tiltMesh, tiltPoint, type MeshData, type Vec3 } from "./solidMesh";

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
  /** Zeichenreihenfolge (Ebene + Stapel), größer = weiter vorne. */
  order?: number;
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
  order?: number;
  /** Inhalt als Bild: Ecken in Reihenfolge oben-links, oben-rechts, unten-rechts, unten-links. */
  texture?: { list: "documents" | "textBoxes" | "tables" };
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
  order?: number;
}

/** Allgemeiner Körper als Dreiecksnetz (geneigte Schraffuren, Verschneidungsergebnisse). */
export interface Mesh3D {
  type: "mesh";
  source: Solid3DSource;
  sourceId: string;
  sheetId: string;
  mesh: MeshData;
  /** Geschlossenes Volumen (false = flache Fläche). */
  closed: boolean;
  color: string;
  order?: number;
  /** Ober-/Unterseite als räumliche Ringe (für „An Oberfläche begrenzen“). */
  faces?: { top: { outer: Vec3[]; holes: Vec3[][] }; bottom: { outer: Vec3[]; holes: Vec3[][] } };
}

export type Derived3D = (Prism3D | Plane3D | Line3D | Mesh3D) & { note?: string };

export interface DeriveOptions {
  /** Grundrissgröße eines Bibliotheksobjekts (lokal, vor Skalierung). */
  libraryBounds?: (definitionId: string) => { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Ersatzhöhe für Bibliotheksobjekte ohne eigene Höhe. */
  libraryDefaultHeightM?: number;
  /** Aktives Blatt – erscheint immer, weitere Blätter nur ausdrücklich. */
  activeSheetId?: string | null;
  /** Exakte Welt-Ecken eines Bibliothekselements (Nullpunkt, Skalierung, Spiegelung, Drehung). */
  libraryCorners?: (instance: any) => Vec2[] | null;
  /** Ausgeblendete Ebenen erscheinen nicht in 3D. */
  isLabelVisible?: (labelId: string) => boolean;
  /** Vordergrund-Rang einer Ebene (größer = weiter vorne). */
  labelFrontRank?: (labelId: string) => number;
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
  const holes: Vec2[][] = (hatch.holes || []).filter((r: Vec2[]) => r && r.length >= 3);
  const color = hatch.fillColor || "#cfc6b0";
  const flatItem = (): Derived3D => h <= EPS
    ? { type: "plane", source: "hatch", sourceId: hatch.id, sheetId, outline: hatch.points, holes, z, color }
    : { type: "prism", source: "hatch", sourceId: hatch.id, sheetId, footprint: hatch.points, holes, z0: z, z1: z + h, color };
  const tilt = resolveTilt(hatch, z);
  if (!tilt) return flatItem();
  if (!tilt.frame) return { ...flatItem(), note: tilt.error };
  // Neigung immer aus der ursprünglichen, ungekippten Geometrie berechnen.
  const f = tilt.frame;
  const lift = (ring: Vec2[], zz: number): Vec3[] => ring.map(p => tiltPoint(p.x, p.y, zz, f));
  const faces = {
    top: { outer: lift(hatch.points, z + h), holes: holes.map(r => lift(r, z + h)) },
    bottom: { outer: lift(hatch.points, z), holes: holes.map(r => lift(r, z)) },
  };
  const base3 = h <= EPS ? faceMesh(hatch.points, holes, () => z) : slabMesh(hatch.points, holes, () => z, () => z + h);
  if (!base3) return flatItem();
  return { type: "mesh", source: "hatch", sourceId: hatch.id, sheetId, mesh: tiltMesh(base3, f), closed: h > EPS, color, faces };
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

/** Rechteck (oben-links, oben-rechts, unten-rechts, unten-links) um einen Mittelpunkt. */
function boxCorners(center: Vec2, w: number, h: number, rot: number): Vec2[] { return rect(center, w, h, rot); }

/** Leitet alle 3D-Körper eines Blattes ab. */
export function deriveScene3D(scene: any, sheet: Sheet, opts: DeriveOptions = {}): Derived3D[] {
  if (!scene) return [];
  const sheetId = sheet.id;
  const base = sheetElevationM(sheet);
  const out: Derived3D[] = [];
  const vis = (o: any) => !opts.isLabelVisible || !o?.labelId || opts.isLabelVisible(o.labelId);
  // Reihenfolge wie im 2D: Ebene, dann Stapel innerhalb der Ebene.
  const orderOf = new Map<any, number>();
  const labelIds = new Set<string>();
  for (const k of ["documents", "hatches", "walls", "doors", "stairs", "segments", "freeStrokes", "dimensions", "textBoxes", "tables", "libraryInstances"]) {
    for (const o of scene[k] || []) if (o?.labelId) labelIds.add(o.labelId);
  }
  for (const l of labelIds) {
    const rank = opts.labelFrontRank ? opts.labelFrontRank(l) : 0;
    orderedLabelItems(scene, l).forEach((it, i) => orderOf.set(it.obj, rank * 1e6 + i));
  }
  const push = (o: any, items: Derived3D[]) => { const ord = orderOf.get(o) ?? 0; for (const d of items) { d.order = ord; out.push(d); } };
  const doors = (scene.doors || []).filter(vis);
  const walls = deriveWalls(scene, doors, sheetId, base, vis);
  for (const [w, parts] of walls) push(w, parts);
  for (const h of scene.hatches || []) { if (!vis(h)) continue; const d = deriveHatch(h, sheetId, base); if (d) push(h, [d]); }
  for (const s of scene.stairs || []) if (vis(s)) push(s, deriveStair(s, sheetId, base));
  const flat = (source: Solid3DSource, o: any, corners: Vec2[], color: string, list: "documents" | "textBoxes" | "tables") => {
    if (corners.length !== 4) return;
    const w = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const h = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    if (!(w > EPS && h > EPS)) return;
    push(o, [{ type: "plane", source, sourceId: o.id, sheetId, outline: corners, holes: [], z: base + objectElevationM(o), color, texture: { list } }]);
  };
  for (const d of scene.documents || []) {
    if (!vis(d) || !d.position) continue;
    let c: Vec2[] = [];
    try { c = documentVisibleCornersWorld(d); } catch { /* defektes Dokument */ }
    flat("document", d, c, "#ffffff", "documents");
  }
  for (const t of scene.textBoxes || []) if (vis(t)) flat("textbox", t, boxCorners(t.center, t.widthM, t.heightM, t.rotationRad), "#f6f3ea", "textBoxes");
  for (const t of scene.tables || []) if (vis(t)) flat("table", t, boxCorners(t.center, t.widthM, t.heightM, t.rotationRad), "#f6f3ea", "tables");
  for (const li of scene.libraryInstances || []) {
    if (!vis(li)) continue;
    let fp: Vec2[] | null = opts.libraryCorners?.(li) ?? null;
    if (!fp) {
      const b = opts.libraryBounds?.(li.definitionId);
      if (!b) continue;
      fp = rect(li.position, (b.maxX - b.minX) * Math.abs(li.scaleX || 1), (b.maxY - b.minY) * Math.abs(li.scaleY || 1), li.rotationRad);
    }
    if (fp.length < 3) continue;
    // Spiegelung dreht die Umlaufrichtung – für die Extrusion vereinheitlichen.
    let area = 0;
    for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length]; area += a.x * b.y - b.x * a.y; }
    if (Math.abs(area) < EPS) continue;
    if (area < 0) fp = [...fp].reverse();
    const z0 = base + objectElevationM(li);
    const h = libraryBodyHeightM(li, opts.libraryDefaultHeightM);
    push(li, [{ type: "prism", source: "library", sourceId: li.id, sheetId, footprint: fp, holes: [], z0, z1: z0 + h, color: "#b9c2b0" }]);
  }
  const line = (source: Solid3DSource, o: any, points: Vec2[], color: string) => {
    if (vis(o) && points.length >= 2) push(o, [{ type: "line", source, sourceId: o.id, sheetId, points, z: base + objectElevationM(o), color }]);
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
    if (!sheetParticipatesIn3D(sh, opts.activeSheetId)) continue;
    out.push(...deriveScene3D(sceneOf(sh.id), sh, opts));
  }
  return out;
}
