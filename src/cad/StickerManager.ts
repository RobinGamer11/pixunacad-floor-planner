import { Vec2, v, polygonCentroid } from "./geometry";
import type { CadApp } from "./CadApp";
import type { ClipboardItem } from "./ClipboardManager";
import type { Segment, Hatch, Dimension, TextBox, Wall } from "./Scene";

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
function snapWall(w: Wall): ClipboardItem {
  return {
    kind: "wall",
    corners: w.corners.map(p => v(p.x, p.y)),
    wallKind: w.kind, thicknessM: w.thicknessM, referenceSide: w.referenceSide,
    color: w.color, fillColor: w.fillColor, priority: w.priority, labelId: w.labelId,
  };
}

function itemCenter(it: ClipboardItem): Vec2 {
  if (it.kind === "segment") return { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2 };
  if (it.kind === "hatch") return polygonCentroid(it.points);
  if (it.kind === "dimension") return { x: (it.p1.x + it.p2.x) / 2, y: (it.p1.y + it.p2.y) / 2 };
  if (it.kind === "wall") return polygonCentroid(it.corners);
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
  if (it.kind === "wall") return { ...it, corners: it.corners.map(p => ({ x: p.x + dx, y: p.y + dy })) };
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
  if (it.kind === "wall") return { ...it, corners: it.corners.map(p => rotPt(p, cs, sn)) };
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

  return _finalizeSticker(items, name);
}

/** Build sticker from explicit object id sets (used by StickerTool's multi-select). */
export interface StickerIdSet {
  segmentIds?: Set<string> | string[];
  hatchIds?: Set<string> | string[];
  dimensionIds?: Set<string> | string[];
  textBoxIds?: Set<string> | string[];
  wallIds?: Set<string> | string[];
}
export function buildStickerFromIds(app: CadApp, ids: StickerIdSet, name: string): StickerDefinition | null {
  const items: ClipboardItem[] = [];
  const segIds = Array.from(ids.segmentIds || []);
  const hatchIds = Array.from(ids.hatchIds || []);
  const dimIds = Array.from(ids.dimensionIds || []);
  const tbIds = Array.from(ids.textBoxIds || []);

  for (const id of segIds) { const s = app.scene.getSegmentById(id); if (s) items.push(snapSegment(s)); }
  for (const id of hatchIds) { const h = app.scene.getHatchById(id); if (h) items.push(snapHatch(h)); }
  for (const id of dimIds) { const d = app.scene.getDimensionById(id); if (d) items.push(snapDimension(d)); }
  for (const id of tbIds) { const t = app.scene.getTextBoxById(id); if (t) items.push(snapTextBox(t)); }
  for (const id of Array.from(ids.wallIds || [])) { const w = app.scene.getWallById(id); if (w) items.push(snapWall(w)); }

  return _finalizeSticker(items, name);
}

function _finalizeSticker(items: ClipboardItem[], name: string): StickerDefinition | null {
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

/* ---- Commit als Live-Instanz (NICHT mehr Makro-Expand) ---- */
export function commitStickerAt(app: CadApp, def: StickerDefinition, mouseW: Vec2, rotationRad: number, scale: number = 1): number {
  // Items werden tief kopiert, damit die Instanz unabhängig von der Definition lebt.
  const itemsCopy = def.items.map(it => JSON.parse(JSON.stringify(it)));
  app.scene.createStickerInstance({
    defId: def.id, name: def.name,
    items: itemsCopy,
    position: { x: mouseW.x, y: mouseW.y },
    rotationRad, scale,
    labelId: app.activeDrawLabelId,
  });
  return 1;
}

/* ---- Preview transform: items -> world points for overlay drawing ---- */
export function transformedStickerItems(def: StickerDefinition, mouseW: Vec2, rotationRad: number, scale: number = 1): ClipboardItem[] {
  return def.items.map(it => translateItem(rotateItem(scaleItem(it, scale), rotationRad), mouseW.x, mouseW.y));
}

/** Transform local items of an instance to world coordinates (für Renderer/Hit-Test). */
export function transformedInstanceItems(items: ClipboardItem[], position: Vec2, rotationRad: number, scale: number = 1): ClipboardItem[] {
  return items.map(it => translateItem(rotateItem(scaleItem(it, scale), rotationRad), position.x, position.y));
}

/** Skalierung von lokalen Punkten (Mittelpunkt = (0,0)). Stile (Linienstärke, Textgröße) bleiben fix. */
function scaleItem(it: ClipboardItem, s: number): ClipboardItem {
  if (Math.abs(s - 1) < 1e-9) return it;
  if (it.kind === "segment") return { ...it, a: { x: it.a.x * s, y: it.a.y * s }, b: { x: it.b.x * s, y: it.b.y * s } };
  if (it.kind === "hatch") return { ...it, points: it.points.map(p => ({ x: p.x * s, y: p.y * s })) };
  if (it.kind === "dimension") return {
    ...it,
    p1: { x: it.p1.x * s, y: it.p1.y * s },
    p2: { x: it.p2.x * s, y: it.p2.y * s },
    placementPoint: { x: it.placementPoint.x * s, y: it.placementPoint.y * s },
  };
  // Wand: Bezugslinie skalieren, Dicke bleibt maßstabsgetreu mitskaliert.
  if (it.kind === "wall") return { ...it, corners: it.corners.map(p => ({ x: p.x * s, y: p.y * s })), thicknessM: it.thicknessM * s };
  // textbox: skaliere center + Box-Dimensionen (Textgröße bleibt fix)
  return { ...it, center: { x: it.center.x * s, y: it.center.y * s }, widthM: it.widthM * s, heightM: it.heightM * s };

}

/** AABB der lokalen Items (für Bounding-Box-Größe; transformierbar via pos/rot/scale). */
export function localItemsBounds(items: ClipboardItem[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  for (const it of items) {
    if (it.kind === "segment") { acc(it.a.x, it.a.y); acc(it.b.x, it.b.y); }
    else if (it.kind === "hatch") { for (const p of it.points) acc(p.x, p.y); }
    else if (it.kind === "dimension") { acc(it.p1.x, it.p1.y); acc(it.p2.x, it.p2.y); }
    else if (it.kind === "wall") { const t = it.thicknessM / 2; for (const p of it.corners) { acc(p.x - t, p.y - t); acc(p.x + t, p.y + t); } }
    else if (it.kind === "textbox") {
      const w2 = it.widthM / 2, h2 = it.heightM / 2;
      acc(it.center.x - w2, it.center.y - h2);
      acc(it.center.x + w2, it.center.y + h2);
    }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
  return { minX, minY, maxX, maxY };
}

/** World-space corners (4 Punkte) der Bounding-Box einer Instanz (rotiert + skaliert + verschoben). */
export function instanceBoundingCornersWorld(items: ClipboardItem[], position: Vec2, rotationRad: number, scale: number): Vec2[] {
  const b = localItemsBounds(items);
  const cs = Math.cos(rotationRad), sn = Math.sin(rotationRad);
  const corners = [
    { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
  ];
  return corners.map(p => {
    const sx = p.x * scale, sy = p.y * scale;
    return { x: position.x + sx * cs - sy * sn, y: position.y + sx * sn + sy * cs };
  });
}

/** Ist Maus innerhalb der Instanz-Bounding-Box (rotiert+skaliert)? */
export function pointInInstance(items: ClipboardItem[], position: Vec2, rotationRad: number, scale: number, mouseWorld: Vec2): boolean {
  const cs = Math.cos(-rotationRad), sn = Math.sin(-rotationRad);
  const dx = mouseWorld.x - position.x, dy = mouseWorld.y - position.y;
  const lx = (dx * cs - dy * sn) / scale;
  const ly = (dx * sn + dy * cs) / scale;
  const b = localItemsBounds(items);
  return lx >= b.minX && lx <= b.maxX && ly >= b.minY && ly <= b.maxY;
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
