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
 *  - leftEnd/rightEnd: Öffnungs-Endpunkte auf der WAND-MITTELLINIE
 *  - leftInner/rightInner/leftOuter/rightOuter: Ecken der Öffnung an den beiden Wandkanten
 *  - hinge: Türangel-Eckpunkt (an einer der vier Ecken)
 *  - closedEnd: gegenüberliegender Eckpunkt auf gleicher Wandkante wie hinge (Bogen-Endpunkt)
 *  - leafEnd: Türblatt-Spitze (90° geöffnet, perpendicular vom hinge in Raum)
 */
export function doorGeometry(wall: Wall, door: Door) {
  const at = pointOnWallAt(wall, door.posM);
  if (!at) return null;
  const half = door.widthM / 2;
  const tan = at.t;
  const n = at.n;
  // Bezugslinie → echte Wandmitte (Offset analog computeWallLines.helpOff):
  const t = wall.thicknessM;
  const helpOff = wall.referenceSide === "inner" ? +t / 2
    : wall.referenceSide === "center" ? 0
    : -t / 2;
  const center = v(at.p.x + n.x * helpOff, at.p.y + n.y * helpOff);
  const leftEnd  = v(center.x - tan.x * half, center.y - tan.y * half);
  const rightEnd = v(center.x + tan.x * half, center.y + tan.y * half);

  // Wandkanten-Versatz: n zeigt vom Zentrum nach "links" in Screen-Koordinaten.
  // Wir nennen +n = "innen" und -n = "außen" (konsistent zur bisherigen openSign).
  const eInner = +1, eOuter = -1;
  const edgeSign = door.side === "inner" ? eInner : eOuter;
  const half_t = t / 2;
  const off = (e: number) => v(n.x * half_t * e, n.y * half_t * e);
  const oI = off(eInner), oO = off(eOuter);
  const leftInner  = v(leftEnd.x + oI.x, leftEnd.y + oI.y);
  const leftOuter  = v(leftEnd.x + oO.x, leftEnd.y + oO.y);
  const rightInner = v(rightEnd.x + oI.x, rightEnd.y + oI.y);
  const rightOuter = v(rightEnd.x + oO.x, rightEnd.y + oO.y);

  // Hinge-Eckpunkt:  hand → links/rechts entlang Wand;  side → welche Kante
  const hinge = door.hand === "left"
    ? (edgeSign === eInner ? leftInner  : leftOuter)
    : (edgeSign === eInner ? rightInner : rightOuter);
  // "Geschlossen"-Endpunkt: gegenüberliegende Seite, gleiche Kante
  const closedEnd = door.hand === "left"
    ? (edgeSign === eInner ? rightInner : rightOuter)
    : (edgeSign === eInner ? leftInner  : leftOuter);
  // Türblatt schwingt in den GEGENÜBERLIEGENDEN Raum (weg von der Hinge-Kante)
  const openSign = -edgeSign;
  const leafEnd = v(hinge.x + n.x * door.widthM * openSign, hinge.y + n.y * door.widthM * openSign);

  return {
    center, tan, n,
    leftEnd, rightEnd,
    leftInner, leftOuter, rightInner, rightOuter,
    hinge, closedEnd, leafEnd,
    openSign, thicknessM: t,
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

  // 1) Weiße Öffnungsfüllung — schneidet die Wand komplett auf
  const half = wall.thicknessM / 2 + 0.01;
  const cornersOpen = [
    v(g.leftEnd.x - g.n.x * half,  g.leftEnd.y - g.n.y * half),
    v(g.leftEnd.x + g.n.x * half,  g.leftEnd.y + g.n.y * half),
    v(g.rightEnd.x + g.n.x * half, g.rightEnd.y + g.n.y * half),
    v(g.rightEnd.x - g.n.x * half, g.rightEnd.y - g.n.y * half),
  ];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  {
    const s0 = cam.worldToScreen(cornersOpen[0].x, cornersOpen[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < cornersOpen.length; i++) {
      const s = cam.worldToScreen(cornersOpen[i].x, cornersOpen[i].y);
      ctx.lineTo(s.x, s.y);
    }
  }
  ctx.closePath();
  ctx.fill();

  // 2) Laibungen (zwei kleine Blöcke) — voll über Wandstärke, kurze Länge entlang Wand
  const jambLenM = Math.min(0.06, Math.max(0.03, wall.thicknessM * 0.35));
  const drawJamb = (endpoint: Vec2, inward: number) => {
    // inward = +1 (richtung Türmitte) oder -1 (von Mitte weg); Block geht nach AUSSEN, also -inward
    const ax = endpoint.x - g.tan.x * jambLenM * inward;
    const ay = endpoint.y - g.tan.y * jambLenM * inward;
    const pts = [
      v(endpoint.x - g.n.x * half, endpoint.y - g.n.y * half),
      v(endpoint.x + g.n.x * half, endpoint.y + g.n.y * half),
      v(ax + g.n.x * half,         ay + g.n.y * half),
      v(ax - g.n.x * half,         ay - g.n.y * half),
    ];
    ctx.beginPath();
    const s0 = cam.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < pts.length; i++) {
      const s = cam.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fillStyle = "#9aa3ad";
    ctx.fill();
    ctx.strokeStyle = "#3a3f46";
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  // leftEnd: Block ragt nach links (von Türmitte weg) → inward=+1 (so dass -inward = -1 → tan*-1)
  drawJamb(g.leftEnd, +1);
  drawJamb(g.rightEnd, -1);

  // 3) Türblatt (vom hinge zum leafEnd)
  ctx.strokeStyle = door.color;
  ctx.lineCap = "round";
  const sh = cam.worldToScreen(g.hinge.x, g.hinge.y);
  const sl = cam.worldToScreen(g.leafEnd.x, g.leafEnd.y);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sh.x, sh.y);
  ctx.lineTo(sl.x, sl.y);
  ctx.stroke();

  // 4) Öffnungs-Bogen (Viertelkreis): von leafEnd nach closedEnd, Zentrum = hinge
  const sClosed = cam.worldToScreen(g.closedEnd.x, g.closedEnd.y);
  const radiusPx = Math.hypot(sl.x - sh.x, sl.y - sh.y);
  const startAng = Math.atan2(sl.y - sh.y, sl.x - sh.x);
  const endAng   = Math.atan2(sClosed.y - sh.y, sClosed.x - sh.x);
  let delta = endAng - startAng;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(sh.x, sh.y, radiusPx, startAng, startAng + delta, delta < 0);
  ctx.stroke();

  ctx.restore();
}
