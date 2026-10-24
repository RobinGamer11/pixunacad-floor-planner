/**
 * „Tatsächliche Fläche“ für beliebige Objekte: 2D-Geometrie quer zur Neigungsachse um k
 * stauchen/strecken (Achse bleibt fest). Mutiert das Objekt – nur innerhalb von runAction.
 */
import type { Vec2 } from "../geometry";
import { axisDistance, type TiltFrame } from "./tiltGeometry";

const isPt = (p: any): p is Vec2 => p && Number.isFinite(p.x) && Number.isFinite(p.y);

export function projectObject2D(o: any, f: TiltFrame, k: number): void {
  if (!o || !Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-12) return;
  const mp = (p: Vec2): Vec2 => { const d = (k - 1) * axisDistance(p, f); return { x: p.x + f.n.x * d, y: p.y + f.n.y * d }; };
  const setPt = (p: any) => { if (isPt(p)) { const q = mp(p); p.x = q.x; p.y = q.y; } };
  const ring = (r: any) => Array.isArray(r) ? r.forEach(setPt) : undefined;
  /** Länge eines lokalen Einheitsvektors nach der Abbildung. */
  const lenAfter = (ux: number, uy: number) => { const d = ux * f.n.x + uy * f.n.y; return Math.sqrt(Math.max(1e-9, 1 + (k * k - 1) * d * d)); };
  const rot = Number(o.rotationRad) || 0, c = Math.cos(rot), s = Math.sin(rot);
  const sx = lenAfter(c, s), sy = lenAfter(-s, c);

  if (Array.isArray(o.points)) { ring(o.points); if (Array.isArray(o.holes)) o.holes.forEach(ring); }
  if (Array.isArray(o.corners)) ring(o.corners);
  for (const key of ["a", "b", "p1", "p2", "start", "end"]) if (isPt(o[key])) setPt(o[key]);
  // Rechteckobjekte: Mittelpunkt abbilden, Breite/Höhe entlang ihrer eigenen Achsen.
  if (isPt(o.center) && Number.isFinite(o.widthM) && Number.isFinite(o.heightM)) {
    setPt(o.center); o.widthM *= sx; o.heightM *= sy;
  } else if (isPt(o.position) && Number.isFinite(o.widthM) && Number.isFinite(o.heightM)) {
    // Dokument: position = linke obere Ecke (ungedreht), Mittelpunkt bleibt die Bezugsgröße.
    const cx = o.position.x + o.widthM / 2, cy = o.position.y + o.heightM / 2;
    const q = mp({ x: cx, y: cy });
    o.widthM *= sx; o.heightM *= sy;
    o.position.x = q.x - o.widthM / 2; o.position.y = q.y - o.heightM / 2;
  } else if (isPt(o.position) && o.definitionId) {
    setPt(o.position);
    o.scaleX = (Number.isFinite(o.scaleX) ? o.scaleX : 1) * sx;
    o.scaleY = (Number.isFinite(o.scaleY) ? o.scaleY : 1) * sy;
  }
}
