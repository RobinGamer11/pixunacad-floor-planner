import { Defaults, SelectionType } from "./constants";
import { Vec2, v, sub, add, polygonCentroid } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Segment, Hatch, Dimension, TextBox, AreaLabel, TextBoxStyle } from "./Scene";

interface SegmentSnap {
  kind: "segment"; a: Vec2; b: Vec2;
  color: string; thicknessM: number; labelId: string;
}
interface HatchSnap {
  kind: "hatch"; points: Vec2[];
  fillColor: string; strokeColor: string;
  fillAlphaPct: number; strokeWidthPx: number;
  labelId: string; areaLabel: AreaLabel;
}
interface DimensionSnap {
  kind: "dimension"; p1: Vec2; p2: Vec2; placementPoint: Vec2;
  mode: "parallel" | "diagonal"; refDir: Vec2 | null;
  textColor: string; textSizePx: number; lineColor: string;
  decimals: number; tickLengthM: number; showExtensions: boolean;
  useFreeText: boolean; freeText: string;
  textBgEnabled: boolean; textBgColor: string; textBgAlpha: number;
  labelId: string;
}
interface TextBoxSnap {
  kind: "textbox"; center: Vec2; widthM: number; heightM: number;
  rotationRad: number; html: string; style: Required<Omit<TextBoxStyle, "labelId">>;
  labelId: string;
}

export type ClipboardItem = SegmentSnap | HatchSnap | DimensionSnap | TextBoxSnap;

export interface Clipboard {
  items: ClipboardItem[];
  anchor: Vec2; // world-position used as origin for paste preview
}

/* ---- Snapshot helpers ---- */
function snapSegment(s: Segment): SegmentSnap {
  return { kind: "segment", a: v(s.a.x, s.a.y), b: v(s.b.x, s.b.y),
    color: s.color, thicknessM: s.thicknessM, labelId: s.labelId };
}
function snapHatch(h: Hatch): HatchSnap {
  return { kind: "hatch", points: h.points.map(p => v(p.x, p.y)),
    fillColor: h.fillColor, strokeColor: h.strokeColor,
    fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
    labelId: h.labelId, areaLabel: { ...h.areaLabel } };
}
function snapDimension(d: Dimension): DimensionSnap {
  return { kind: "dimension",
    p1: v(d.p1.x, d.p1.y), p2: v(d.p2.x, d.p2.y),
    placementPoint: v(d.placementPoint.x, d.placementPoint.y),
    mode: d.mode, refDir: d.refDir ? v(d.refDir.x, d.refDir.y) : null,
    textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
    decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
    useFreeText: d.useFreeText, freeText: d.freeText,
    textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
    labelId: d.labelId };
}
function snapTextBox(t: TextBox): TextBoxSnap {
  return { kind: "textbox",
    center: v(t.center.x, t.center.y),
    widthM: t.widthM, heightM: t.heightM, rotationRad: t.rotationRad,
    html: t.html, style: { ...t.style }, labelId: t.labelId };
}

/* ---- Bounding center for an item, used as anchor candidate ---- */
function itemCenter(it: ClipboardItem): Vec2 {
  if (it.kind === "segment") return { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2 };
  if (it.kind === "hatch") return polygonCentroid(it.points);
  if (it.kind === "dimension") return { x: (it.p1.x + it.p2.x) / 2, y: (it.p1.y + it.p2.y) / 2 };
  return v(it.center.x, it.center.y);
}

function itemsAnchor(items: ClipboardItem[]): Vec2 {
  if (items.length === 0) return v(0, 0);
  let sx = 0, sy = 0;
  for (const it of items) { const c = itemCenter(it); sx += c.x; sy += c.y; }
  return v(sx / items.length, sy / items.length);
}

/**
 * Build a clipboard from current selection.
 * - Single object selection -> that one
 * - Group (selectedLabelId, no single selection) -> all objects with that labelId
 */
export function buildClipboardFromSelection(app: CadApp): Clipboard | null {
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
  return { items, anchor: itemsAnchor(items) };
}

/* ---- Translation helpers ---- */
function translatedSegment(s: SegmentSnap, dx: number, dy: number): SegmentSnap {
  return { ...s, a: { x: s.a.x + dx, y: s.a.y + dy }, b: { x: s.b.x + dx, y: s.b.y + dy } };
}
function translatedHatch(h: HatchSnap, dx: number, dy: number): HatchSnap {
  return { ...h, points: h.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
}
function translatedDim(d: DimensionSnap, dx: number, dy: number): DimensionSnap {
  return { ...d,
    p1: { x: d.p1.x + dx, y: d.p1.y + dy },
    p2: { x: d.p2.x + dx, y: d.p2.y + dy },
    placementPoint: { x: d.placementPoint.x + dx, y: d.placementPoint.y + dy } };
}
function translatedText(t: TextBoxSnap, dx: number, dy: number): TextBoxSnap {
  return { ...t, center: { x: t.center.x + dx, y: t.center.y + dy } };
}

export function translatedItems(items: ClipboardItem[], dx: number, dy: number): ClipboardItem[] {
  return items.map(it => {
    if (it.kind === "segment") return translatedSegment(it, dx, dy);
    if (it.kind === "hatch") return translatedHatch(it, dx, dy);
    if (it.kind === "dimension") return translatedDim(it, dx, dy);
    return translatedText(it, dx, dy);
  });
}

/**
 * Commit clipboard (translated) into the scene. Returns count of created objects.
 */
export function commitClipboardAt(app: CadApp, clip: Clipboard, mouseW: Vec2): number {
  const dx = mouseW.x - clip.anchor.x;
  const dy = mouseW.y - clip.anchor.y;
  let count = 0;
  for (const it of clip.items) {
    if (it.kind === "segment") {
      app.scene.createSegment({ x: it.a.x + dx, y: it.a.y + dy }, { x: it.b.x + dx, y: it.b.y + dy },
        { color: it.color, thicknessM: it.thicknessM, labelId: it.labelId });
      count++;
    } else if (it.kind === "hatch") {
      app.scene.createHatch(it.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
        { fillColor: it.fillColor, strokeColor: it.strokeColor,
          fillAlphaPct: it.fillAlphaPct, strokeWidthPx: it.strokeWidthPx,
          labelId: it.labelId, areaLabel: it.areaLabel });
      count++;
    } else if (it.kind === "dimension") {
      app.scene.createDimension(
        { x: it.p1.x + dx, y: it.p1.y + dy },
        { x: it.p2.x + dx, y: it.p2.y + dy },
        { x: it.placementPoint.x + dx, y: it.placementPoint.y + dy },
        it.mode, it.refDir,
        { textColor: it.textColor, textSizePx: it.textSizePx, lineColor: it.lineColor,
          decimals: it.decimals, tickLengthM: it.tickLengthM, showExtensions: it.showExtensions,
          useFreeText: it.useFreeText, freeText: it.freeText,
          textBgEnabled: it.textBgEnabled, textBgColor: it.textBgColor, textBgAlpha: it.textBgAlpha,
          labelId: it.labelId });
      count++;
    } else {
      app.scene.createTextBox(
        { x: it.center.x + dx, y: it.center.y + dy },
        it.widthM, it.heightM,
        { ...it.style, labelId: it.labelId },
        it.html, it.rotationRad);
      count++;
    }
  }
  return count;
}
