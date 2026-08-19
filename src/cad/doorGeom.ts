import { Vec2, v } from "./geometry";
import type { Wall, Door } from "./Scene";
import { perpLeftScreen, wallRefCorners } from "./wallGeom";

/**
 * Bezugs-Polylinie einer Wand inklusive Kanten-Wölbungen.
 * Türen/Fenster laufen dadurch exakt auf der gewölbten Wandachse.
 */
function refCorners(wall: Wall): Vec2[] {
  return wallRefCorners(wall as any);
}

/** Liefert die kumulierten Längen der Wand-Bezugslinie (corners) und Gesamtlänge. */
export function wallReferenceLengths(wall: Wall): { lens: number[]; total: number } {
  const pts = refCorners(wall);
  const lens: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(total);
  }
  return { lens, total };
}

export function pointOnWallAt(wall: Wall, s: number): { p: Vec2; t: Vec2; n: Vec2; segIndex: number } | null {
  const pts = refCorners(wall);
  if (pts.length < 2) return null;
  const { lens, total } = wallReferenceLengths(wall);
  const sc = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < lens.length && lens[i] < sc) i++;
  const idx = Math.min(i, lens.length - 1);
  const a = pts[idx - 1], b = pts[idx];
  const segLen = lens[idx] - lens[idx - 1] || 1e-9;
  const t = (sc - lens[idx - 1]) / segLen;
  const p = v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const tan = v(dx / L, dy / L);
  const n = perpLeftScreen(tan);
  return { p, t: tan, n, segIndex: idx - 1 };
}

export function projectPointToWall(wall: Wall, p: Vec2): { s: number; dist: number } | null {
  const pts = refCorners(wall);
  if (pts.length < 2) return null;
  const { lens } = wallReferenceLengths(wall);
  let bestS = 0, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
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

/** Versatz Bezugslinie → Wand-Mittellinie. */
function wallHelpOffset(wall: Wall): number {
  const t = wall.thicknessM;
  return wall.referenceSide === "inner" ? +t / 2
    : wall.referenceSide === "center" ? 0
    : -t / 2;
}

/**
 * Punkte der Wand-Mittellinie zwischen den Bogenlängen `sFrom` und `sTo`,
 * zusätzlich quer um `acrossOff` versetzt. Folgt exakt der Wölbung der Wand.
 */
export function wallAxisPolyline(
  wall: Wall,
  sFrom: number,
  sTo: number,
  acrossOff = 0,
  segs = 24,
): Vec2[] {
  const help = wallHelpOffset(wall) + acrossOff;
  const out: Vec2[] = [];
  const n = Math.max(1, segs);
  for (let i = 0; i <= n; i++) {
    const s = sFrom + ((sTo - sFrom) * i) / n;
    const at = pointOnWallAt(wall, s);
    if (!at) continue;
    out.push(v(at.p.x + at.n.x * help, at.p.y + at.n.y * help));
  }
  return out;
}

/** Geschlossenes Band entlang der (ggf. gewölbten) Wandachse. */
export function wallBandPolygon(
  wall: Wall,
  sFrom: number,
  sTo: number,
  halfAcross: number,
  acrossShift = 0,
  segs = 24,
): Vec2[] {
  const a = wallAxisPolyline(wall, sFrom, sTo, acrossShift + halfAcross, segs);
  const b = wallAxisPolyline(wall, sFrom, sTo, acrossShift - halfAcross, segs);
  return [...a, ...b.reverse()];
}

/** True, wenn die Wand im Bereich der Öffnung gewölbt ist. */
export function wallHasBulge(wall: Wall): boolean {
  const b = (wall as any).bulges;
  return Array.isArray(b) && b.some((x: number) => !!x);
}

/**
 * Door geometry. Convention: +n in screen-coords = "inner" side, -n = "outer".
 *  - widthM = full opening width (with jambs)
 *  - lichteM = widthM - 2*jambLenM (when jambEnabled) = swing/leaf length
 *  - Hinge sits on the chosen edge line (inner / center / outer) at the inner-jamb endpoint
 *    of the chosen hand (left/right).
 *  - Leaf swings into the chosen "side" half-space (+n if side=inner, -n if outer).
 */
export function doorGeometry(wall: Wall, door: Door) {
  const at = pointOnWallAt(wall, door.posM);
  if (!at) return null;
  const tan = at.t;
  const n = at.n;
  const t = wall.thicknessM;

  // Reference line → true wall centerline.
  const helpOff = wall.referenceSide === "inner" ? +t / 2
    : wall.referenceSide === "center" ? 0
    : -t / 2;
  const center = v(at.p.x + n.x * helpOff, at.p.y + n.y * helpOff);

  // Opening endpoints on wall centerline.
  const halfW = door.widthM / 2;
  const leftEnd  = v(center.x - tan.x * halfW, center.y - tan.y * halfW);
  const rightEnd = v(center.x + tan.x * halfW, center.y + tan.y * halfW);

  // Wall edges (perpendicular).
  const halfT = t / 2;
  const innerOff = v(n.x * halfT, n.y * halfT);   // +n = inner
  const outerOff = v(-n.x * halfT, -n.y * halfT); // -n = outer
  const leftInner  = v(leftEnd.x  + innerOff.x, leftEnd.y  + innerOff.y);
  const leftOuter  = v(leftEnd.x  + outerOff.x, leftEnd.y  + outerOff.y);
  const rightInner = v(rightEnd.x + innerOff.x, rightEnd.y + innerOff.y);
  const rightOuter = v(rightEnd.x + outerOff.x, rightEnd.y + outerOff.y);

  // Edge offset for hinge placement (start edge).
  const edgeOff = door.edge === "inner" ? +halfT
    : door.edge === "outer" ? -halfT
    : 0;
  const edgeSignForLine = door.edge === "inner" ? +1 : door.edge === "outer" ? -1 : 0;

  // Jamb length consumed on each side (only if enabled).
  const jambLen = door.jambEnabled ? Math.max(0, Math.min(door.jambLenM, door.widthM / 2 - 0.005)) : 0;
  const lichteM = Math.max(0.01, door.widthM - 2 * jambLen);

  // Hinge & closed-end on the chosen edge line, offset inward by jambLen from outer opening ends.
  const handSign = door.hand === "left" ? -1 : +1; // along tan
  const hingeBaseX = center.x + n.x * edgeOff;
  const hingeBaseY = center.y + n.y * edgeOff;
  // Hinge is positioned at handSign * (halfW - jambLen) along tan from center.
  const inset = halfW - jambLen;
  // Auf gewölbten Wänden liegen Band- und Schließseite auf der Bogenachse.
  const onAxis = (s: number, across: number): Vec2 => {
    const at2 = pointOnWallAt(wall, s);
    if (!at2) return v(hingeBaseX, hingeBaseY);
    return v(at2.p.x + at2.n.x * across, at2.p.y + at2.n.y * across);
  };
  const acrossHinge = helpOff + edgeOff;
  const hinge = wallHasBulge(wall)
    ? onAxis(door.posM + handSign * inset, acrossHinge)
    : v(hingeBaseX + tan.x * handSign * inset, hingeBaseY + tan.y * handSign * inset);
  const closedEnd = wallHasBulge(wall)
    ? onAxis(door.posM - handSign * inset, acrossHinge)
    : v(hingeBaseX - tan.x * handSign * inset, hingeBaseY - tan.y * handSign * inset);

  // Swing direction: leaf goes toward the chosen "side" half-space (+n inner, -n outer).
  const openSign = door.side === "inner" ? +1 : -1;
  const leafEnd = v(
    hinge.x + n.x * lichteM * openSign,
    hinge.y + n.y * lichteM * openSign,
  );

  return {
    center, tan, n,
    leftEnd, rightEnd,
    leftInner, leftOuter, rightInner, rightOuter,
    hinge, closedEnd, leafEnd,
    openSign, edgeSignForLine, thicknessM: t, lichteM, jambLen,
  };
}

/** Door renderer. */
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

  // Bogenlängen-Bereich der Öffnung entlang der (ggf. gewölbten) Wandachse.
  const halfW = door.widthM / 2;
  const sL = door.posM - halfW;
  const sR = door.posM + halfW;
  const curved = wallHasBulge(wall);
  const segs = curved ? 24 : 1;

  const pathPoly = (pts: Vec2[]) => {
    if (!pts.length) return;
    ctx.beginPath();
    const s0 = cam.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < pts.length; i++) {
      const s = cam.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
  };
  const strokePolyline = (pts: Vec2[]) => {
    if (pts.length < 2) return;
    ctx.beginPath();
    const s0 = cam.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < pts.length; i++) {
      const s = cam.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  };

  // 1) White opening fill — cuts wall across full thickness.
  const halfFull = wall.thicknessM / 2 + 0.01;
  ctx.fillStyle = "#ffffff";
  pathPoly(wallBandPolygon(wall, sL, sR, halfFull, 0, segs));
  ctx.fill();

  // 2) Jambs (Laibungen) at both ends — optional, configurable thickness.
  if (door.jambEnabled && g.jambLen > 0) {
    // jambHalfT = halbe Laibungsdicke (quer zur Wand). 0 = volle Wandstärke.
    const jambHalfT = door.jambThickM > 0 ? Math.min(door.jambThickM / 2, halfFull) : halfFull;
    // Wenn benutzerdefinierte Dicke: Laibung an die Startkante anlegen,
    // sodass die Außenfläche bündig mit der Wandkante ist.
    const acrossShift = door.jambThickM > 0
      ? (door.edge === "inner" ? +halfFull - jambHalfT
        : door.edge === "outer" ? -halfFull + jambHalfT
        : 0)
      : 0;
    const drawJamb = (sFrom: number, sTo: number) => {
      pathPoly(wallBandPolygon(wall, sFrom, sTo, jambHalfT, acrossShift, curved ? 8 : 1));
      ctx.fillStyle = door.jambColor;
      ctx.fill();
      ctx.strokeStyle = "#3a3f46";
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    // Laibungen folgen der Wandachse (inkl. Wölbung).
    drawJamb(sL, sL + g.jambLen);
    drawJamb(sR - g.jambLen, sR);
  }

  // 3) Fenster-Variante: zwei parallele Linien quer durch die Öffnung statt Türblatt.
  //    Linien laufen nur zwischen den Laibungen (lichte Öffnung), nicht in die Laibung hinein.
  if (door.kind === "window") {
    const wallThick = wall.thicknessM;
    // Element-Dicke (Abstand der beiden Linien). 0 = auto = halbe Wandstärke.
    const thick = door.glassThickM > 0
      ? Math.min(door.glassThickM, wallThick * 0.98)
      : wallThick / 2;
    const off = thick / 2;
    // Quer-Verschiebung der Linien gemäß Startkante (analog zur Laibung).
    const halfFullW = wallThick / 2;
    const acrossShiftWin = door.edge === "inner" ? +halfFullW - off
      : door.edge === "outer" ? -halfFullW + off
      : 0;
    // Lichte Öffnung entlang der Wandachse (Laibungen abgezogen).
    const sWinL = sL + g.jambLen;
    const sWinR = sR - g.jambLen;
    // (a) optionale Füllung zwischen den Linien
    if (door.glassFillColor && door.glassFillColor !== "") {
      ctx.fillStyle = door.glassFillColor;
      pathPoly(wallBandPolygon(wall, sWinL, sWinR, off, acrossShiftWin, segs));
      ctx.fill();
    }
    // (b) die beiden Linien — folgen der Wölbung
    ctx.strokeStyle = door.glassColor;
    ctx.lineWidth = 1.5;
    for (const sign of [-1, +1]) {
      strokePolyline(wallAxisPolyline(wall, sWinL, sWinR, acrossShiftWin + off * sign, segs));
    }
  }

  // 4) Türblatt + Schwung (nur wenn sashEnabled).
  if (door.sashEnabled) {
    ctx.strokeStyle = door.color;
    ctx.lineCap = "round";
    const sh = cam.worldToScreen(g.hinge.x, g.hinge.y);
    const sl = cam.worldToScreen(g.leafEnd.x, g.leafEnd.y);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(sl.x, sl.y);
    ctx.stroke();

    // Schwung-Bogen (Viertelkreis): leafEnd → closedEnd, Zentrum = hinge.
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
  }

  ctx.restore();
}
