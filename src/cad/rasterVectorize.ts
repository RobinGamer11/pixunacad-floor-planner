/**
 * rasterVectorize.ts — Rasterstriche → Boundary-Geometrie.
 *
 * Für die hybride Bereichserkennung (Vektor + Pixel) darf die Rastermaske nicht
 * mehr per Flood-Fill die Fläche bestimmen: Ein über einen Schnittpunkt hinaus
 * weiterlaufender Strich liegt physisch in der Fläche und erzeugt dort
 * zwangsläufig Kerben/Ausläufer. Morphologie kann eine solche Kerbe nicht von
 * einer echten Einbuchtung unterscheiden.
 *
 * Stattdessen werden Rasterstriche hier in eine geometrische Repräsentation
 * überführt:
 *
 *  1) Binarisierung der Analysemaske (Alpha ≥ Schwelle = Strich)
 *  2) Skeletonisierung (Zhang-Suen) → 1 Pixel breite Mittellinien
 *  3) Pfadverfolgung zwischen Endpunkten/Verzweigungen → Polylinien
 *  4) Douglas-Peucker-Vereinfachung (Ecken/Kreuzungen bleiben erhalten,
 *     weil sie immer Pfadenden sind)
 *
 * Ergebnis sind Weltkoordinaten-Kanten, die anschließend im vorhandenen
 * planaren Vektor-Graphen (`hatchFill.ts`) mit den echten Vektorkanten
 * verschnitten werden.
 */
import { v, type Vec2 } from "./geometry";
import type { RawEdge } from "./hatchFill";

/** 8er-Nachbarschaft im Uhrzeigersinn ab „oben“ (P2..P9 nach Zhang-Suen). */
const N8 = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * Zhang-Suen-Thinning. Liefert eine neue 0/1-Maske mit 1 px breiten
 * Mittellinien. `maxIter` deckelt die Laufzeit bei sehr breiten Strichen.
 */
export function skeletonize(src: Uint8Array, wPx: number, hPx: number, maxIter = 48): Uint8Array {
  const img = Uint8Array.from(src);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= wPx || y >= hPx) ? 0 : img[y * wPx + x];
  const marked: number[] = [];

  for (let iter = 0; iter < maxIter * 2; iter++) {
    const step = iter & 1;
    marked.length = 0;
    for (let y = 1; y < hPx - 1; y++) {
      for (let x = 1; x < wPx - 1; x++) {
        if (!img[y * wPx + x]) continue;
        const p: number[] = new Array(8);
        for (let k = 0; k < 8; k++) p[k] = at(x + N8[k][0], y + N8[k][1]);
        let b = 0;
        for (let k = 0; k < 8; k++) b += p[k];
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        // p[0]=N, p[2]=E, p[4]=S, p[6]=W
        if (step === 0) {
          if (p[0] && p[2] && p[4]) continue;
          if (p[2] && p[4] && p[6]) continue;
        } else {
          if (p[0] && p[2] && p[6]) continue;
          if (p[0] && p[4] && p[6]) continue;
        }
        marked.push(y * wPx + x);
      }
    }
    if (!marked.length) { if (step === 1) break; else continue; }
    for (const i of marked) img[i] = 0;
  }
  return img;
}

/** Douglas-Peucker über einen offenen Polygonzug. */
function simplifyOpen(points: Vec2[], eps: number): Vec2[] {
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
    if (best >= 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Verfolgt das Skelett und liefert Polylinien in Pixelkoordinaten.
 * Pfade laufen jeweils von einem Endpunkt/Knoten (Grad ≠ 2) zum nächsten,
 * geschlossene Ringe ohne Knoten werden separat erfasst.
 */
export function traceSkeleton(sk: Uint8Array, wPx: number, hPx: number): { x: number; y: number }[][] {
  const idxOf = (x: number, y: number) => y * wPx + x;
  const on = (x: number, y: number) => (x < 0 || y < 0 || x >= wPx || y >= hPx) ? 0 : sk[idxOf(x, y)];
  const deg = (x: number, y: number) => {
    let d = 0;
    for (const [dx, dy] of N8) if (on(x + dx, y + dy)) d++;
    return d;
  };

  const usedEdge = new Set<number>();
  const edgeKey = (a: number, b: number) => (a < b ? a * wPx * hPx + b : b * wPx * hPx + a);
  const paths: { x: number; y: number }[][] = [];

  const walk = (sx: number, sy: number, dx0: number, dy0: number) => {
    const pts = [{ x: sx, y: sy }];
    let px = sx, py = sy;
    let nx = sx + dx0, ny = sy + dy0;
    let guard = 0;
    while (guard++ < wPx * hPx) {
      const k = edgeKey(idxOf(px, py), idxOf(nx, ny));
      if (usedEdge.has(k)) break;
      usedEdge.add(k);
      pts.push({ x: nx, y: ny });
      if (deg(nx, ny) !== 2) break; // Knoten oder Endpunkt erreicht
      let fx = -1, fy = -1;
      for (const [ddx, ddy] of N8) {
        const cx = nx + ddx, cy = ny + ddy;
        if (!on(cx, cy)) continue;
        if (cx === px && cy === py) continue;
        fx = cx; fy = cy; break;
      }
      if (fx < 0) break;
      px = nx; py = ny; nx = fx; ny = fy;
    }
    if (pts.length >= 2) paths.push(pts);
  };

  // 1) Pfade ab allen Endpunkten/Verzweigungen
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      if (!sk[idxOf(x, y)]) continue;
      const d = deg(x, y);
      if (d === 2) continue;
      for (const [dx, dy] of N8) {
        if (!on(x + dx, y + dy)) continue;
        if (usedEdge.has(edgeKey(idxOf(x, y), idxOf(x + dx, y + dy)))) continue;
        walk(x, y, dx, dy);
      }
    }
  }
  // 2) Übrig gebliebene geschlossene Ringe (überall Grad 2)
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      if (!sk[idxOf(x, y)]) continue;
      let free = false;
      for (const [dx, dy] of N8) {
        if (!on(x + dx, y + dy)) continue;
        if (!usedEdge.has(edgeKey(idxOf(x, y), idxOf(x + dx, y + dy)))) { free = true; break; }
      }
      if (!free) continue;
      for (const [dx, dy] of N8) {
        if (!on(x + dx, y + dy)) continue;
        if (usedEdge.has(edgeKey(idxOf(x, y), idxOf(x + dx, y + dy)))) continue;
        walk(x, y, dx, dy);
      }
    }
  }
  return paths;
}

export interface VectorizeResult {
  /** Vereinfachte Pixel-Grenzkurven als Kanten in Weltkoordinaten. */
  edges: RawEdge[];
  /** Freie Enden (Grad 1) der Pixelkurven — Kandidaten für Lückenschluss. */
  openEnds: Vec2[];
}

/**
 * Wandelt eine Alpha-Analysemaske in Boundary-Kanten in Weltkoordinaten.
 *
 * @param alpha      Alphakanal der Maske (1 Byte je Pixel)
 * @param threshold  Alpha-Schwelle für „Strich“
 * @param originX/Y  Weltkoordinate der Maskenecke
 * @param pxPerM     Analyseauflösung
 * @param simplifyPx Vereinfachungstoleranz in Analysepixeln
 */
export function vectorizeRasterBoundary(
  alpha: Uint8Array,
  threshold: number,
  wPx: number,
  hPx: number,
  originX: number,
  originY: number,
  pxPerM: number,
  simplifyPx = 3,
): VectorizeResult {
  const bin = new Uint8Array(wPx * hPx);
  let any = false;
  for (let i = 0; i < bin.length; i++) {
    if (alpha[i] >= threshold) { bin[i] = 1; any = true; }
  }
  if (!any) return { edges: [], openEnds: [] };

  const sk = skeletonize(bin, wPx, hPx);
  const paths = traceSkeleton(sk, wPx, hPx);

  const toWorld = (p: { x: number; y: number }) =>
    v(originX + (p.x + 0.5) / pxPerM, originY + (p.y + 0.5) / pxPerM);

  const edges: RawEdge[] = [];
  const openEnds: Vec2[] = [];
  const degAt = (x: number, y: number) => {
    let d = 0;
    for (const [dx, dy] of N8) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= wPx || cy >= hPx) continue;
      if (sk[cy * wPx + cx]) d++;
    }
    return d;
  };

  for (const path of paths) {
    if (path.length < 2) continue;
    const world = path.map(toWorld);
    const simplified = simplifyOpen(world, simplifyPx / pxPerM);
    for (let i = 0; i < simplified.length - 1; i++) {
      const a = simplified[i], b = simplified[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) edges.push({ a, b });
    }
    for (const end of [path[0], path[path.length - 1]]) {
      if (degAt(end.x, end.y) <= 1) openEnds.push(toWorld(end));
    }
  }
  return { edges, openEnds };
}
