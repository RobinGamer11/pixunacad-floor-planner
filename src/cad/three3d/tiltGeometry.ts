/**
 * Reine Neigungs- und Flächenmathematik (ohne three.js, auch im CAD-Panel nutzbar).
 */
import type { Vec2 } from "../geometry";
export interface Vec3 { x: number; y: number; z: number }

export function ringArea(r: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

/** Fläche inkl. Aussparungen (m²). */
export function netArea(outer: Vec2[], holes: Vec2[][]): number {
  return Math.max(0, Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0));
}

// ---------------------------------------------------------------- Neigung

/** Gespeicherte Neigung einer Schraffur (räumlich, 2D-Punkte bleiben unverändert). */
export interface Tilt3D {
  /** Index der Bezugskante (Punkt i → i+1 der Außenkontur). */
  edgeIndex: number;
  /** Endpunkte der Bezugskante zum Zeitpunkt der Wahl. */
  a: Vec2; b: Vec2;
  /** Punktanzahl der Außenkontur zum Zeitpunkt der Wahl. */
  count: number;
  angleDeg: number;
  /** "rotate" (Standard, fehlt bei Altprojekten) = Körper starr neigen; "lift" = ausgewählte Oberkante anheben. */
  mode?: "rotate" | "lift";
  /** Seitenkanten bleiben lotrecht (nur bei "rotate" wirksam; "lift" ist immer lotrecht). */
  plumb?: boolean;
  /** Nur bei "plumb": welche Kante der gewählten Seite fest bleibt ("top" Standard, "bottom" = Unterkante). */
  anchor?: "top" | "bottom";
}

export interface TiltFrame {
  /** Punkt auf der Drehachse. */
  axis: Vec2;
  /** Richtung der Achse (= Richtung der Bezugskante). */
  dir: Vec2;
  /** Einheitsvektor von der Achse zur Bezugskante. */
  n: Vec2;
  /** Abstand Achse ↔ Bezugskante (m). */
  D: number;
  angleRad: number;
  /** Bezugshöhe der ungekippten Ausgangsgeometrie. */
  z0: number;
  edgeIndex: number;
}

const near = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

/** Gerade Kanten der Außenkontur, die als Bezugskante taugen. */
export function straightEdgeIndices(hatch: any): number[] {
  const pts: Vec2[] = hatch?.points || [];
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const b = pts[(i + 1) % pts.length];
    if (Array.isArray(hatch.bulges) && Math.abs(Number(hatch.bulges[i]) || 0) > 1e-9) continue;
    if (Math.hypot(b.x - pts[i].x, b.y - pts[i].y) > 1e-6) out.push(i);
  }
  return out;
}

/** Drehachse aus einer Kante bestimmen (ohne gespeicherte Neigung). */
export function frameForEdge(hatch: any, edgeIndex: number, angleDeg: number, z0: number): { frame?: TiltFrame; error?: string } {
  const pts: Vec2[] = hatch?.points || [];
  if (pts.length < 3 || edgeIndex < 0 || edgeIndex >= pts.length) return { error: "Bezugskante nicht vorhanden." };
  if (Array.isArray(hatch.bulges) && Math.abs(Number(hatch.bulges[edgeIndex]) || 0) > 1e-9) return { error: "Die Bezugskante ist gebogen – bitte eine gerade Kante wählen." };
  const a = pts[edgeIndex], b = pts[(edgeIndex + 1) % pts.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return { error: "Die Bezugskante hat keine Länge." };
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const nl = { x: -dir.y, y: dir.x };
  let pos = 0, neg = 0;
  for (const p of pts) { const s = (p.x - a.x) * nl.x + (p.y - a.y) * nl.y; pos = Math.max(pos, s); neg = Math.max(neg, -s); }
  if (pos > 1e-4 && neg > 1e-4) return { error: "Die Kante liegt nicht am Rand der Fläche – die Drehachse ist nicht eindeutig." };
  const m = pos >= neg ? nl : { x: -nl.x, y: -nl.y };
  const D = Math.max(pos, neg);
  if (D < 1e-4) return { error: "Die Fläche hat keine Ausdehnung quer zur Kante." };
  return { frame: { axis: { x: a.x + m.x * D, y: a.y + m.y * D }, dir, n: { x: -m.x, y: -m.y }, D, angleRad: (angleDeg * Math.PI) / 180, z0, edgeIndex } };
}

/**
 * Gespeicherte Bezugskante auf die aktuelle Kontur abbilden:
 * 1. gleiche Endpunkte → diese Kante,
 * 2. gleiche Punktanzahl → gleicher Index (Kontur wurde verschoben/verändert),
 * sonst Meldung – nie stillschweigend eine andere Kante.
 */
export function resolveTilt(hatch: any, z0: number): { frame?: TiltFrame; error?: string } | null {
  const t: Tilt3D | undefined = hatch?.tilt3D;
  if (!t || !Number.isFinite(t.angleDeg) || Math.abs(t.angleDeg) < 1e-9) return null;
  const pts: Vec2[] = hatch.points || [];
  let idx = -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if ((near(p, t.a) && near(q, t.b)) || (near(p, t.b) && near(q, t.a))) { idx = i; break; }
  }
  if (idx < 0 && pts.length === t.count && t.edgeIndex >= 0 && t.edgeIndex < pts.length) idx = t.edgeIndex;
  if (idx < 0) return { error: "Die Bezugskante der Neigung ist nicht mehr eindeutig – bitte Kante neu wählen oder Neigung zurücksetzen." };
  return frameForEdge(hatch, idx, t.angleDeg, z0);
}

export function tiltPoint(x: number, y: number, z: number, f: TiltFrame): Vec3 {
  const dx = x - f.axis.x, dy = y - f.axis.y;
  const u = dx * f.n.x + dy * f.n.y, t = dx * f.dir.x + dy * f.dir.y, w = z - f.z0;
  const c = Math.cos(f.angleRad), s = Math.sin(f.angleRad);
  const u2 = u * c - w * s, w2 = u * s + w * c;
  return { x: f.axis.x + f.dir.x * t + f.n.x * u2, y: f.axis.y + f.dir.y * t + f.n.y * u2, z: f.z0 + w2 };
}


/** Abstand eines Punkts von der festen Achse in Richtung Bezugskante (0 … D). */
export const axisDistance = (p: Vec2, f: TiltFrame) => (p.x - f.axis.x) * f.n.x + (p.y - f.axis.y) * f.n.y;

export type TiltMode = "rotate" | "lift";
/** Wirksame Form einer Neigung: "rigid" = starr drehen, sonst Höhenfunktionen über unverändertem Grundriss. */
/**
 * Wirksame Form einer Neigung: "rigid" = starr drehen, sonst Höhenfunktionen.
 * "plumb" (Kanten bündig): die gewählte Kante (Ober- oder Unterkante der Bezugsseite)
 * bleibt exakt dort, wo die starre Drehung sie hinlegt; die Seitenflächen werden lotrecht
 * (die Gegenkante wird je nach Lage nach oben oder unten geführt). Der Körper wird dabei
 * nie länger: der Grundriss wird quer zur Achse auf die gedrehte Ausdehnung gestaucht (`map`).
 */
export function tiltShape(mode: TiltMode | undefined, plumb: boolean | undefined, f: TiltFrame, z: number, h: number, anchor?: "top" | "bottom"):
  { kind: "rigid" } | { kind: "field"; zb: (p: Vec2) => number; zt: (p: Vec2) => number; map?: (p: Vec2) => Vec2 } {
  const t = Math.tan(f.angleRad);
  if (mode === "lift") return { kind: "field", zb: () => z, zt: p => z + h + axisDistance(p, f) * t };
  if (plumb) {
    const c = Math.cos(f.angleRad), k = plumbScale(f, h, anchor);
    const map = (p: Vec2): Vec2 => { const u = axisDistance(p, f); const d = (k - 1) * u; return { x: p.x + f.n.x * d, y: p.y + f.n.y * d }; };
    return { kind: "field", zb: p => z + axisDistance(p, f) * t, zt: p => z + h / c + axisDistance(p, f) * t, map };
  }
  return { kind: "rigid" };
}

/** Stauchung quer zur Achse bei "Kanten bündig" (1 = unverändert). */
export function plumbScale(f: TiltFrame, h: number, anchor?: "top" | "bottom"): number {
  const c = Math.cos(f.angleRad), s = Math.sin(f.angleRad);
  return anchor === "bottom" || h <= 1e-9 ? c : (f.D * c - h * s) / f.D;
}

/** Prüft, ob die Verformung gültig ist (Oberseite darf nicht unter die Unterseite sinken). */
export function tiltShapeError(mode: TiltMode | undefined, f: TiltFrame, h: number, plumb?: boolean, anchor?: "top" | "bottom"): string | undefined {
  if (mode === "lift" && h > 1e-9 && h + f.D * Math.tan(f.angleRad) <= 1e-6)
    return "Die Kante würde unter die Unterseite sinken – letzte gültige Form bleibt erhalten.";
  if (mode !== "lift" && plumb && plumbScale(f, h, anchor) <= 0.02)
    return "Bei dieser Neigung passt der Körper nicht bündig – letzte gültige Form bleibt erhalten.";
  return undefined;
}

/** Tatsächliche Fläche der oberen Oberfläche (Aussparungen abgezogen); starre Drehung ändert sie nicht. */
export function topSurfaceArea(outer: Vec2[], holes: Vec2[][], mode: TiltMode | undefined, plumb: boolean | undefined, angleDeg: number, scale = 1): number {
  const a = netArea(outer, holes);
  if (!angleDeg || (mode !== "lift" && !plumb)) return a;
  return (a * (mode === "lift" ? 1 : scale)) / Math.cos((angleDeg * Math.PI) / 180);
}
