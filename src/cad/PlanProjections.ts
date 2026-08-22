/**
 * Helfer für Plan-Projektionen (Step 4):
 * - Snapshot eines Sheets in eine flache Item-Liste konvertieren
 * - Bounding-Box bestimmen
 * - Projektion auf Plan rendern (mit Maßstab + Rotation + Clip-Rechteck)
 * - Hit-Test für Plan-Modus (Body + Kanten)
 *
 * Konvention:
 * - Plan-Welt: 1 Welt-Einheit = 1 m (Papier-Meter). Papier liegt mittig am Welt-Ursprung.
 * - Sheet-Welt: 1 Welt-Einheit = 1 m (reale Meter).
 * - Maßstab `s` (z. B. 100 für 1:100): 1 reale m → 1/s Papier-m → 1000/s Papier-mm.
 * - `projection.x/y` und `projection.clip` sind in Plan-mm angegeben (UI-friendly).
 */
import { Camera } from "./Camera";
import { Defaults } from "./constants";
import { rgbaFromHex } from "./geometry";
import { modelToPaperFactor, normalizeScaleDen } from "@/lib/scale";

export interface ProjectionItem {
  kind: "segment" | "hatch" | "textbox-rect" | "document-rect" | "dimension-line";
  // segment
  a?: { x: number; y: number };
  b?: { x: number; y: number };
  color?: string;
  thicknessM?: number;
  // hatch
  points?: { x: number; y: number }[];
  fillColor?: string;
  strokeColor?: string;
  fillAlphaPct?: number;
  strokeWidthPx?: number;
  // textbox/document rect
  center?: { x: number; y: number };
  widthM?: number;
  heightM?: number;
  rotationRad?: number;
  label?: string;
}

/** Konvertiert eine serialisierte Sheet-Scene (siehe CadApp._serializeOneScene) in flache Items. */
export function flattenSheetSnapshot(snapshot: any): ProjectionItem[] {
  const items: ProjectionItem[] = [];
  if (!snapshot || typeof snapshot !== "object") return items;
  for (const h of snapshot.hatches || []) {
    items.push({
      kind: "hatch",
      points: (h.points || []).map((p: any) => ({ x: p.x, y: p.y })),
      fillColor: h.fillColor,
      strokeColor: h.strokeColor,
      fillAlphaPct: h.fillAlphaPct,
      strokeWidthPx: h.strokeWidthPx,
    });
  }
  for (const s of snapshot.segments || []) {
    items.push({
      kind: "segment",
      a: { x: s.a.x, y: s.a.y },
      b: { x: s.b.x, y: s.b.y },
      color: s.color,
      thicknessM: s.thicknessM,
    });
  }
  for (const d of snapshot.dimensions || []) {
    // Vereinfachung in der Projektion: zeichne nur die Maßlinie zwischen p1 und p2.
    items.push({
      kind: "dimension-line",
      a: { x: d.p1.x, y: d.p1.y },
      b: { x: d.p2.x, y: d.p2.y },
      color: d.lineColor || "#222",
    });
  }
  for (const t of snapshot.textBoxes || []) {
    items.push({
      kind: "textbox-rect",
      center: { x: t.center.x, y: t.center.y },
      widthM: t.widthM,
      heightM: t.heightM,
      rotationRad: t.rotationRad || 0,
    });
  }
  for (const doc of snapshot.documents || []) {
    items.push({
      kind: "document-rect",
      center: { x: doc.position.x + doc.widthM / 2, y: doc.position.y + doc.heightM / 2 },
      widthM: doc.widthM,
      heightM: doc.heightM,
      rotationRad: doc.rotationRad || 0,
      label: doc.name || "Dokument",
    });
  }
  return items;
}

/** Bounds aller Items in Sheet-Welt-Metern. */
export function itemsBoundsM(items: ProjectionItem[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const it of items) {
    if (it.kind === "segment" || it.kind === "dimension-line") {
      if (it.a) acc(it.a.x, it.a.y);
      if (it.b) acc(it.b.x, it.b.y);
    } else if (it.kind === "hatch") {
      for (const p of it.points || []) acc(p.x, p.y);
    } else if (it.kind === "textbox-rect" || it.kind === "document-rect") {
      const w = (it.widthM || 0) / 2;
      const h = (it.heightM || 0) / 2;
      // Rotation ignorieren — konservative AABB
      const c = it.center || { x: 0, y: 0 };
      acc(c.x - w, c.y - h);
      acc(c.x + w, c.y + h);
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Sheet-Meter → Plan-Meter Faktor (geometrische Skalierung der Projektion).
 *  Delegiert an die kanonische Maßstabs-Utility. */
export function sheetToPlanFactor(scaleVal: number): number {
  return modelToPaperFactor(scaleVal);
}

/** Kanonischer Maßstabsnenner einer Projektion (mit Altfeld-Fallback). */
export function projectionScaleDen(
  proj: { scaleDen?: number; scale?: number } | null | undefined,
): number {
  if (!proj) return 100;
  if (typeof proj.scaleDen === "number" && proj.scaleDen > 0) return normalizeScaleDen(proj.scaleDen);
  return normalizeScaleDen(proj.scale ?? 100);
}

/**
 * Projection-Layout im Plan (in Plan-Welt-Metern):
 * - center: (proj.x/1000, proj.y/1000)  (proj.x/y in mm)
 * - inneres Item-System: erst Sheet→Plan-Skalierung, dann Rotation, dann Translation an center
 *
 * Die Bounding-Box der Items, projiziert in Plan-Meter (relativ zu Sheet-Origin):
 *   (minX..maxX) * factor, (minY..maxY) * factor
 *
 * Clip-Rechteck wird in Plan-mm relativ zum Mittelpunkt der projizierten BBox
 * gespeichert (clip.left/right/top/bottom): Werte in mm, die VON der BBox
 * "abgeschnitten" werden (positive Werte = mehr abschneiden).
 */
export interface ProjectionLayout {
  /** Mittelpunkt in Plan-Welt-Metern. */
  centerPlanM: { x: number; y: number };
  /** Bbox der Items in Plan-mm relativ zum Mittelpunkt der BBox (vor Clip). */
  bboxLocalMm: { left: number; right: number; top: number; bottom: number };
  /** Effektives Clip-Rechteck in Plan-mm relativ zum Mittelpunkt der BBox (nach Anwenden von clip). */
  clipLocalMm: { left: number; right: number; top: number; bottom: number };
  /** Faktor Sheet-m → Plan-m. */
  factor: number;
  /** Versatz von Item-Origin (Sheet 0,0) zum BBox-Center, in Plan-Metern. */
  itemOriginOffsetPlanM: { x: number; y: number };
}

/** Padding um die Items-BBox in Plan-mm — damit der blaue Auswahlrahmen Luft hat
 *  und die Geometrie nicht bündig am Clip-Rand klebt. */
export const PROJECTION_BBOX_PADDING_MM = 12;

export function computeProjectionLayout(
  items: ProjectionItem[],
  proj: { x: number; y: number; rotation: number; scaleDen?: number; scale?: number; clip: { left: number; right: number; top: number; bottom: number } },
): ProjectionLayout {
  const bb = itemsBoundsM(items);
  const factor = modelToPaperFactor(projectionScaleDen(proj));
  const widthPlanM = (bb.maxX - bb.minX) * factor;
  const heightPlanM = (bb.maxY - bb.minY) * factor;
  const padMm = PROJECTION_BBOX_PADDING_MM;
  const widthMm = widthPlanM * 1000 + 2 * padMm;
  const heightMm = heightPlanM * 1000 + 2 * padMm;
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  // bbox local (in mm, relativ zum BBox-Mittelpunkt)
  const bboxLocalMm = { left: -halfW, right: halfW, top: -halfH, bottom: halfH };
  // Clip schneidet von außen nach innen
  const clip = proj.clip || { left: 0, right: 0, top: 0, bottom: 0 };
  const clipLocalMm = {
    left: bboxLocalMm.left + Math.max(0, clip.left),
    right: bboxLocalMm.right - Math.max(0, clip.right),
    top: bboxLocalMm.top + Math.max(0, clip.top),
    bottom: bboxLocalMm.bottom - Math.max(0, clip.bottom),
  };
  // Item-Origin (Sheet 0,0) projiziert: liegt bei -bb.minX..0 vom BBox-Origin
  // BBox-Mittelpunkt im Sheet-Welt: ((bb.minX+bb.maxX)/2, (bb.minY+bb.maxY)/2)
  // Versatz Item-Origin → BBox-Center in Plan-m: -mid * factor
  const midX = (bb.minX + bb.maxX) / 2;
  const midY = (bb.minY + bb.maxY) / 2;
  const itemOriginOffsetPlanM = { x: -midX * factor, y: -midY * factor };
  return {
    centerPlanM: { x: proj.x / 1000, y: proj.y / 1000 },
    bboxLocalMm,
    clipLocalMm,
    factor,
    itemOriginOffsetPlanM,
  };
}

/** Default-Bbox/Clip-Position aus einem Sheet-Snapshot, Drop-Punkt in Plan-mm. */
export function defaultClipForItems(): { left: number; right: number; top: number; bottom: number } {
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

/**
 * Zeichnet eine einzelne Projektion in den gegebenen Canvas-Context.
 * Annahme: ctx ist im Bildschirm-Pixel-Raum (DPR-skaliert), und cam ist die Plan-Kamera.
 */
export function drawProjection(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  items: ProjectionItem[],
  proj: { x: number; y: number; rotation: number; scaleDen?: number; scale?: number; clip: { left: number; right: number; top: number; bottom: number } },
  isSelected: boolean,
  isHover: boolean,
) {
  const layout = computeProjectionLayout(items, proj);

  ctx.save();

  // 1) Translate zum BBox-Center auf Bildschirm.
  const cs = cam.worldToScreen(layout.centerPlanM.x, layout.centerPlanM.y);
  ctx.translate(cs.x, cs.y);
  // 2) Rotation um BBox-Center.
  if (proj.rotation) ctx.rotate(proj.rotation);
  // 3) Clip-Rechteck (Plan-mm → Bildschirm-Pixel).
  const mmToPx = (mm: number) => (mm / 1000) * cam.scale;
  const clipL = mmToPx(layout.clipLocalMm.left);
  const clipR = mmToPx(layout.clipLocalMm.right);
  const clipT = mmToPx(layout.clipLocalMm.top);
  const clipB = mmToPx(layout.clipLocalMm.bottom);
  ctx.beginPath();
  ctx.rect(clipL, clipT, clipR - clipL, clipB - clipT);
  ctx.clip();

  // 4) Items zeichnen: Sheet-Welt-m → lokales Plan-Pixel-System.
  // Skalierungsfaktor von Sheet-m zu lokalen Pixel: factor (m→m) * cam.scale (m→px)
  const itemScalePxPerSheetM = layout.factor * cam.scale;
  const offX = layout.itemOriginOffsetPlanM.x * cam.scale;
  const offY = layout.itemOriginOffsetPlanM.y * cam.scale;

  // Hilfsfunktionen: Sheet-Punkt → lokale Pixel (im aktuellen ctx-Frame).
  const toLocal = (x: number, y: number) => ({
    x: offX + x * itemScalePxPerSheetM,
    y: offY + y * itemScalePxPerSheetM,
  });

  for (const it of items) {
    if (it.kind === "hatch" && it.points && it.points.length >= 3) {
      const fillAlpha = (it.fillAlphaPct ?? Defaults.hatchFillAlphaPct) / 100;
      ctx.beginPath();
      const p0 = toLocal(it.points[0].x, it.points[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < it.points.length; i++) {
        const p = toLocal(it.points[i].x, it.points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = rgbaFromHex(it.fillColor || Defaults.hatchFillColor, fillAlpha);
      ctx.fill();
      const sw = it.strokeWidthPx ?? Defaults.hatchStrokePx;
      if (sw > 0) {
        ctx.strokeStyle = it.strokeColor || Defaults.hatchStrokeColor;
        ctx.lineWidth = Math.max(0.5, sw * (itemScalePxPerSheetM / Defaults.strokeWidthBaseScale));
        ctx.stroke();
      }
    } else if (it.kind === "segment" && it.a && it.b) {
      const a = toLocal(it.a.x, it.a.y);
      const b = toLocal(it.b.x, it.b.y);
      ctx.strokeStyle = it.color || Defaults.lineColor;
      ctx.lineWidth = Math.max(0.5, (it.thicknessM || Defaults.lineThicknessM) * itemScalePxPerSheetM);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (it.kind === "dimension-line" && it.a && it.b) {
      const a = toLocal(it.a.x, it.a.y);
      const b = toLocal(it.b.x, it.b.y);
      ctx.strokeStyle = it.color || "#222";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if ((it.kind === "textbox-rect" || it.kind === "document-rect") && it.center) {
      const c = toLocal(it.center.x, it.center.y);
      const w = (it.widthM || 0) * itemScalePxPerSheetM;
      const h = (it.heightM || 0) * itemScalePxPerSheetM;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (it.rotationRad) ctx.rotate(it.rotationRad);
      ctx.fillStyle = it.kind === "document-rect" ? "rgba(120,120,120,0.18)" : "rgba(220,220,80,0.10)";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      if (it.label) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(it.label, 0, 0);
      }
      ctx.restore();
    }
  }

  ctx.restore();

  // Selection / Hover Frame (außerhalb des Clips, im rotierten Frame).
  if (isSelected || isHover) {
    ctx.save();
    ctx.translate(cs.x, cs.y);
    if (proj.rotation) ctx.rotate(proj.rotation);
    ctx.strokeStyle = isSelected ? "rgba(77,163,255,0.95)" : "rgba(77,163,255,0.55)";
    ctx.fillStyle = isSelected ? "rgba(77,163,255,0.06)" : "rgba(77,163,255,0.03)";
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.setLineDash(isSelected ? [6, 4] : [3, 4]);
    ctx.beginPath();
    ctx.rect(clipL, clipT, clipR - clipL, clipB - clipT);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    if (isSelected) {
      // Edge-Handles (Mitte der 4 Kanten) für Clip-Anpassung.
      const midPts = [
        { x: (clipL + clipR) / 2, y: clipT, side: "top" },
        { x: (clipL + clipR) / 2, y: clipB, side: "bottom" },
        { x: clipL, y: (clipT + clipB) / 2, side: "left" },
        { x: clipR, y: (clipT + clipB) / 2, side: "right" },
      ];
      for (const p of midPts) {
        ctx.fillStyle = "rgba(77,163,255,0.95)";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(p.x - 5, p.y - 5, 10, 10);
        ctx.fill();
        ctx.stroke();
      }
      // Eck-Handles (visuell für Skalieren über HUB)
      const corners = [
        { x: clipL, y: clipT },
        { x: clipR, y: clipT },
        { x: clipR, y: clipB },
        { x: clipL, y: clipB },
      ];
      for (const p of corners) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.strokeStyle = "rgba(77,163,255,0.95)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/**
 * Hit-Test einer Projektion an Bildschirmpunkt (sx,sy).
 * Liefert: 'body' | 'edge-left'/'edge-right'/'edge-top'/'edge-bottom' | null.
 */
export function hitTestProjection(
  cam: Camera,
  items: ProjectionItem[],
  proj: { x: number; y: number; rotation: number; scaleDen?: number; scale?: number; clip: { left: number; right: number; top: number; bottom: number } },
  sx: number,
  sy: number,
): "body" | "edge-left" | "edge-right" | "edge-top" | "edge-bottom" | null {
  const layout = computeProjectionLayout(items, proj);
  const cs = cam.worldToScreen(layout.centerPlanM.x, layout.centerPlanM.y);
  // Punkt ins lokale (rotierte) System rücktransformieren.
  const dx = sx - cs.x;
  const dy = sy - cs.y;
  const cosA = Math.cos(-proj.rotation);
  const sinA = Math.sin(-proj.rotation);
  const lx = dx * cosA - dy * sinA;
  const ly = dx * sinA + dy * cosA;
  const mmToPx = (mm: number) => (mm / 1000) * cam.scale;
  const L = mmToPx(layout.clipLocalMm.left);
  const R = mmToPx(layout.clipLocalMm.right);
  const T = mmToPx(layout.clipLocalMm.top);
  const B = mmToPx(layout.clipLocalMm.bottom);
  const tol = 8;
  // Edges zuerst (für Greifen am Rand)
  const nearLeft   = Math.abs(lx - L) <= tol && ly >= T - tol && ly <= B + tol;
  const nearRight  = Math.abs(lx - R) <= tol && ly >= T - tol && ly <= B + tol;
  const nearTop    = Math.abs(ly - T) <= tol && lx >= L - tol && lx <= R + tol;
  const nearBottom = Math.abs(ly - B) <= tol && lx >= L - tol && lx <= R + tol;
  if (nearLeft) return "edge-left";
  if (nearRight) return "edge-right";
  if (nearTop) return "edge-top";
  if (nearBottom) return "edge-bottom";
  if (lx >= L && lx <= R && ly >= T && ly <= B) return "body";
  return null;
}
