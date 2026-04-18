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
