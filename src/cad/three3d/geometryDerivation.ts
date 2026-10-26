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
import { libraryBodyHeightM, objectElevationM } from "../objectMeta";
export { libraryBodyHeightM };
import { documentVisibleCornersWorld } from "../documentGeometry";
import { orderedLabelItems } from "../stackOrder";
import { buildHealedWallSolidRing } from "../wallSolid";
import { meshOf, subtractPrism } from "./relations";
import { genericVertex, resolveGenericTilt, scaleAcrossAxis, tiltShape, tiltShapeError } from "./tiltGeometry";
import { csgMesh, faceMesh, resolveTilt, slabMesh, tiltMesh, tiltPoint, type MeshData, type Vec3 } from "./solidMesh";
import type { Material3D } from "./materials";
import { deriveOpening } from "./openingGeometry";
import { deriveInfoBox } from "./infoBoxGeometry";
import { projectionCos } from "./tiltGeometry";
import { applySpatialPose, posePiece } from "./spatialTransform";
import { Matrix4 } from "three";

export type Solid3DSource =
  | "wall" | "hatch" | "stair" | "document" | "textbox" | "table" | "library"
  | "segment" | "dimension" | "freeStroke" | "infobox" | "door" | "window";

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
  texture?: Texture3D;
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

export interface Texture3D { list: "documents" | "textBoxes" | "tables" | "libraryInstances" | "infoBoxes"; corners?: Vec2[]; snapshot?: unknown; objectId?: string }
export type Derived3D = (Prism3D | Plane3D | Line3D | Mesh3D) & { spatialPoints?: Vec3[]; note?: string; material?: Material3D; part?: "frame" | "leaf" | "glass"; surfaceOpacity?: number; texture?: Texture3D; uvs?: number[]; /** Leichtes Eigenleuchten (0…1), z. B. Infobox-Symbol. */ glow?: number };

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
  libraryGeometry?: (instance: any, sheet: Sheet) => Derived3D[];
}

const EPS = 1e-6;

function rect(center: Vec2, w: number, h: number, rot: number): Vec2[] {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
    x: center.x + x * c - y * s,
    y: center.y + x * s + y * c,
  }));
}

/** Öffnungen einer Wand: Unterkante = Brüstung über Wandunterkante, Oberkante = Brüstung + Öffnungshöhe. */
export function wallOpenings(wall: any, doors: any[]) {
  const { total } = wallReferenceLengths(wall);
  return doors.filter(d => d && d.wallId === wall.id)
    .map(d => ({
      from: Math.max(0, d.posM - d.widthM / 2),
      to: Math.min(total, d.posM + d.widthM / 2),
      sill: Number(d.breakHeightM) || 0,
      top: (Number(d.breakHeightM) || 0) + Math.max(0, Number(d.heightM) || 0),
    }))
    .filter(o => o.to - o.from > EPS && o.top - o.sill > EPS)
    .sort((a, b) => a.from - b.from);
}

const polyArea = (r: Vec2[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); };

/**
 * Wand mit echten Durchbrüchen für Türen/Fenster. Mit `others` wird der
 * geheilte Wandring wie im 2D verwendet (Gehrungen, L-/T-Anschlüsse, Kreuzungen);
 * Öffnungen werden danach aus diesem Körper geschnitten und zerstören die
 * Anschlüsse nicht.
 */
export function deriveWall(wall: any, doors: any[], sheetId: string, base: number, others?: any[], graph?: any): Prism3D[] {
  const h = Math.max(0, Number(wall.heightM) || 0);
  if (h <= EPS || !wall.corners || wall.corners.length < 2) return [];
  const z0 = base + objectElevationM(wall);
  const color = wall.fillColor || "#d9d4c7";
  let ring: Vec2[] = [];
  if (others) { try { ring = buildHealedWallSolidRing(wall, others, graph); } catch { ring = []; } }
  if (ring.length < 3) ring = buildWallSolidRing(wall);
  if (ring.length < 3) return [];
  const full: Prism3D = { type: "prism", source: "wall", sourceId: wall.id, sheetId, footprint: ring, holes: [], z0, z1: z0 + h, color };
  const openings = wallOpenings(wall, doors);
  if (!openings.length) return [full];
  const across = Math.max(0, Number(wall.thicknessM) || 0) + 0.05;
  const cutters: Prism3D[] = openings
    .filter(o => o.sill < h - EPS)
    .map(o => ({ ...full, footprint: wallBandPolygon(wall, o.from, o.to, across), z0: z0 + o.sill, z1: z0 + Math.min(o.top, h) }));
  try { return subtractPrism(full, cutters).filter(p => polyArea(p.footprint) > 1e-9); }
  catch { return [full]; }
}

/** Aussparungsvolumen der Öffnungen einer geneigten Wand – starr wie die Fenster/Türen mitgeführt. */
export function openingCutters(wall: any, doors: any[], sheetId: string, base: number, wallParts: Derived3D[]): MeshData[] {
  const h = Math.max(0, Number(wall.heightM) || 0);
  const z0 = base + objectElevationM(wall);
  const across = Math.max(0, Number(wall.thicknessM) || 0) + 0.05;
  const out: MeshData[] = [];
  for (const o of wallOpenings(wall, doors)) {
    const top = Math.min(o.top, h);
    if (top <= o.sill + EPS) continue;
    const p: Prism3D = { type: "prism", source: "wall", sourceId: wall.id, sheetId, footprint: wallBandPolygon(wall, o.from, o.to, across), holes: [], z0: z0 + o.sill, z1: z0 + top, color: "#000" };
    for (const d of tiltOpeningWithWall(wall, wallParts, [p], z0)) { const m = meshOf(d) ?? (d.type === "mesh" ? d.mesh : null); if (m) out.push(m); }
  }
  return out;
}


function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Zwei Wände schließen aneinander an (Endpunkt der einen auf der Achse der anderen). */
export function wallsConnected(a: any, b: any): boolean {
  const ca: Vec2[] = a.corners || [], cb: Vec2[] = b.corners || [];
  if (ca.length < 2 || cb.length < 2) return false;
  const tol = Math.max(Number(a.thicknessM) || 0, Number(b.thicknessM) || 0) * 0.75 + 1e-3;
  const touches = (ends: Vec2[], line: Vec2[]) => ends.some(p => line.some((q, i) => i > 0 && distPointSeg(p, line[i - 1], q) <= tol));
  return touches([ca[0], ca[ca.length - 1]], cb) || touches([cb[0], cb[cb.length - 1]], ca);
}

/**
 * Alle Wände eines Blattes mit automatischen Anschlüssen. Überlappende
 * Anschlussbereiche angrenzender Wände werden nur im tatsächlich gemeinsamen
 * Höhenbereich bereinigt; jede Wand bleibt ein eigener, auswählbarer Körper.
 */
export function deriveWalls(scene: any, doors: any[], sheetId: string, base: number, vis: (o: any) => boolean = () => true): Map<any, Prism3D[]> {
  const all: any[] = scene?.walls || [];
  let graph: any;
  try { graph = scene?.getWallTopology?.(); } catch { graph = undefined; }
  const out = new Map<any, Prism3D[]>();
  const done: any[] = [];
  for (const w of all) {
    if (!vis(w)) continue;
    let parts = deriveWall(w, doors, sheetId, base, all, graph);
    for (const prev of done) {
      if (!parts.length) break;
      if (!wallsConnected(prev, w)) continue;
      const cutters = out.get(prev) || [];
      if (!cutters.length) continue;
      try { parts = parts.flatMap(p => subtractPrism(p, cutters)).filter(p => polyArea(p.footprint) > 1e-8); }
      catch { /* Bereinigung fehlgeschlagen – Wandkörper bleibt vollständig */ }
    }
    out.set(w, parts);
    done.push(w);
  }
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
  const mode = hatch.tilt3D?.mode, plumb = hatch.tilt3D?.plumb, anchor = hatch.tilt3D?.anchor, basis = hatch.tilt3D?.basis;
  const bad = tiltShapeError(mode, f, h, plumb, anchor);
  if (bad) return { ...flatItem(), note: bad };
  const shape = tiltShape(mode, plumb, f, z, h, anchor, basis);
  if (shape.kind === "rigid" && basis === "actual") {
    // Tatsächliche Fläche: 2D-Punkte sind die Projektion → wahre Form quer zur Achse zurückstrecken.
    const pd = Number.isFinite(hatch.tilt3D?.projDeg) ? hatch.tilt3D.projDeg : hatch.tilt3D.angleDeg;
    const k = 1 / projectionCos(pd);
    if (Math.abs(k - 1) > 1e-9) {
      return deriveHatch({ ...hatch, points: scaleAcrossAxis(hatch.points, f, k), holes: holes.map(r => scaleAcrossAxis(r, f, k)), tilt3D: { ...hatch.tilt3D, basis: undefined, projDeg: undefined } }, sheetId, base);
    }
  }
  if (shape.kind === "field") {
    // Verformung mit lotrechten Seitenkanten (Grundriss ggf. quer zur Achse gestaucht).
    const mp = shape.map ?? ((p: Vec2) => p);
    const outerM = hatch.points.map(mp), holesM = holes.map(r => r.map(mp));
    const on = (ring: Vec2[], fz: (p: Vec2) => number): Vec3[] => ring.map(p => ({ x: p.x, y: p.y, z: fz(p) }));
    const top = shape.zt;
    const faces = {
      top: { outer: on(outerM, top), holes: holesM.map(r => on(r, top)) },
      bottom: { outer: on(outerM, h <= EPS ? top : shape.zb), holes: holesM.map(r => on(r, h <= EPS ? top : shape.zb)) },
    };
    const m = h <= EPS ? faceMesh(outerM, holesM, top) : slabMesh(outerM, holesM, shape.zb, shape.zt);
    if (!m) return flatItem();
    return { type: "mesh", source: "hatch", sourceId: hatch.id, sheetId, mesh: m, closed: h > EPS, color, faces };
  }
  const lift = (ring: Vec2[], zz: number): Vec3[] => ring.map(p => tiltPoint(p.x, p.y, zz, f));
  const faces = {
    top: { outer: lift(hatch.points, z + h), holes: holes.map(r => lift(r, z + h)) },
    bottom: { outer: lift(hatch.points, z), holes: holes.map(r => lift(r, z)) },
  };
  const base3 = h <= EPS ? faceMesh(hatch.points, holes, () => z) : slabMesh(hatch.points, holes, () => z, () => z + h);
  if (!base3) return flatItem();
  return { type: "mesh", source: "hatch", sourceId: hatch.id, sheetId, mesh: tiltMesh(base3, f), closed: h > EPS, color, faces };
}

/** Beliebigen abgeleiteten Teil als Dreiecksnetz (Linien als schmales Band). */
export function pieceMesh(d: any): MeshData | null {
  if (!d) return null;
  if (d.type === "mesh") return d.mesh;
  if (d.type === "prism") return slabMesh(d.footprint, d.holes, () => d.z0, () => d.z1);
  if (d.type === "plane") return faceMesh(d.outline, d.holes, () => d.z);
  if (d.type === "line") {
    const positions: number[] = [], indices: number[] = [], w = 0.015;
    for (let i = 0; i + 1 < d.points.length; i++) {
      const a = d.points[i], b = d.points[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < EPS) continue;
      const nx = -(b.y - a.y) / L * w, ny = (b.x - a.x) / L * w, k = positions.length / 3;
      positions.push(a.x + nx, a.y + ny, d.z, b.x + nx, b.y + ny, d.z, b.x - nx, b.y - ny, d.z, a.x - nx, a.y - ny, d.z);
      indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    return positions.length ? { positions, indices } : null;
  }
  return null;
}

/** 2D-Umrisspunkte abgeleiteter Teile (für gedachte Bezugskanten). */
export function piecePoints(items: any[]): Vec2[] {
  const out: Vec2[] = [];
  for (const d of items) out.push(...(d.footprint || d.outline || d.points || []));
  return out;
}

/** Neigung beliebiger Objekte (nicht Schraffur) über gedachte Kanten: punktweise auf alle Teile. */
/**
 * Türen/Fenster folgen der Wandneigung starr: Lage und Drehung aus dem
 * Wandkörper (gleicher Rahmen wie die Wand), Maße bleiben unverändert –
 * Öffnungen werden nie gedehnt oder geschert.
 */
export function tiltOpeningWithWall(wall: any, wallParts: Derived3D[], parts: Derived3D[], z0: number): Derived3D[] {
  const t = wall?.tilt3D;
  if (!t || !parts.length || !wallParts.length) return parts;
  const r = resolveGenericTilt(t, piecePoints(wallParts), z0);
  if (!r?.frame) return parts;
  let zTop = z0;
  for (const d of wallParts as any[]) zTop = Math.max(zTop, d.z1 ?? d.z ?? z0);
  const h = zTop - z0;
  if (tiltShapeError(t.mode, r.frame, h, t.plumb, t.anchor)) return parts;
  const pts = piecePoints(parts);
  if (!pts.length) return parts;
  let cx = 0, cy = 0, zb = Infinity;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  for (const d of parts as any[]) zb = Math.min(zb, d.z0 ?? d.z ?? z0);
  if (!Number.isFinite(zb)) zb = z0;
  const T = (x: number, y: number, z: number) => genericVertex(x, y, z, r.frame!, t, h);
  const e = 0.05, o = T(cx, cy, zb);
  const col = (p: Vec3) => [(p.x - o.x) / e, (p.y - o.y) / e, (p.z - o.z) / e];
  const nrm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(c => c / l); };
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a: number[], b: number[], k: number) => a.map((c, i) => c - b[i] * k);
  // Orthonormaler Rahmen (Gram-Schmidt): Hochrichtung der Wand zuerst, dann Wandrichtungen.
  const uz = nrm(col(T(cx, cy, zb + e)));
  let ux = col(T(cx + e, cy, zb)); ux = nrm(sub(ux, uz, dot(ux, uz)));
  const uy = [uz[1] * ux[2] - uz[2] * ux[1], uz[2] * ux[0] - uz[0] * ux[2], uz[0] * ux[1] - uz[1] * ux[0]];
  const m = new Matrix4().set(
    ux[0], uy[0], uz[0], o.x - (ux[0] * cx + uy[0] * cy + uz[0] * zb),
    ux[1], uy[1], uz[1], o.y - (ux[1] * cx + uy[1] * cy + uz[1] * zb),
    ux[2], uy[2], uz[2], o.z - (ux[2] * cx + uy[2] * cy + uz[2] * zb),
    0, 0, 0, 1,
  );
  return parts.map(d => posePiece(d, m));
}

export function applyGenericTilt(o: any, items: Derived3D[], z0: number): Derived3D[] {
  const t = o?.tilt3D;
  if (!t || !items.length) return items;
  const r = resolveGenericTilt(t, piecePoints(items), z0);
  if (!r) return items;
  if (!r.frame) return items.map(d => ({ ...d, note: r.error } as any));
  let zTop = z0;
  for (const d of items as any[]) zTop = Math.max(zTop, d.z1 ?? d.z ?? z0);
  const h = zTop - z0;
  const bad = tiltShapeError(t.mode, r.frame, h, t.plumb, t.anchor);
  if (bad) return items.map(d => ({ ...d, note: bad } as any));
  const f = r.frame;
  const out: Derived3D[] = [];
  for (const d of items as any[]) {
    const m = pieceMesh(d);
    if (!m) continue;
    const p = m.positions, q = new Array(p.length);
    for (let i = 0; i < p.length; i += 3) { const v = genericVertex(p[i], p[i + 1], p[i + 2], f, t, h); q[i] = v.x; q[i + 1] = v.y; q[i + 2] = v.z; }
    const texture = d.texture ? { ...d.texture, corners: d.texture.corners ?? d.outline } : undefined;
    const uvs = d.uvs ?? (texture && d.type === "plane" ? m.positions.flatMap((_: number, i: number) => {
      if (i % 3 !== 0) return [];
      const corners = texture.corners;
      if (!corners || corners.length !== 4) return [0,0];
      const [a,b,,e] = corners, ux=b.x-a.x, uy=b.y-a.y, vx=e.x-a.x, vy=e.y-a.y, det=ux*vy-uy*vx;
      const x=m.positions[i]-a.x, y=m.positions[i+1]-a.y;
      return Math.abs(det)>1e-12 ? [(x*vy-y*vx)/det, 1-(ux*y-uy*x)/det] : [0,0];
    }) : undefined);
    out.push({ ...d, type: "mesh", mesh: { positions: q, indices: m.indices }, closed: d.type === "prism" || (d.type === "mesh" && d.closed), texture, uvs } as any);
  }
  return out;
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
  for (const k of ["documents", "hatches", "walls", "doors", "stairs", "segments", "freeStrokes", "dimensions", "textBoxes", "tables", "libraryInstances", "infoBoxes"]) {
    for (const o of scene[k] || []) if (o?.labelId) labelIds.add(o.labelId);
  }
  for (const l of labelIds) {
    const rank = opts.labelFrontRank ? opts.labelFrontRank(l) : 0;
    orderedLabelItems(scene, l).forEach((it, i) => orderOf.set(it.obj, rank * 1e6 + i));
  }
  const push = (o: any, items: Derived3D[], preTilted = false) => {
    const ord = orderOf.get(o) ?? 0;
    const tilted = !preTilted && o?.tilt3D && !(scene.hatches || []).includes(o) ? applyGenericTilt(o, items, base + objectElevationM(o)) : items;
    const list = applySpatialPose(tilted, o.pose3D, base);
    for (const d of list) { d.order = ord; d.material = d.part === "frame" ? o.frameMaterial3D ?? o.material3D : d.part === "glass" || d.part === "leaf" ? o.panelMaterial3D ?? o.material3D : o.material3D; out.push(d); }
  };
  const doors = (scene.doors || []).filter(vis);
  // Geneigte Wände: erst ohne Öffnungen neigen, dann die (starr mitgeführten) Öffnungen ausschneiden –
  // so verzieht sich die Aussparung bei „Kante neigen“/„Kanten bündig“ nie mit der Wand.
  const tiltedWallIds = new Set((scene.walls || []).filter((w: any) => w?.tilt3D).map((w: any) => w.id));
  const walls = deriveWalls(scene, doors.filter((d: any) => !tiltedWallIds.has(d.wallId)), sheetId, base, vis);
  const openingParts = new Map<any, Derived3D[]>();
  for (const d of doors) {
    const wall = (scene.walls || []).find((w: any) => w.id === d.wallId);
    if (!wall || !vis(wall)) continue;
    const parts = deriveOpening(d, wall, sheetId, base);
    openingParts.set(d, wall.tilt3D ? tiltOpeningWithWall(wall, walls.get(wall) || [], parts, base + objectElevationM(wall)) : parts);
  }
  for (const [w, parts] of walls) {
    if (!w.tilt3D) { push(w, parts); continue; }
    const z0w = base + objectElevationM(w);
    let tilted = applyGenericTilt(w, parts, z0w);
    const own = doors.filter((d: any) => d.wallId === w.id);
    const cutters = own.length ? openingCutters(w, own, sheetId, base, walls.get(w) || []) : [];
    if (cutters.length && !tilted.some((d: any) => d.note)) {
      tilted = tilted.flatMap((d: any) => {
        let m = meshOf(d);
        if (!m) return [d];
        for (const c of cutters) { if (!m) break; try { m = csgMesh(m, c, "subtract"); } catch { /* Ausschnitt fehlgeschlagen – Wand bleibt */ } }
        return m ? [{ ...d, type: "mesh", mesh: m, closed: true } as any] : [];
      });
    }
    push(w, tilted, true);
  }
  for (const d of doors) {
    const parts = openingParts.get(d);
    const wall = (scene.walls || []).find((w: any) => w.id === d.wallId);
    if (parts && wall) push(d, applySpatialPose(parts, wall.pose3D, base));
  }
  for (const b of scene.infoBoxes || []) if (vis(b)) push(b, deriveInfoBox(b, sheetId, base));
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
    const actual = opts.libraryGeometry?.(li, sheet);
    if (actual?.length) { push(li, actual); continue; }
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
