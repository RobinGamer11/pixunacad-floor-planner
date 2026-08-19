import { Defaults } from "./constants";
import { Vec2, v, projectPointToSegment, pointInPolygon } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { Segment, Hatch, Dimension, TextBox, FreeStroke } from "./Scene";
import { getDimensionGeometry } from "./dimensionGeometry";
import { pointInOrientedBox } from "./textGeometry";

type PickKind = "segment" | "hatch" | "dimension" | "textbox" | "free";

type PickedSource =
  | { kind: "segment"; obj: Segment }
  | { kind: "hatch"; obj: Hatch }
  | { kind: "dimension"; obj: Dimension }
  | { kind: "textbox"; obj: TextBox }
  | { kind: "free"; obj: FreeStroke };

/** Stil-Eigenschaften je Objektart, die die Pipette überträgt. */
const STYLE_KEYS: Record<PickKind, string[]> = {
  segment: ["color", "thicknessM", "opacity", "lineStyle", "gapM", "dashLengthM"],
  hatch: ["fillColor", "strokeColor", "fillAlphaPct", "strokeWidthPx", "pattern", "patternScale",
          "patternAngleDeg", "patternStretch", "patternSkewDeg", "patternColor"],
  dimension: ["textColor", "textSizePx", "lineColor", "decimals", "tickLengthM", "showExtensions",
              "textBgEnabled", "textBgColor", "textBgAlpha"],
  textbox: ["style"],
  free: ["color", "thicknessM", "opacity", "lineStyle", "gapM", "blobSpacingM", "blobSizeM", "smoothing"],
};

const snapshotStyle = (kind: PickKind, obj: any): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const k of STYLE_KEYS[kind]) {
    if (!(k in obj)) continue;
    const val = obj[k];
    out[k] = val && typeof val === "object" ? JSON.parse(JSON.stringify(val)) : val;
  }
  return out;
};

const applyStyle = (obj: any, snap: Record<string, any>) => {
  for (const k of Object.keys(snap)) {
    const val = snap[k];
    obj[k] = val && typeof val === "object" ? JSON.parse(JSON.stringify(val)) : val;
  }
};

/**
 * Pipette: erster Klick merkt sich die Quelle, jeder weitere Klick überträgt
 * deren Stil auf gleichartige Objekte — so lange, bis ESC gedrückt oder ein
 * anderes Werkzeug gewählt wird. Ein erneuter Klick auf ein bereits
 * verändertes Objekt setzt es auf seinen Ursprungsstil zurück.
 */
export class PipetteTool {
  app: CadApp;
  id = "pipette";
  hoverSource: PickedSource | null = null;
  /** Gemerkte Quelle für Quelle→Ziel-Übertragung. */
  pickedSource: PickedSource | null = null;
  private sourceSnap: Record<string, any> | null = null;
  /** Ursprungsstile der bereits veränderten Ziele (für Rücksetzen). */
  private originals = new Map<string, Record<string, any>>();

  constructor(app: CadApp) {
    this.app = app;
  }

  get hasSource() { return !!this.pickedSource; }

  clearSource() {
    this.pickedSource = null;
    this.sourceSnap = null;
    this.originals.clear();
  }

  activate() {
    this.hoverSource = null;
    this.clearSource();
    this.app.hub?.hide?.();
    this.app.pointEditMenu?.hide?.();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.hoverSource = null;
    this.clearSource();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.renderer.setHoverTextBoxId(null);
  }

  finish() {}

  getCursor() { return "crosshair"; }

  update(input: Input) {
    this.hoverSource = this._pickAt(input);
    this.app.renderer.setHoverSegmentId(this.hoverSource?.kind === "segment" ? this.hoverSource.obj.id : null);
    this.app.renderer.setHoverHatchId(this.hoverSource?.kind === "hatch" ? this.hoverSource.obj.id : null);
    this.app.renderer.setHoverTextBoxId(this.hoverSource?.kind === "textbox" ? this.hoverSource.obj.id : null);

    if (!input.clicked || !this.hoverSource) return;
    const hit = this.hoverSource;
    const hitId = (hit.obj as any).id as string;

    // 1) Noch keine Quelle → Quelle merken.
    if (!this.pickedSource || !this.sourceSnap) {
      this.pickedSource = hit;
      this.sourceSnap = snapshotStyle(hit.kind, hit.obj);
      return;
    }

    // 2) Klick auf ein bereits verändertes Ziel → Ursprungsstil zurücksetzen.
    const orig = this.originals.get(hitId);
    if (orig) {
      applyStyle(hit.obj, orig);
      this.originals.delete(hitId);
      this._touch();
      return;
    }

    // 3) Gleichartiges, anderes Objekt → Stil übertragen.
    if (hit.kind === this.pickedSource.kind && hitId !== (this.pickedSource.obj as any).id) {
      this.originals.set(hitId, snapshotStyle(hit.kind, hit.obj));
      applyStyle(hit.obj, this.sourceSnap);
      this._touch();
    }
  }

  private _touch() {
    try { (this.app as any).refreshLabelUI?.(); } catch {}
    try { (this.app as any)._changeDirty = true; } catch {}
    try { (this.app as any).pushHistory?.("Pipette"); } catch {}
  }

  private _pickAt(input: Input): PickedSource | null {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;
    const visible = (labelId: string) => {
      try { return this.app.labelManager.isVisible(labelId); } catch { return true; }
    };
    const distPx = (p: Vec2) => {
      const sp = cam.worldToScreen(p.x, p.y);
      return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    };

    // Textboxen (oberste zuerst)
    for (let i = this.app.scene.textBoxes.length - 1; i >= 0; i--) {
      const box = this.app.scene.textBoxes[i];
      if (!visible(box.labelId)) continue;
      if (pointInOrientedBox(mouseW, box)) return { kind: "textbox", obj: box };
    }

    // Linien
    let bestSeg: Segment | null = null;
    let bestSegPx = Infinity;
    for (const seg of this.app.scene.segments) {
      if (!visible(seg.labelId)) continue;
      const proj = projectPointToSegment(mouseW, seg.a, seg.b);
      const px = distPx(proj.q);
      if (px <= Defaults.hitPx && px < bestSegPx) { bestSegPx = px; bestSeg = seg; }
    }
    if (bestSeg) return { kind: "segment", obj: bestSeg };

    // Freihand-Striche
    let bestFree: FreeStroke | null = null;
    let bestFreePx = Infinity;
    for (const stroke of this.app.scene.freeStrokes) {
      if (!visible(stroke.labelId)) continue;
      for (let i = 1; i < stroke.points.length; i++) {
        const proj = projectPointToSegment(mouseW, stroke.points[i - 1], stroke.points[i]);
        const px = distPx(proj.q);
        if (px <= Defaults.hitPx && px < bestFreePx) { bestFreePx = px; bestFree = stroke; }
      }
    }
    if (bestFree) return { kind: "free", obj: bestFree };

    // Maßketten
    for (const dim of this.app.scene.dimensions) {
      if (!visible(dim.labelId)) continue;
      const g = getDimensionGeometry(dim);
      const proj = projectPointToSegment(mouseW, g.d1, g.d2);
      if (distPx(proj.q) <= Defaults.hitPx) return { kind: "dimension", obj: dim };
    }

    // Schraffuren
    for (const hatch of this.app.scene.hatches) {
      if (!visible(hatch.labelId)) continue;
      if (hatch.points.length >= 3 && pointInPolygon(mouseW, hatch.points)) return { kind: "hatch", obj: hatch };
    }

    return null;
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    let primary = "#4da3ff";
    try { primary = getComputedStyle(document.documentElement).getPropertyValue("--primary") || primary; } catch {}

    if (this.pickedSource) {
      ctx.save();
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      this._strokePickedShape(ctx, cam, this.pickedSource);
      ctx.restore();
    }

    if (this.hoverSource) {
      ctx.save();
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      this._strokePickedShape(ctx, cam, this.hoverSource);
      ctx.restore();
    }
  }

  private _strokePickedShape(ctx: CanvasRenderingContext2D, cam: any, src: PickedSource) {
    if (src.kind === "segment") {
      const a = cam.worldToScreen(src.obj.a.x, src.obj.a.y);
      const b = cam.worldToScreen(src.obj.b.x, src.obj.b.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (src.kind === "free") {
      ctx.beginPath();
      src.obj.points.forEach((p, i) => {
        const sp = cam.worldToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      });
      ctx.stroke();
    } else if (src.kind === "hatch") {
      ctx.beginPath();
      for (let i = 0; i < src.obj.points.length; i++) {
        const p = cam.worldToScreen(src.obj.points[i].x, src.obj.points[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.stroke();
    } else if (src.kind === "textbox") {
      const cx = src.obj.center.x, cy = src.obj.center.y;
      const w = src.obj.widthM, h = src.obj.heightM;
      const rot = src.obj.rotationRad || 0;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const corners = [
        { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
      ].map(p => cam.worldToScreen(cx + p.x * cs - p.y * sn, cy + p.x * sn + p.y * cs));
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath(); ctx.stroke();
    } else if (src.kind === "dimension") {
      const g = getDimensionGeometry(src.obj);
      const a = cam.worldToScreen(g.d1.x, g.d1.y);
      const b = cam.worldToScreen(g.d2.x, g.d2.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
}
