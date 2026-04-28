/**
 * Step 5: PDF-Export der ausgewählten Druckpläne via pdf-lib (Multi-Page).
 *
 * Pro Plan eine PDF-Seite in Papiergröße (mm → PDF-Punkte: 1 mm = 2.83464567 pt).
 * Projektionen werden vektorbasiert in PDF gezeichnet:
 *  - Sheet-Welt-Meter werden über `factor = 1/scale` in Plan-Meter umgerechnet
 *  - Translation zur Papier-Mitte + projection-Position, Rotation um BBox-Center
 *  - Geometrisches Clipping (Liang-Barsky für Linien, Sutherland-Hodgman für Polygone)
 *    am Clip-Rechteck im lokalen, rotierten Plan-mm-System
 */
import { PDFDocument, PDFPage, rgb } from "pdf-lib";
import type { Plan } from "./PlanManager";
import { getPlanPaperSize } from "./PlanManager";
import {
  flattenSheetSnapshot,
  computeProjectionLayout,
  type ProjectionItem,
} from "./PlanProjections";
import { Defaults } from "./constants";

const MM_TO_PT = 72 / 25.4; // ≈ 2.8346

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string | undefined, fallback: RGB = { r: 0, g: 0, b: 0 }): RGB {
  if (!hex || typeof hex !== "string") return fallback;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const v = parseInt(m[1], 16);
  return { r: ((v >> 16) & 0xff) / 255, g: ((v >> 8) & 0xff) / 255, b: (v & 0xff) / 255 };
}

/** Clip-Rechteck in lokalen mm. */
interface ClipRect { left: number; right: number; top: number; bottom: number }

/** Liang-Barsky Linien-Clip an axis-aligned Rechteck. */
function clipLine(
  x0: number, y0: number, x1: number, y1: number, c: ClipRect,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - c.left, c.right - x0, y0 - c.top, c.bottom - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return { x0: x0 + t0 * dx, y0: y0 + t0 * dy, x1: x0 + t1 * dx, y1: y0 + t1 * dy };
}

/** Sutherland-Hodgman Polygon-Clip an axis-aligned Rechteck. */
function clipPolygon(poly: { x: number; y: number }[], c: ClipRect): { x: number; y: number }[] {
  if (poly.length < 3) return [];
  const edges: Array<(p: { x: number; y: number }) => boolean> = [
    (p) => p.x >= c.left,
    (p) => p.x <= c.right,
    (p) => p.y >= c.top,
    (p) => p.y <= c.bottom,
  ];
  const intersect = (
    a: { x: number; y: number }, b: { x: number; y: number }, edgeIdx: number,
  ): { x: number; y: number } => {
    const dx = b.x - a.x, dy = b.y - a.y;
    let t = 0;
    if (edgeIdx === 0) t = (c.left - a.x) / (dx || 1e-12);
    else if (edgeIdx === 1) t = (c.right - a.x) / (dx || 1e-12);
    else if (edgeIdx === 2) t = (c.top - a.y) / (dy || 1e-12);
    else t = (c.bottom - a.y) / (dy || 1e-12);
    return { x: a.x + t * dx, y: a.y + t * dy };
  };
  let output = poly.slice();
  for (let i = 0; i < edges.length && output.length > 0; i++) {
    const inside = edges[i];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j - 1 + input.length) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) output.push(intersect(prev, cur, i));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersect(prev, cur, i));
      }
    }
  }
  return output;
}

/** 2D-Rotation. */
function rot(p: { x: number; y: number }, ang: number): { x: number; y: number } {
  if (!ang) return p;
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/**
 * Zeichnet eine einzelne Projektion auf die PDF-Seite.
 * Koordinaten-Pipeline:
 *   sheet-m  --(factor)--> plan-m  --(*1000)--> plan-mm (lokal, vor Rotation, relativ zu BBox-Center)
 *   → Clip an clipLocalMm
 *   → Rotation (rotation)
 *   → Translation: paperCenterMm + (proj.x, proj.y)  [wobei proj.x/y bereits mm sind, vom Papier-Center weg]
 *   → mm → pt; PDF-Y ist nach OBEN, daher Y invertieren (paperHeightPt - y)
 */
function drawProjectionToPdf(
  page: PDFPage,
  paperWidthMm: number,
  paperHeightMm: number,
  items: ProjectionItem[],
  proj: { x: number; y: number; rotation: number; scale: number; clip: ClipRect },
) {
  const layout = computeProjectionLayout(items, proj);
  const factor = layout.factor; // sheet-m → plan-m
  const clip = layout.clipLocalMm; // mm
  const rotation = proj.rotation || 0;

  // Item-Origin Offset in mm (Sheet 0,0 → BBox-Center, in Plan-mm)
  const offMmX = layout.itemOriginOffsetPlanM.x * 1000;
  const offMmY = layout.itemOriginOffsetPlanM.y * 1000;

  // sheet-m → lokale mm
  const toLocalMm = (sx: number, sy: number) => ({
    x: offMmX + sx * factor * 1000,
    y: offMmY + sy * factor * 1000,
  });

  // lokale mm (nach Clip, vor Rotation) → PDF-Punkt-Koordinaten
  const paperCenterMmX = paperWidthMm / 2;
  const paperCenterMmY = paperHeightMm / 2;
  // proj.x/y verschiebt vom Papier-Center; Y in unserem Modell zeigt nach UNTEN (Bildschirm),
  // PDF Y zeigt nach OBEN → Y invertieren beim finalen Schritt.
  const localToPdf = (lx: number, ly: number): { x: number; y: number } => {
    const rotated = rot({ x: lx, y: ly }, rotation);
    const mmX = paperCenterMmX + proj.x + rotated.x;
    const mmY = paperCenterMmY + proj.y + rotated.y;
    return { x: mmX * MM_TO_PT, y: (paperHeightMm - mmY) * MM_TO_PT };
  };

  for (const it of items) {
    if (it.kind === "segment" && it.a && it.b) {
      const a = toLocalMm(it.a.x, it.a.y);
      const b = toLocalMm(it.b.x, it.b.y);
      const seg = clipLine(a.x, a.y, b.x, b.y, clip);
      if (!seg) continue;
      const p0 = localToPdf(seg.x0, seg.y0);
      const p1 = localToPdf(seg.x1, seg.y1);
      const col = hexToRgb(it.color || Defaults.lineColor);
      const thicknessMm = (it.thicknessM || Defaults.lineThicknessM) * factor * 1000;
      page.drawLine({
        start: { x: p0.x, y: p0.y },
        end: { x: p1.x, y: p1.y },
        thickness: Math.max(0.2, thicknessMm * MM_TO_PT),
        color: rgb(col.r, col.g, col.b),
      });
    } else if (it.kind === "dimension-line" && it.a && it.b) {
      const a = toLocalMm(it.a.x, it.a.y);
      const b = toLocalMm(it.b.x, it.b.y);
      const seg = clipLine(a.x, a.y, b.x, b.y, clip);
      if (!seg) continue;
      const p0 = localToPdf(seg.x0, seg.y0);
      const p1 = localToPdf(seg.x1, seg.y1);
      const col = hexToRgb(it.color || "#222222");
      page.drawLine({
        start: { x: p0.x, y: p0.y },
        end: { x: p1.x, y: p1.y },
        thickness: 0.4,
        color: rgb(col.r, col.g, col.b),
      });
    } else if (it.kind === "hatch" && it.points && it.points.length >= 3) {
      const localPoly = it.points.map(p => toLocalMm(p.x, p.y));
      const clipped = clipPolygon(localPoly, clip);
      if (clipped.length < 3) continue;
      const fill = hexToRgb(it.fillColor || Defaults.hatchFillColor);
      const stroke = hexToRgb(it.strokeColor || Defaults.hatchStrokeColor);
      const fillAlpha = (it.fillAlphaPct ?? Defaults.hatchFillAlphaPct) / 100;
      const path = clipped.map((p, i) => {
        const q = localToPdf(p.x, p.y);
        return `${i === 0 ? "M" : "L"}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
      }).join(" ") + " Z";
      const sw = it.strokeWidthPx ?? Defaults.hatchStrokePx;
      page.drawSvgPath(path, {
        color: rgb(fill.r, fill.g, fill.b),
        opacity: fillAlpha,
        borderColor: sw > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined,
        borderWidth: sw > 0 ? Math.max(0.2, sw * 0.3) : 0,
      });
    } else if ((it.kind === "textbox-rect" || it.kind === "document-rect") && it.center) {
      const w = (it.widthM || 0) / 2;
      const h = (it.heightM || 0) / 2;
      const cRot = it.rotationRad || 0;
      // 4 Eckpunkte des rotierten Rechtecks im Sheet-System
      const corners = [
        { x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h },
      ].map(c => {
        const r = rot(c, cRot);
        return { x: it.center!.x + r.x, y: it.center!.y + r.y };
      });
      const localPoly = corners.map(p => toLocalMm(p.x, p.y));
      const clipped = clipPolygon(localPoly, clip);
      if (clipped.length < 3) continue;
      const path = clipped.map((p, i) => {
        const q = localToPdf(p.x, p.y);
        return `${i === 0 ? "M" : "L"}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
      }).join(" ") + " Z";
      const isDoc = it.kind === "document-rect";
      page.drawSvgPath(path, {
        color: isDoc ? rgb(0.47, 0.47, 0.47) : rgb(0.86, 0.86, 0.31),
        opacity: isDoc ? 0.18 : 0.10,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.3,
      });
    }
  }
}

/** Erzeugt ein PDF mit einer Seite pro Plan und liefert die Bytes. */
export async function exportPlansToPdf(
  plans: Plan[],
  resolveSheetSnapshot: (sheetId: string) => unknown | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("PixunaCAD Druckpläne");
  pdf.setCreator("PixunaCAD");

  for (const plan of plans) {
    const size = getPlanPaperSize(plan);
    const page = pdf.addPage([size.width * MM_TO_PT, size.height * MM_TO_PT]);

    // Optionaler Papier-Rahmen (sehr dezent)
    page.drawRectangle({
      x: 0, y: 0,
      width: size.width * MM_TO_PT,
      height: size.height * MM_TO_PT,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    for (const proj of plan.projections) {
      // Bevorzugt: bereits eingefrorener Snapshot zur Drop-Zeit.
      const snap = proj.sceneSnapshot ?? resolveSheetSnapshot(proj.sourceSheetId);
      if (!snap) continue;
      const items = flattenSheetSnapshot(snap);
      if (items.length === 0) continue;
      try {
        drawProjectionToPdf(page, size.width, size.height, items, {
          x: proj.x, y: proj.y, rotation: proj.rotation, scale: proj.scale, clip: proj.clip,
        });
      } catch (err) {
        console.warn("[PlanPdfExport] Projektion fehlgeschlagen:", proj.id, err);
      }
    }

    // Plan-Name unten links als kleine Beschriftung
    page.drawText(plan.name, {
      x: 5 * MM_TO_PT,
      y: 4 * MM_TO_PT,
      size: 8,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return await pdf.save();
}

/** Triggert Browser-Download eines PDFs. */
export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
