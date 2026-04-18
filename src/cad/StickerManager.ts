import { Vec2, v, polygonCentroid } from "./geometry";
import type { CadApp } from "./CadApp";
import type { ClipboardItem } from "./ClipboardManager";
import type { Segment, Hatch, Dimension, TextBox } from "./Scene";

/**
 * Sticker = wiederverwendbare Sammlung von Objekt-Snapshots, gespeichert
 * relativ zum Schwerpunkt. Beim Platzieren werden die Snapshots in echte
 * Scene-Objekte expandiert (Makro-Ansatz) — mit Translation + Rotation.
 *
 * Original-Bezeichnungs-IDs bleiben erhalten.
 */

export interface StickerDefinition {
  id: string;
  name: string;
  // Items in lokalen Koordinaten (Schwerpunkt = (0,0))
  items: ClipboardItem[];
  createdAt: number;
}

/* ---- Snapshot helpers (analog zu ClipboardManager.ts) ---- */
function snapSegment(s: Segment): ClipboardItem {
  return {
    kind: "segment",
    a: v(s.a.x, s.a.y), b: v(s.b.x, s.b.y),
    color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
  };
}
function snapHatch(h: Hatch): ClipboardItem {
  return {
    kind: "hatch",
    points: h.points.map(p => v(p.x, p.y)),
    fillColor: h.fillColor, strokeColor: h.strokeColor,
    fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
    labelId: h.labelId, areaLabel: { ...h.areaLabel },
  };
}
function snapDimension(d: Dimension): ClipboardItem {
  return {
    kind: "dimension",
    p1: v(d.p1.x, d.p1.y), p2: v(d.p2.x, d.p2.y),
    placementPoint: v(d.placementPoint.x, d.placementPoint.y),
    mode: d.mode, refDir: d.refDir ? v(d.refDir.x, d.refDir.y) : null,
    textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
    decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
    useFreeText: d.useFreeText, freeText: d.freeText,
    textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
    labelId: d.labelId,
  };
}
function snapTextBox(t: TextBox): ClipboardItem {
  return {
    kind: "textbox",
    center: v(t.center.x, t.center.y),
    widthM: t.widthM, heightM: t.heightM, rotationRad: t.rotationRad,
    html: t.html, style: { ...t.style }, labelId: t.labelId,
  };
}

function itemCenter(it: ClipboardItem): Vec2 {
  if (it.kind === "segment") return { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2 };
  if (it.kind === "hatch") return polygonCentroid(it.points);
  if (it.kind === "dimension") return { x: (it.p1.x + it.p2.x) / 2, y: (it.p1.y + it.p2.y) / 2 };
  return v(it.center.x, it.center.y);
}

function itemsCentroid(items: ClipboardItem[]): Vec2 {
  if (items.length === 0) return v(0, 0);
  let sx = 0, sy = 0;
  for (const it of items) { const c = itemCenter(it); sx += c.x; sy += c.y; }
  return v(sx / items.length, sy / items.length);
}

function translateItem(it: ClipboardItem, dx: number, dy: number): ClipboardItem {
  if (it.kind === "segment") return { ...it, a: { x: it.a.x + dx, y: it.a.y + dy }, b: { x: it.b.x + dx, y: it.b.y + dy } };
  if (it.kind === "hatch") return { ...it, points: it.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
  if (it.kind === "dimension") return {
    ...it,
    p1: { x: it.p1.x + dx, y: it.p1.y + dy },
    p2: { x: it.p2.x + dx, y: it.p2.y + dy },
    placementPoint: { x: it.placementPoint.x + dx, y: it.placementPoint.y + dy },
  };
  return { ...it, center: { x: it.center.x + dx, y: it.center.y + dy } };
}

/* ---- Rotation helpers ---- */
function rotPt(p: Vec2, cs: number, sn: number): Vec2 {
  return { x: p.x * cs - p.y * sn, y: p.x * sn + p.y * cs };
}

function rotateItem(it: ClipboardItem, angleRad: number): ClipboardItem {
  if (Math.abs(angleRad) < 1e-9) return it;
  const cs = Math.cos(angleRad), sn = Math.sin(angleRad);
  if (it.kind === "segment") return { ...it, a: rotPt(it.a, cs, sn), b: rotPt(it.b, cs, sn) };
  if (it.kind === "hatch") return { ...it, points: it.points.map(p => rotPt(p, cs, sn)) };
  if (it.kind === "dimension") {
    return {
      ...it,
      p1: rotPt(it.p1, cs, sn),
      p2: rotPt(it.p2, cs, sn),
      placementPoint: rotPt(it.placementPoint, cs, sn),
      refDir: it.refDir ? rotPt(it.refDir, cs, sn) : null,
    };
  }
  // textbox
  return {
    ...it,
    center: rotPt(it.center, cs, sn),
    rotationRad: (it.rotationRad || 0) + angleRad,
  };
}

/* ---- Build sticker from current selection or label-group ---- */
export function buildStickerFromSelection(app: CadApp, name: string): StickerDefinition | null {
  const items: ClipboardItem[] = [];

  const seg = app.getSelectedSegment();
  const hatch = app.getSelectedHatch();
  const dim = app.getSelectedDimension();
  const tb = app.getSelectedTextBox();

  if (seg) items.push(snapSegment(seg));
  else if (hatch) items.push(snapHatch(hatch));
  else if (dim) items.push(snapDimension(dim));
  else if (tb) items.push(snapTextBox(tb));
  else if (app.selectedLabelId) {
    for (const s of app.scene.getSegmentsByLabelId(app.selectedLabelId)) items.push(snapSegment(s));
    for (const h of app.scene.getHatchesByLabelId(app.selectedLabelId)) items.push(snapHatch(h));
    for (const d of app.scene.getDimensionsByLabelId(app.selectedLabelId)) items.push(snapDimension(d));
    for (const t of app.scene.getTextBoxesByLabelId(app.selectedLabelId)) items.push(snapTextBox(t));
  }

  if (items.length === 0) return null;

  // Re-Center auf Schwerpunkt -> lokale Koordinaten
  const c = itemsCentroid(items);
  const localItems = items.map(it => translateItem(it, -c.x, -c.y));

  return {
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name: name.trim() || "Sticker",
    items: localItems,
    createdAt: Date.now(),
  };
}

/* ---- Commit (expand into scene) ---- */
export function commitStickerAt(app: CadApp, def: StickerDefinition, mouseW: Vec2, rotationRad: number): number {
  let count = 0;
  for (const localIt of def.items) {
    const rotated = rotateItem(localIt, rotationRad);
    const it = translateItem(rotated, mouseW.x, mouseW.y);

    if (it.kind === "segment") {
      app.scene.createSegment({ x: it.a.x, y: it.a.y }, { x: it.b.x, y: it.b.y },
        { color: it.color, thicknessM: it.thicknessM, labelId: it.labelId });
    } else if (it.kind === "hatch") {
      app.scene.createHatch(it.points.map(p => ({ x: p.x, y: p.y })),
        { fillColor: it.fillColor, strokeColor: it.strokeColor,
          fillAlphaPct: it.fillAlphaPct, strokeWidthPx: it.strokeWidthPx,
          labelId: it.labelId, areaLabel: it.areaLabel });
    } else if (it.kind === "dimension") {
      app.scene.createDimension(
        { x: it.p1.x, y: it.p1.y },
        { x: it.p2.x, y: it.p2.y },
        { x: it.placementPoint.x, y: it.placementPoint.y },
        it.mode, it.refDir,
        { textColor: it.textColor, textSizePx: it.textSizePx, lineColor: it.lineColor,
          decimals: it.decimals, tickLengthM: it.tickLengthM, showExtensions: it.showExtensions,
          useFreeText: it.useFreeText, freeText: it.freeText,
          textBgEnabled: it.textBgEnabled, textBgColor: it.textBgColor, textBgAlpha: it.textBgAlpha,
          labelId: it.labelId });
    } else {
      app.scene.createTextBox(
        { x: it.center.x, y: it.center.y },
        it.widthM, it.heightM,
        { ...it.style, labelId: it.labelId },
        it.html, it.rotationRad);
    }
    count++;
  }
  return count;
}

/* ---- Preview transform: items -> world points for overlay drawing ---- */
export function transformedStickerItems(def: StickerDefinition, mouseW: Vec2, rotationRad: number): ClipboardItem[] {
  return def.items.map(it => translateItem(rotateItem(it, rotationRad), mouseW.x, mouseW.y));
}

/* ---- Export / Import ---- */
export function exportStickersToJson(stickers: StickerDefinition[]): string {
  return JSON.stringify({ version: 1, stickers }, null, 2);
}

export function importStickersFromJson(json: string): StickerDefinition[] {
  const data = JSON.parse(json);
  const arr = Array.isArray(data) ? data : (Array.isArray(data?.stickers) ? data.stickers : []);
  const out: StickerDefinition[] = [];
  for (const s of arr) {
    if (!s || !Array.isArray(s.items)) continue;
    out.push({
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()),
      name: typeof s.name === "string" ? s.name : "Sticker",
      items: s.items,
      createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
    });
  }
  return out;
}
