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

/** Eigenständiger Door-Renderer (im Renderer.ts + DoorTool-Preview verwendet). */
export function drawDoor(
  ctx: CanvasRenderingContext2D,
  cam: any,
  wall: Wall,
  door: Door,
  alpha = 1,
) {
  const g = doorGeometry(wall, door);
  if (!g) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = door.color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";

  // Weiße "Öffnungsfüllung" — überdeckt Wandfläche zwischen den Laibungen
  const half = wall.thicknessM / 2;
  const corners = [
    v(g.leftEnd.x - g.n.x * half, g.leftEnd.y - g.n.y * half),
    v(g.leftEnd.x + g.n.x * half, g.leftEnd.y + g.n.y * half),
    v(g.rightEnd.x + g.n.x * half, g.rightEnd.y + g.n.y * half),
    v(g.rightEnd.x - g.n.x * half, g.rightEnd.y - g.n.y * half),
  ];
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  const s0 = cam.worldToScreen(corners[0].x, corners[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < corners.length; i++) {
    const s = cam.worldToScreen(corners[i].x, corners[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Laibung (kurze Querstriche quer zur Wand) — markiert Öffnungs-Enden
  for (const end of [g.leftEnd, g.rightEnd]) {
    const a = cam.worldToScreen(end.x - g.n.x * half, end.y - g.n.y * half);
    const b = cam.worldToScreen(end.x + g.n.x * half, end.y + g.n.y * half);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Türblatt
  const sh = cam.worldToScreen(g.hinge.x, g.hinge.y);
  const sl = cam.worldToScreen(g.leafEnd.x, g.leafEnd.y);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sh.x, sh.y);
  ctx.lineTo(sl.x, sl.y);
  ctx.stroke();

  // Öffnungs-Bogen (Viertelkreis)
  const opp = door.hand === "left" ? g.rightEnd : g.leftEnd;
  const sCenter = cam.worldToScreen(g.hinge.x, g.hinge.y);
  const radiusPx = Math.hypot(sl.x - sCenter.x, sl.y - sCenter.y);
  const startAng = Math.atan2(sl.y - sCenter.y, sl.x - sCenter.x);
  const sOpp = cam.worldToScreen(opp.x, opp.y);
  const endAng = Math.atan2(sOpp.y - sCenter.y, sOpp.x - sCenter.x);
  ctx.lineWidth = 1.2;
  let delta = endAng - startAng;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  ctx.beginPath();
  ctx.arc(sCenter.x, sCenter.y, radiusPx, startAng, startAng + delta, delta < 0);
  ctx.stroke();

  ctx.restore();
}
