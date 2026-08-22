/**
 * hybridFill.ts — gemeinsame Bereichserkennung aus Vektor- UND Rasterkanten.
 *
 * Das Füllwerkzeug soll für den Benutzer nicht zwischen Vektor und Pixel
 * unterscheiden: Ein Bereich gilt als geschlossen, wenn seine Begrenzung aus
 * einer beliebigen Mischung von Vektorlinien (Linien, Wände, Schraffurkanten,
 * Freihand) und Rasterstrichen (Pixelmodus / RasterLayers) besteht.
 *
 * Vorgehen
 * --------
 *  1) Analyseausschnitt in WELTKOORDINATEN bestimmen (Vektor-BBox ∪ Raster-BBox
 *     ∪ Umgebung des Klicks). Zoom-unabhängig.
 *  2) Eine gemeinsame Boundary-Maske über `buildRasterBoundaryMask` aufbauen:
 *     sichtbare Rasterebenen + maßhaltig gerasterte Vektorkanten.
 *  3) Flood-Fill vom Klickpixel im transparenten Bereich.
 *  4) Kontur des gefundenen Bereichs extrahieren (Crack-Following) und
 *     vereinfachen (Douglas-Peucker) → saubere Polygonkontur in Weltmetern.
 *
 * Reine Vektorbereiche laufen weiterhin über den präzisen DCEL-Pfad in
 * `hatchFill.ts` (Fast-Path) — dieser Modul greift nur, wenn tatsächlich
 * sichtbarer Rasterinhalt existiert.
 */
import { Vec2, v, polygonSignedArea } from "./geometry";
import type { Scene } from "./Scene";
import { collectBoundaryEdges } from "./hatchFill";
import { buildRasterBoundaryMask, type RasterScope } from "./rasterBoundary";
import type { RasterLayers } from "./RasterLayers";

/** Ziel-Pixelbudget der Analysemaske (zoom-unabhängig). */
const TARGET_PIXELS = 4_000_000;
/** Ober-/Untergrenze der Analyseauflösung in px pro Weltmeter. */
const MAX_PX_PER_M = 4000;
const MIN_PX_PER_M = 200;
/** Zusätzlicher Suchradius um den Klick, falls kaum Geometrie existiert. */
const CLICK_PAD_M = 2;
/** Randstreifen der Maske; erreicht der Flood-Fill ihn, gilt der Bereich als offen. */
const BORDER_PX = 1;
/** Closing-Radius in Analysepixeln — schließt nur Subpixel-/Anti-Aliasing-Lücken. */
const DILATE_PX = 2;
/** Obergrenze für Konturpunkte einer aus Raster gewonnenen Fläche. */
const MAX_CONTOUR_POINTS = 120;

/**
 * Morphologische Dilatation der Grenzpixel (Chebyshev-Radius `r`) über zwei
 * separierte 1D-Durchläufe. Ergebnis: 1 = Grenze, 0 = füllbar.
 */
function dilateBoundary(alpha: Uint8Array, threshold: number, wPx: number, hPx: number, r: number): Uint8Array {
  const src = new Uint8Array(wPx * hPx);
  for (let i = 0; i < src.length; i++) src[i] = alpha[i] >= threshold ? 1 : 0;
  if (r <= 0) return src;
  const tmp = new Uint8Array(wPx * hPx);
  for (let y = 0; y < hPx; y++) {
    const row = y * wPx;
    for (let x = 0; x < wPx; x++) {
      let on = 0;
      for (let dx = -r; dx <= r && !on; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= wPx) continue;
        if (src[row + nx]) on = 1;
      }
      tmp[row + x] = on;
    }
  }
  const out = new Uint8Array(wPx * hPx);
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= hPx) continue;
        if (tmp[ny * wPx + x]) on = 1;
      }
      out[y * wPx + x] = on;
    }
  }
  return out;
}

/** Chebyshev-Dilatation einer 0/1-Maske (separiert, radius `r`). */
function dilateMask(src: Uint8Array, wPx: number, hPx: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const tmp = new Uint8Array(wPx * hPx);
  for (let y = 0; y < hPx; y++) {
    const row = y * wPx;
    for (let x = 0; x < wPx; x++) {
      let on = 0;
      for (let dx = -r; dx <= r && !on; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= wPx) continue;
        if (src[row + nx]) on = 1;
      }
      tmp[row + x] = on;
    }
  }
  const out = new Uint8Array(wPx * hPx);
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= hPx) continue;
        if (tmp[ny * wPx + x]) on = 1;
      }
      out[y * wPx + x] = on;
    }
  }
  return out;
}

/** Chebyshev-Erosion = Komplement der Dilatation des Komplements. */
function erodeMask(src: Uint8Array, wPx: number, hPx: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const inv = new Uint8Array(wPx * hPx);
  for (let i = 0; i < inv.length; i++) inv[i] = src[i] ? 0 : 1;
  const dil = dilateMask(inv, wPx, hPx, r);
  const out = new Uint8Array(wPx * hPx);
  for (let i = 0; i < out.length; i++) out[i] = dil[i] ? 0 : 1;
  // Randpixel gelten als erodiert (außerhalb = leer).
  return out;
}

/**
 * Wählt die Zusammenhangskomponente, die den Klick enthält. Ist der Klickpixel
 * selbst weggeschnitten (z. B. Klick nahe an einer Kante), wird über die
 * ursprüngliche Region die nächstgelegene erodierte Zelle gesucht.
 */
function componentAt(mask: Uint8Array, region: Uint8Array, wPx: number, hPx: number, startIdx: number): Uint8Array | null {
  let seed = -1;
  if (mask[startIdx]) seed = startIdx;
  else {
    // BFS innerhalb der ursprünglichen Region bis zur nächsten erodierten Zelle.
    const seen = new Uint8Array(wPx * hPx);
    const q = new Int32Array(wPx * hPx);
    let head = 0, tail = 0;
    q[tail++] = startIdx; seen[startIdx] = 1;
    while (head < tail) {
      const idx = q[head++];
      if (mask[idx]) { seed = idx; break; }
      const x = idx % wPx, y = (idx - (idx % wPx)) / wPx;
      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= wPx || ny >= hPx) return;
        const ni = ny * wPx + nx;
        if (seen[ni] || !region[ni]) return;
        seen[ni] = 1; q[tail++] = ni;
      };
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
  }
  if (seed < 0) return null;

  const out = new Uint8Array(wPx * hPx);
  const stack = new Int32Array(wPx * hPx);
  let sp = 0;
  stack[sp++] = seed; out[seed] = 1;
  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % wPx, y = (idx - (idx % wPx)) / wPx;
    const push = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= wPx || ny >= hPx) return;
      const ni = ny * wPx + nx;
      if (out[ni] || !mask[ni]) return;
      out[ni] = 1; stack[sp++] = ni;
    };
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return out;
}

/** Gleitender Mittelwert über einen geschlossenen Polygonzug (Fensterradius `r`). */
function smoothClosed(points: Vec2[], r: number): Vec2[] {
  const n = points.length;
  if (n < 5 || r <= 0) return points;
  const out: Vec2[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let k = -r; k <= r; k++) {
      const p = points[(i + k + n) % n];
      sx += p.x; sy += p.y; c++;
    }
    out[i] = v(sx / c, sy / c);
  }
  return out;
}

export interface HybridFillOptions {
  scope?: RasterScope;
  activeLabelId?: string | null;
  /** Sichtbarkeitsfilter für Ebenen (Vektor wie Raster). */
  isVisible?: (labelId: string) => boolean;
}

interface Rect { x: number; y: number; w: number; h: number }

function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Douglas-Peucker-Vereinfachung. */
function simplify(points: Vec2[], eps: number): Vec2[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    if (i1 <= i0 + 1) continue;
    const a = points[i0], b = points[i1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bestD = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const p = points[i];
      const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Crack-Following: liefert die Außenkontur der gefüllten Pixelmenge als
 * Polygon in Pixel-Eckkoordinaten (Gitterpunkte).
 */
function traceContour(filled: Uint8Array, wPx: number, hPx: number, startIdx: number): { x: number; y: number }[] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= wPx || y >= hPx) ? 0 : filled[y * wPx + x];

  // Start: oberste, linkeste gefüllte Zelle der Region ermitteln.
  let sx = startIdx % wPx, sy = Math.floor(startIdx / wPx);
  for (let y = 0; y < hPx; y++) {
    let found = -1;
    for (let x = 0; x < wPx; x++) if (filled[y * wPx + x]) { found = x; break; }
    if (found >= 0) { sx = found; sy = y; break; }
  }

  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
  let cx = sx, cy = sy, d = 0;
  const startCx = cx, startCy = cy, startD = d;
  const pts: { x: number; y: number }[] = [];
  let guard = 0;
  const maxSteps = 8 * (wPx + hPx) * 4 + 1000;

  do {
    // Front-Left / Front-Right Zellen je Richtung.
    let fl: [number, number], fr: [number, number];
    if (d === 0) { fl = [cx, cy - 1]; fr = [cx, cy]; }
    else if (d === 1) { fl = [cx, cy]; fr = [cx - 1, cy]; }
    else if (d === 2) { fl = [cx - 1, cy]; fr = [cx - 1, cy - 1]; }
    else { fl = [cx - 1, cy - 1]; fr = [cx, cy - 1]; }

    let nd: number;
    if (at(fl[0], fl[1])) nd = (d + 3) % 4;      // links abbiegen
    else if (at(fr[0], fr[1])) nd = d;           // geradeaus
    else nd = (d + 1) % 4;                       // rechts abbiegen

    if (nd !== d) pts.push({ x: cx, y: cy });
    d = nd;
    cx += DIRS[d][0];
    cy += DIRS[d][1];
    if (++guard > maxSteps) break;
  } while (!(cx === startCx && cy === startCy && d === startD));

  return pts;
}

/**
 * Hybride Bereichserkennung. Gibt die Kontur in Weltkoordinaten zurück
 * oder null, wenn der Bereich nicht geschlossen ist bzw. keine Analyse
 * möglich war.
 */
export function findHybridEnclosingFace(
  scene: Scene,
  rasterLayers: RasterLayers | null | undefined,
  click: Vec2,
  options: HybridFillOptions = {},
): Vec2[] | null {
  const isVisible = options.isVisible;

  // --- 1) Analyseausschnitt bestimmen -------------------------------------
  const edges = collectBoundaryEdges(scene);
  let vecRect: Rect | null = null;
  if (edges.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of edges) {
      minX = Math.min(minX, e.a.x, e.b.x); maxX = Math.max(maxX, e.a.x, e.b.x);
      minY = Math.min(minY, e.a.y, e.b.y); maxY = Math.max(maxY, e.a.y, e.b.y);
    }
    vecRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const rasRect = rasterLayers?.contentBoundsWorld(
    isVisible ? (id) => isVisible(id) : undefined,
  ) ?? null;
  const clickRect: Rect = { x: click.x - CLICK_PAD_M, y: click.y - CLICK_PAD_M, w: CLICK_PAD_M * 2, h: CLICK_PAD_M * 2 };

  let rect = unionRect(unionRect(vecRect, rasRect), clickRect)!;
  // Kleiner Rand, damit außen liegende Bereiche als "offen" erkannt werden.
  const pad = Math.max(0.05, Math.min(rect.w, rect.h) * 0.02);
  rect = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  if (rect.w <= 0 || rect.h <= 0) return null;

  // --- 2) Zoom-unabhängige Analyseauflösung -------------------------------
  let pxPerM = Math.sqrt(TARGET_PIXELS / (rect.w * rect.h));
  pxPerM = Math.max(MIN_PX_PER_M, Math.min(MAX_PX_PER_M, pxPerM));

  // --- 3) Gemeinsame Boundary-Maske (Raster + Vektor) ---------------------
  const mask = buildRasterBoundaryMask(rasterLayers, rect.x, rect.y, rect.w, rect.h, {
    scope: options.scope ?? "all",
    activeLabelId: options.activeLabelId,
    isVisible,
    pxPerM,
    alphaThreshold: 16,
    drawExtra: (ctx, x, y, _w, _h, k) => {
      // Vektorkanten maßhaltig in dieselbe Maske. Dünne Linie (≈1,4 px) —
      // reicht als Begrenzung, verfälscht die Fläche aber kaum.
      ctx.save();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (const e of edges) {
        ctx.moveTo((e.a.x - x) * k, (e.a.y - y) * k);
        ctx.lineTo((e.b.x - x) * k, (e.b.y - y) * k);
      }
      ctx.stroke();
      ctx.restore();
    },
  });
  if (!mask) return null;

  const { wPx, hPx, alpha, threshold } = mask;

  // Grenzmaske mit sehr kleiner Dilatation (Closing um DILATE_PX Analysepixel).
  // Damit gelten optisch anschließende Pixel-/Vektorkanten trotz Subpixel- und
  // Anti-Aliasing-Lücken als durchgehende Grenze. Größere echte Lücken bleiben
  // offen, weil der Radius bewusst nur 1–2 Pixel beträgt.
  const bnd = dilateBoundary(alpha, threshold, wPx, hPx, DILATE_PX);

  const px = Math.floor((click.x - mask.x) * mask.pxPerM);
  const py = Math.floor((click.y - mask.y) * mask.pxPerM);
  if (px < 0 || py < 0 || px >= wPx || py >= hPx) return null;
  const startIdx = py * wPx + px;
  if (bnd[startIdx]) return null; // direkt auf einer Grenze geklickt

  // --- 4) Flood-Fill im transparenten Bereich -----------------------------
  const filled = new Uint8Array(wPx * hPx);
  const stack = new Int32Array(wPx * hPx);
  let sp = 0;
  stack[sp++] = startIdx;
  filled[startIdx] = 1;
  let escaped = false;
  let count = 0;

  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % wPx;
    const y = (idx - x) / wPx;
    count++;
    if (x <= BORDER_PX || y <= BORDER_PX || x >= wPx - 1 - BORDER_PX || y >= hPx - 1 - BORDER_PX) {
      escaped = true;
      break;
    }
    const push = (nx: number, ny: number) => {
      const ni = ny * wPx + nx;
      if (filled[ni]) return;
      if (bnd[ni]) return;
      filled[ni] = 1;
      stack[sp++] = ni;
    };
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  if (escaped || count < 9) return null;

  // --- 4b) Schmale Ausläufer entfernen (morphologisches Opening) -----------
  // An T-/X-Kreuzungen und über die Ecken hinauslaufenden Linien entstehen
  // zwischen den verdickten Grenzen schmale Taschen. Ein Opening mit einem
  // Radius etwas größer als die Grenzverdickung schneidet genau diese Arme
  // weg, ohne die eigentliche Raumfläche zu verändern. Anschließend wird die
  // Fläche wieder bis an die Grenzmittellinie ausgedehnt (Dilatation um
  // OPEN_R + DILATE_PX), aber auf die Umgebung der Originalregion beschränkt,
  // damit die Kontur nicht über die Begrenzung hinauswächst.
  const OPEN_R = DILATE_PX + 2;
  let region = filled;
  const eroded = erodeMask(filled, wPx, hPx, OPEN_R);
  const core = componentAt(eroded, filled, wPx, hPx, startIdx);
  if (core) {
    const grown = dilateMask(core, wPx, hPx, OPEN_R + DILATE_PX);
    const allowed = dilateMask(filled, wPx, hPx, DILATE_PX);
    const opened = new Uint8Array(wPx * hPx);
    let openCount = 0;
    for (let i = 0; i < opened.length; i++) {
      const on = grown[i] && allowed[i] ? 1 : 0;
      opened[i] = on;
      openCount += on;
    }
    if (openCount >= 9) region = opened;
  }

  // --- 5) Kontur extrahieren + vereinfachen -------------------------------
  const contourPx = traceContour(region, wPx, hPx, startIdx);
  if (contourPx.length < 3) return null;


  const world: Vec2[] = contourPx.map((p) => v(mask.x + p.x / mask.pxPerM, mask.y + p.y / mask.pxPerM));
  // Treppenstufen der Rasterkontur zuerst leicht glätten (gleitender Mittelwert
  // über 3 Punkte) — die Form bleibt, aber Douglas-Peucker findet danach echte
  // Ecken statt Pixeltreppen.
  const smoothed = smoothClosed(world, 1);

  // Vereinfachung ab ≈ 1,8 Analysepixel; falls immer noch sehr viele Punkte
  // übrig bleiben (gekrümmte Pixelkanten), Toleranz schrittweise erhöhen, bis
  // die Kontur eine handhabbare Punktzahl hat.
  let eps = 1.8 / mask.pxPerM;
  let simple = simplify(smoothed, eps);
  for (let i = 0; i < 8 && simple.length > MAX_CONTOUR_POINTS; i++) {
    eps *= 1.7;
    simple = simplify(smoothed, eps);
  }
  if (simple.length >= 2) {
    const first = simple[0], last = simple[simple.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < eps) simple = simple.slice(0, -1);
  }
  if (simple.length < 3) return null;
  if (polygonSignedArea(simple) < 0) simple = [...simple].reverse();
  return simple;
}
