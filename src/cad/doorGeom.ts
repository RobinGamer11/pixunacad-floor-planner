import { Vec2, v } from "./geometry";
import type { Wall, Door } from "./Scene";
import { perpLeftScreen } from "./wallGeom";

/** Liefert die kumulierten Längen der Wand-Bezugslinie (corners) und Gesamtlänge. */
export function wallReferenceLengths(wall: Wall): { lens: number[]; total: number } {
  const lens: number[] = [0];
  let total = 0;
  for (let i = 1; i < wall.corners.length; i++) {
    const a = wall.corners[i - 1], b = wall.corners[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(total);
  }
  return { lens, total };
}

/** Punkt entlang der Bezugslinie bei Bogenlänge s (m) + Tangenten-/Normalen-Vektor. */
export function pointOnWallAt(wall: Wall, s: number): { p: Vec2; t: Vec2; n: Vec2; segIndex: number } | null {
  if (wall.corners.length < 2) return null;
  const { lens, total } = wallReferenceLengths(wall);
  const sc = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < lens.length && lens[i] < sc) i++;
  const idx = Math.min(i, lens.length - 1);
  const a = wall.corners[idx - 1], b = wall.corners[idx];
  const segLen = lens[idx] - lens[idx - 1] || 1e-9;
  const t = (sc - lens[idx - 1]) / segLen;
  const p = v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const tan = v(dx / L, dy / L);
  const n = perpLeftScreen(tan);
  return { p, t: tan, n, segIndex: idx - 1 };
}

/** Projektion eines Welt-Punkts auf die Wand-Bezugslinie → Bogenlänge s. */
export function projectPointToWall(wall: Wall, p: Vec2): { s: number; dist: number } | null {
  if (wall.corners.length < 2) return null;
  const { lens } = wallReferenceLengths(wall);
  let bestS = 0, bestD = Infinity;
  for (let i = 0; i < wall.corners.length - 1; i++) {
    const a = wall.corners[i], b = wall.corners[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-9;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + dx * t, qy = a.y + dy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < bestD) { bestD = d; bestS = lens[i] + t * Math.sqrt(L2); }
  }
  return { s: bestS, dist: bestD };
}

/**
 * Geometrie einer Tür (in Welt-Koordinaten).
 * - center: Mittelpunkt der Tür auf Bezugslinie
 * - tan/normal: Wand-Tangente / Normale
 * - leftEnd/rightEnd: Türöffnungs-Endpunkte entlang Bezugslinie
 * - hingePoint: Türangel (Endpunkt je nach hand)
 * - leafEnd: freies Türblatt-Ende (rechtwinklig)
 * - openSign: Vorzeichen für Öffnungsseite (innen/außen)
 */
export function doorGeometry(wall: Wall, door: Door) {
  const at = pointOnWallAt(wall, door.posM);
  if (!at) return null;
  const half = door.widthM / 2;
  const tan = at.t;
  const n = at.n;
  const leftEnd = v(at.p.x - tan.x * half, at.p.y - tan.y * half);
  const rightEnd = v(at.p.x + tan.x * half, at.p.y + tan.y * half);
  // "left" hand = Angel am linken Öffnungsende, "right" = rechts
  const hinge = door.hand === "left" ? leftEnd : rightEnd;
  const openSign = door.side === "inner" ? +1 : -1; // n zeigt nach Screen-links (perpLeft)
  // Türblatt-Ende: 90° gedreht vom Öffnungsverlauf
  const dirAlong = door.hand === "left" ? +1 : -1; // Richtung Türblatt-Ende relativ zu tan
  // Ende des geöffneten Türblatts ≈ rechtwinklig zur Wand mit Länge = widthM
  const leafEnd = v(hinge.x + n.x * door.widthM * openSign, hinge.y + n.y * door.widthM * openSign);
  return {
    center: at.p, tan, n, leftEnd, rightEnd, hinge, leafEnd,
    openSign, dirAlong, thicknessM: wall.thicknessM,
  };
}
