import { Vec2, v } from "./geometry";
import type { DocumentObject } from "./Scene";

/** Liefert die 4 Welt-Eckpunkte (TL, TR, BR, BL) eines Dokuments unter Berücksichtigung von Rotation. */
export function documentCornersWorld(doc: DocumentObject): Vec2[] {
  const cx = doc.position.x + doc.widthM / 2;
  const cy = doc.position.y + doc.heightM / 2;
  const hx = doc.widthM / 2;
  const hy = doc.heightM / 2;
  const local: Vec2[] = [
    v(-hx, -hy), v(hx, -hy), v(hx, hy), v(-hx, hy),
  ];
  const cos = Math.cos(doc.rotationRad);
  const sin = Math.sin(doc.rotationRad);
  return local.map(p => v(cx + p.x * cos - p.y * sin, cy + p.x * sin + p.y * cos));
}

/** 4 Kantenmitten (Top, Right, Bottom, Left) — für Snap. */
export function documentEdgeMidpointsWorld(doc: DocumentObject): Vec2[] {
  const c = documentCornersWorld(doc);
  return [
    v((c[0].x + c[1].x) / 2, (c[0].y + c[1].y) / 2),
    v((c[1].x + c[2].x) / 2, (c[1].y + c[2].y) / 2),
    v((c[2].x + c[3].x) / 2, (c[2].y + c[3].y) / 2),
    v((c[3].x + c[0].x) / 2, (c[3].y + c[0].y) / 2),
  ];
}

export type DocumentSide = "top" | "right" | "bottom" | "left";

/** 4 Welt-Kanten als Segmente (Top, Right, Bottom, Left) inkl. Seitenname. */
export function documentEdgesWorld(doc: DocumentObject): { side: DocumentSide; a: Vec2; b: Vec2 }[] {
  const c = documentCornersWorld(doc);
  return [
    { side: "top",    a: c[0], b: c[1] },
    { side: "right",  a: c[1], b: c[2] },
    { side: "bottom", a: c[2], b: c[3] },
    { side: "left",   a: c[3], b: c[0] },
  ];
}

/** Hit-Test: liegt screen-Punkt (sx,sy) innerhalb tol Pixel an einer Eckpunkt-Welt-Position? */
export function hitDocumentCorner(
  doc: DocumentObject,
  worldToScreen: (x: number, y: number) => { x: number; y: number },
  sx: number,
  sy: number,
  tolPx = 9,
): number | null {
  const corners = documentCornersWorld(doc);
  for (let i = 0; i < corners.length; i++) {
    const s = worldToScreen(corners[i].x, corners[i].y);
    if (Math.hypot(s.x - sx, s.y - sy) <= tolPx) return i;
  }
  return null;
}

/** Hit-Test: liegt screen-Punkt nahe einer Kante? Liefert Seite oder null. */
export function hitDocumentEdge(
  doc: DocumentObject,
  worldToScreen: (x: number, y: number) => { x: number; y: number },
  sx: number,
  sy: number,
  tolPx = 6,
): DocumentSide | null {
  const edges = documentEdgesWorld(doc);
  let best: { side: DocumentSide; d: number } | null = null;
  for (const e of edges) {
    const a = worldToScreen(e.a.x, e.a.y);
    const b = worldToScreen(e.b.x, e.b.y);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((sx - a.x) * dx + (sy - a.y) * dy) / len2));
    const px = a.x + dx * t, py = a.y + dy * t;
    const d = Math.hypot(px - sx, py - sy);
    if (d <= tolPx && (!best || d < best.d)) best = { side: e.side, d };
  }
  return best ? best.side : null;
}


/** Center point in world coordinates. */
export function documentCenterWorld(doc: DocumentObject): Vec2 {
  return v(doc.position.x + doc.widthM / 2, doc.position.y + doc.heightM / 2);
}

/** Hit-Test: Punkt im (rotierten) Rechteck? */
export function pointInDocument(p: Vec2, doc: DocumentObject): boolean {
  const cx = doc.position.x + doc.widthM / 2;
  const cy = doc.position.y + doc.heightM / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const cos = Math.cos(-doc.rotationRad);
  const sin = Math.sin(-doc.rotationRad);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= doc.widthM / 2 && Math.abs(ly) <= doc.heightM / 2;
}

/** Skaliert ein Dokument um faktor um seinen Mittelpunkt (Position wird so angepasst, dass Center fix bleibt). */
export function scaleDocumentAroundCenter(doc: DocumentObject, factor: number) {
  if (!isFinite(factor) || factor <= 0) return;
  const cx = doc.position.x + doc.widthM / 2;
  const cy = doc.position.y + doc.heightM / 2;
  doc.widthM = Math.max(0.001, doc.widthM * factor);
  doc.heightM = Math.max(0.001, doc.heightM * factor);
  doc.position.x = cx - doc.widthM / 2;
  doc.position.y = cy - doc.heightM / 2;
}
