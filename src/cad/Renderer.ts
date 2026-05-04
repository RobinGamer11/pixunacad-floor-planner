import { Defaults, SelectionType } from "./constants";
import { Vec2, v, sub, add, mul, norm, perpLeft, clamp, rgbaFromHex, hexToRgba, polygonAreaAbs, polygonCentroid } from "./geometry";
import { Camera } from "./Camera";
import { Scene, Hatch, Dimension, TextBox, StickerInstance, DocumentObject, FreeStroke } from "./Scene";
import { smoothChaikin } from "./freeGeom";
import { LabelManager } from "./LabelManager";
import { getDimensionGeometry, type DimensionLike } from "./dimensionGeometry";
import { boxCornersWorld } from "./textGeometry";
import { drawRichTextBox } from "./textRichRenderer";
import { transformedInstanceItems, instanceBoundingCornersWorld } from "./StickerManager";
import { documentCornersWorld, documentCenterWorld } from "./documentGeometry";
import { getOrCreateDocMask } from "./documentMask";

export interface Selection {
  type: string;
  segmentId?: string;
  hatchId?: string;
  dimensionId?: string;
  textBoxId?: string;
  stickerInstanceId?: string;
  documentId?: string;
  handleIndex?: number | null;
  pointIndex?: number | null;
  /** Bei HATCH-Selection optional: Index der angeklickten Kante (für Edge-Offset-Hub). */
  edgeIndex?: number | null;
}

export interface Overlay {
  draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
}

export interface AreaLabelLayout {
  text: string;
  fontSizePx: number;
  rect: { x: number; y: number; w: number; h: number };
  handles: { x: number; y: number }[];
  centerWorld: Vec2;
  centerScreen: Vec2;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  scene: Scene;
  labels: LabelManager;
  vw = 1;
  vh = 1;
  overlay: Overlay | null = null;
  /** Andere Blätter, die als Transparentpause unter der aktiven Scene gezeichnet werden. */
  overlayScenes: { scene: Scene; mode: "stamp" | "tint"; color: string | null; opacity: number }[] = [];
  private _overlayCanvas: HTMLCanvasElement | null = null;
  selection: Selection | null = null;
  selectedLabelId: string | null = null;
  hoverSegmentId: string | null = null;
  hoverHatchId: string | null = null;
  hoverTextBoxId: string | null = null;
  /** Box currently being edited inline — skip canvas rendering for it. */
  editingTextBoxId: string | null = null;

  /**
   * Plan-Modus: zeichnet grauen Hintergrund + weißes Papierblatt (in mm).
   * Papier wird mit Mittelpunkt am Welt-Ursprung (0,0) gezeichnet.
   * Wenn null → normaler Zeichnungsmodus (Grid + weißer Hintergrund).
   */
  planMode: { widthMm: number; heightMm: number } | null = null;

  /** Hook: wird im Plan-Modus NACH dem Papier gezeichnet (Projektionen). */
  planOverlayDraw: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  /**
   * Plan-Tracing-Layer (Transparentpause zwischen Druckplänen).
   * Jeder Layer hat eine drawCb, die im Bildschirm-Pixelraum auf den
   * gegebenen ctx zeichnet (typischerweise Projektionen + Annotation-Scene
   * eines anderen Plans). Wird im Plan-Modus zwischen Papier und aktiver
   * Plan-Geometrie blittet (mit Tint + Opacity, wie Sheet-Overlays).
   */
  planTracingLayers: {
    drawCb: (ctx: CanvasRenderingContext2D) => void;
    mode: "stamp" | "tint";
    color: string | null;
    opacity: number;
  }[] = [];

  /**
   * Referenz-Pixel pro Meter für Stroke- und Font-Skalierung.
   * Im Sheet-Modus = Defaults.strokeWidthBaseScale (80). Im Plan-Modus wird
   * dieser Wert auf den Plan-Fit-Zoom gesetzt, damit Linienstärken/Texte
   * relativ zur Plangröße sinnvoll dimensioniert sind.
   */
  referencePxPerM: number = Defaults.strokeWidthBaseScale;

  constructor(ctx: CanvasRenderingContext2D, camera: Camera, scene: Scene, labels: LabelManager) {
    this.ctx = ctx;
    this.camera = camera;
    this.scene = scene;
    this.labels = labels;
  }

  setViewport(w: number, h: number) { this.vw = w; this.vh = h; }
  setSelection(selection: Selection | null) { this.selection = selection; }
  setSelectedLabelId(labelId: string | null) { this.selectedLabelId = labelId || null; }
  setHoverSegmentId(id: string | null) { this.hoverSegmentId = id || null; }
  setHoverHatchId(id: string | null) { this.hoverHatchId = id || null; }
  setHoverTextBoxId(id: string | null) { this.hoverTextBoxId = id || null; }
  setEditingTextBoxId(id: string | null) { this.editingTextBoxId = id || null; }

  private _segmentsBackToFront() {
    // Höher in der ID-Panel-Liste (kleinerer Index) = Vordergrund.
    // Wir zeichnen back-to-front, daher: höchster Index zuerst, Index 0 zuletzt.
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.segments]
      .filter(s => this.labels.isVisible(s.labelId))
      .sort((a, b) => (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0));
  }

  private _hatchesBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.hatches]
      .filter(h => this.labels.isVisible(h.labelId))
      .sort((a, b) => (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0));
  }

  private _scaledStrokePx(storedWidth: number): number {
    return this.scaledStrokePx(storedWidth);
  }

  /** Public: skaliert eine in Px gespeicherte Strichbreite proportional zur Referenz. */
  scaledStrokePx(storedWidth: number): number {
    const baseWidth = Math.max(0, storedWidth || 0);
    return baseWidth * (this.camera.scale / this.referencePxPerM);
  }

  /**
   * Wandelt eine in Welt-Metern gespeicherte Strichbreite (z. B. seg.thicknessM)
   * in Bildschirm-Pixel — proportional zur Referenz-Skala. So bleiben Linien
   * im Sheet- wie im Plan-Modus optisch ähnlich dick (referencePxPerM steuert).
   */
  private _segStrokePx(thicknessM: number): number {
    return this.segStrokePx(thicknessM);
  }

  /** Public: Welt-Meter Strichbreite → Bildschirm-Pixel (referencePxPerM-skaliert). */
  segStrokePx(thicknessM: number): number {
    const refRatio = Defaults.strokeWidthBaseScale / Math.max(1, this.referencePxPerM);
    return Math.max(0.5, (thicknessM || 0) * this.camera.scale * refRatio);
  }

  /** Faktor, um eine "in Welt-m gemeinte" Größe zu Plan-/Sheet-skalieren. */
  worldScaleFactor(): number {
    return Defaults.strokeWidthBaseScale / Math.max(1, this.referencePxPerM);
  }

  /** Cache: docId -> HTMLImageElement (lazy-load aus DataURL). */
  private _docImageCache = new Map<string, HTMLImageElement>();

  /**
   * Zeichnet ALLE Objekte gruppiert nach Label-ID, von Hintergrund zu Vordergrund.
   * Höher in der ID-Panel-Liste (kleinerer Index) = Vordergrund.
   * Innerhalb einer ID-Gruppe gilt die Sub-Reihenfolge:
   * Documents → Hatches → Segments → Dimensions → TextBoxes → Stickers.
   * Damit liegen z. B. Schraffuren einer höher gerankten ID über Linien einer niedriger gerankten ID.
   */
  private _drawByLabelOrder() {
    const order = this.labels.list();
    // Iteriere von hinten nach vorne (höchster Index zuerst = Hintergrund).
    for (let i = order.length - 1; i >= 0; i--) {
      const labelId = order[i].id;
      if (!this.labels.isVisible(labelId)) continue;
      this._drawDocumentsForLabel(labelId);
      this._drawHatchesForLabel(labelId);
      this._drawSegmentsForLabel(labelId);
      this._drawFreeStrokesForLabel(labelId);
      this._drawDimensionsForLabel(labelId);
      this._drawTextBoxesForLabel(labelId);
      this._drawStickerInstancesForLabel(labelId);
    }
    // Ruler-Guide (Lineal) immer ganz oben in der aktiven Scene zeichnen.
    this._drawRulerGuide();
  }

  render() {
    const ctx = this.ctx;
    if (this.planMode) {
      ctx.save();
      ctx.fillStyle = "hsl(220 9% 46%)"; // mid-gray
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
      this._drawPlanPaper();
      // Tracing-Pause anderer Druckpläne (unter aktiver Plan-Geometrie).
      this._drawPlanTracingLayers();
      // Plan-Projektionen (Step 4) — gezeichnet vom PlanController via Hook.
      if (this.planOverlayDraw) {
        try { this.planOverlayDraw(ctx); } catch (e) { console.error("planOverlayDraw error:", e); }
      }
    } else {
      ctx.save();
      ctx.fillStyle = "hsl(0 0% 100%)";
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
      this._drawGrid();
    }

    // Overlay-Sheets (Transparentpause) UNTER aktiver Scene zeichnen.
    this._drawOverlayScenes();

    this._drawByLabelOrder();
    this._drawHatchSelection();
    this._drawSegmentSelection();
    this._drawDimensionSelection();
    this._drawTextBoxSelection();
    this._drawStickerInstanceSelection();
    this._drawDocumentSelection();
    this._drawHoverSegmentPoints();

    this._drawStickerEditFrame();

    if (this.overlay && this.overlay.draw) {
      this.overlay.draw(ctx, this.camera);
    }
  }

  /**
   * Zeichnet das Papierblatt im Plan-Modus.
   * Konvention: 1 Welt-Einheit = 1 Meter; 1 mm = 0.001 m.
   * Papier ist mittig am Welt-Ursprung (0,0).
   */
  private _drawPlanPaper() {
    if (!this.planMode) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const wM = this.planMode.widthMm / 1000;
    const hM = this.planMode.heightMm / 1000;
    const tl = cam.worldToScreen(-wM / 2, -hM / 2);
    const br = cam.worldToScreen(wM / 2, hM / 2);
    const x = Math.min(tl.x, br.x);
    const y = Math.min(tl.y, br.y);
    const w = Math.abs(br.x - tl.x);
    const h = Math.abs(br.y - tl.y);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /** Rendert Overlay-Sheets in offscreen-Canvas, wendet Tint an und blittet mit Opacity. */
  private _drawOverlayScenes() {
    if (!this.overlayScenes || this.overlayScenes.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const wPx = Math.floor(this.vw * dpr);
    const hPx = Math.floor(this.vh * dpr);
    if (wPx <= 0 || hPx <= 0) return;

    if (!this._overlayCanvas) this._overlayCanvas = document.createElement("canvas");
    const off = this._overlayCanvas;
    if (off.width !== wPx) off.width = wPx;
    if (off.height !== hPx) off.height = hPx;

    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    const realCtx = this.ctx;
    const realScene = this.scene;
    const realSelection = this.selection;
    const realHoverSeg = this.hoverSegmentId;
    const realHoverHatch = this.hoverHatchId;
    const realHoverText = this.hoverTextBoxId;

    try {
      // Selection/Hover für Overlay deaktivieren — nicht editierbar.
      this.selection = null;
      this.hoverSegmentId = null;
      this.hoverHatchId = null;
      this.hoverTextBoxId = null;
      (this as any).ctx = offCtx;

      for (const ov of this.overlayScenes) {
        if (!ov || !ov.scene) continue;
        // Offscreen leeren
        offCtx.setTransform(1, 0, 0, 1, 0, 0);
        offCtx.clearRect(0, 0, wPx, hPx);
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Scene swap → bestehende _draw* nutzen
        this.scene = ov.scene;
        this._drawByLabelOrder();

        // Tint: Pixel-Daten einfärben (alpha behalten).
        if (ov.mode === "tint" && ov.color) {
          const rgb = this._hexToRgb(ov.color);
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          try {
            const img = offCtx.getImageData(0, 0, wPx, hPx);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] === 0) continue;
              d[i] = rgb.r;
              d[i + 1] = rgb.g;
              d[i + 2] = rgb.b;
            }
            offCtx.putImageData(img, 0, 0);
          } catch { /* CORS-frei: hier eigene Canvas → no-op */ }
          offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // Auf Hauptcanvas blitten mit Opacity.
        realCtx.save();
        realCtx.setTransform(1, 0, 0, 1, 0, 0);
        realCtx.globalAlpha = Math.max(0, Math.min(1, ov.opacity));
        realCtx.drawImage(off, 0, 0);
        realCtx.restore();
      }
    } finally {
      (this as any).ctx = realCtx;
      this.scene = realScene;
      this.selection = realSelection;
      this.hoverSegmentId = realHoverSeg;
      this.hoverHatchId = realHoverHatch;
      this.hoverTextBoxId = realHoverText;
    }
  }

  /**
   * Rendert Plan-Tracing-Layer (andere Druckpläne als Transparentpause).
   * Jeder Layer wird offscreen gezeichnet, optional eingefärbt und mit
   * Opacity auf den Hauptcanvas blittet.
   */
  private _drawPlanTracingLayers() {
    if (!this.planTracingLayers || this.planTracingLayers.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const wPx = Math.floor(this.vw * dpr);
    const hPx = Math.floor(this.vh * dpr);
    if (wPx <= 0 || hPx <= 0) return;

    if (!this._overlayCanvas) this._overlayCanvas = document.createElement("canvas");
    const off = this._overlayCanvas;
    if (off.width !== wPx) off.width = wPx;
    if (off.height !== hPx) off.height = hPx;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    const realCtx = this.ctx;
    try {
      (this as any).ctx = offCtx;
      for (const layer of this.planTracingLayers) {
        if (!layer || !layer.drawCb) continue;
        offCtx.setTransform(1, 0, 0, 1, 0, 0);
        offCtx.clearRect(0, 0, wPx, hPx);
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        try { layer.drawCb(offCtx); } catch (e) { console.error("planTracing draw error:", e); }
        if (layer.mode === "tint" && layer.color) {
          const rgb = this._hexToRgb(layer.color);
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          try {
            const img = offCtx.getImageData(0, 0, wPx, hPx);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] === 0) continue;
              d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b;
            }
            offCtx.putImageData(img, 0, 0);
          } catch { /* noop */ }
          offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        realCtx.save();
        realCtx.setTransform(1, 0, 0, 1, 0, 0);
        realCtx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
        realCtx.drawImage(off, 0, 0);
        realCtx.restore();
      }
    } finally {
      (this as any).ctx = realCtx;
    }
  }

  private _hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return { r: 120, g: 120, b: 120 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }


  private _getDocImage(doc: DocumentObject): HTMLImageElement | null {
    let img = this._docImageCache.get(doc.id);
    if (img && img.src === doc.src) {
      return img.complete ? img : null;
    }
    img = new Image();
    img.src = doc.src;
    img.onload = () => {
      // Trigger re-render when image becomes available
      // (next animation frame from CadApp's tick will pick it up)
    };
    this._docImageCache.set(doc.id, img);
    return null;
  }

  private _documentsBackToFront(): DocumentObject[] {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.documents]
      .filter(d => this.labels.isVisible(d.labelId))
      .sort((a, b) => (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0));
  }

  private _drawDocuments() {
    for (const doc of this._documentsBackToFront()) this._drawSingleDocument(doc);
  }

  private _drawDocumentsForLabel(labelId: string) {
    for (const doc of this.scene.documents) {
      if (doc.labelId !== labelId) continue;
      if (!this.labels.isVisible(doc.labelId)) continue;
      this._drawSingleDocument(doc);
    }
  }

  /** Cache: docId -> composite (image × mask) Canvas, key inkl. mask-rev. */
  private _docCompositeCache = new Map<string, { canvas: HTMLCanvasElement; srcRef: string; maskRef: HTMLCanvasElement | null }>();

  private _getDocComposite(doc: DocumentObject, img: HTMLImageElement): HTMLCanvasElement | null {
    // Wenn keine Maske → direkt Bild verwenden (kein Composite nötig).
    if (!doc.eraseMaskDataUrl && !doc._eraseMask) return null;
    // Maske lazy holen (initialisiert weiß)
    const mask = getOrCreateDocMask(doc, () => { /* re-render via tick */ });
    const cached = this._docCompositeCache.get(doc.id);
    if (cached && cached.srcRef === doc.src && cached.maskRef === mask && !doc._eraseMaskDirty) {
      return cached.canvas;
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) return null;
    const c = (cached && cached.canvas) || document.createElement("canvas");
    c.width = w; c.height = h;
    const cx = c.getContext("2d")!;
    cx.clearRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(mask, 0, 0, w, h);
    cx.globalCompositeOperation = "source-over";
    this._docCompositeCache.set(doc.id, { canvas: c, srcRef: doc.src, maskRef: mask });
    doc._eraseMaskDirty = false;
    return c;
  }

  private _drawSingleDocument(doc: DocumentObject) {
    const ctx = this.ctx;
    const cam = this.camera;
    const img = this._getDocImage(doc);
    const center = documentCenterWorld(doc);
    const cs = cam.worldToScreen(center.x, center.y);
    const wPx = doc.widthM * cam.scale;
    const hPx = doc.heightM * cam.scale;

    ctx.save();
    ctx.translate(cs.x, cs.y);
    if (doc.rotationRad) ctx.rotate(doc.rotationRad);
    if (img) {
      const composite = this._getDocComposite(doc, img);
      const drawSrc: CanvasImageSource = composite || img;
      ctx.drawImage(drawSrc, -wPx / 2, -hPx / 2, wPx, hPx);
    } else {
      ctx.fillStyle = "rgba(180,180,180,0.3)";
      ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Lade …", 0, 0);
    }
    ctx.restore();
  }

  private _drawDocumentSelection() {
    if (!this.selection || this.selection.type !== SelectionType.DOCUMENT) return;
    const doc = this.scene.getDocumentById(this.selection.documentId!);
    if (!doc || !this.labels.isVisible(doc.labelId)) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const corners = documentCornersWorld(doc);
    const sc = corners.map(c => cam.worldToScreen(c.x, c.y));
    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.fillStyle = "rgba(77,163,255,0.06)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sc[0].x, sc[0].y);
    for (let i = 1; i < sc.length; i++) ctx.lineTo(sc[i].x, sc[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // Eckhandles
    for (const p of sc) {
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    }
    // Center
    const center = cam.worldToScreen(doc.position.x + doc.widthM / 2, doc.position.y + doc.heightM / 2);
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(center.x, center.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** Dashed Frame um die Owner-Objekte einer aktuell im Edit-Mode befindlichen Sticker-Instanz. */
  private _drawStickerEditFrame() {
    const app: any = (this.scene as any);
    // Wir lesen den Edit-Owner anhand der Tags direkt aus den Scene-Objekten.
    let editOwnerId: string | null = null;
    for (const s of this.scene.segments) if (s._stickerEditOwnerId) { editOwnerId = s._stickerEditOwnerId; break; }
    if (!editOwnerId) for (const h of this.scene.hatches) if (h._stickerEditOwnerId) { editOwnerId = h._stickerEditOwnerId; break; }
    if (!editOwnerId) for (const d of this.scene.dimensions) if (d._stickerEditOwnerId) { editOwnerId = d._stickerEditOwnerId; break; }
    if (!editOwnerId) for (const t of this.scene.textBoxes) if (t._stickerEditOwnerId) { editOwnerId = t._stickerEditOwnerId; break; }
    if (!editOwnerId) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
    for (const s of this.scene.segments) if (s._stickerEditOwnerId === editOwnerId) { acc(s.a.x, s.a.y); acc(s.b.x, s.b.y); }
    for (const h of this.scene.hatches) if (h._stickerEditOwnerId === editOwnerId) for (const p of h.points) acc(p.x, p.y);
    for (const d of this.scene.dimensions) if (d._stickerEditOwnerId === editOwnerId) { acc(d.p1.x, d.p1.y); acc(d.p2.x, d.p2.y); }
    for (const t of this.scene.textBoxes) if (t._stickerEditOwnerId === editOwnerId) {
      const w2 = t.widthM / 2, h2 = t.heightM / 2;
      acc(t.center.x - w2, t.center.y - h2); acc(t.center.x + w2, t.center.y + h2);
    }
    if (!isFinite(minX)) return;

    const padPx = 14;
    const tl = this.camera.worldToScreen(minX, minY);
    const br = this.camera.worldToScreen(maxX, maxY);
    const x = Math.min(tl.x, br.x) - padPx;
    const y = Math.min(tl.y, br.y) - padPx;
    const w = Math.abs(br.x - tl.x) + padPx * 2;
    const h = Math.abs(br.y - tl.y) + padPx * 2;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255,140,0,0.95)";
    ctx.fillStyle = "rgba(255,140,0,0.06)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Label "Sticker bearbeiten"
    ctx.fillStyle = "rgba(255,140,0,0.95)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Sticker bearbeiten — Esc oder Klick außerhalb", x + 4, y - 4);
    ctx.restore();
  }

  /* ---------- Sticker Instances ---------- */
  private _stickersBackToFront(): StickerInstance[] {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.stickerInstances]
      .filter(s => this.labels.isVisible(s.labelId))
      .sort((a, b) => (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0));
  }

  private _drawStickerInstances() {
    for (const inst of this._stickersBackToFront()) this._drawSingleStickerInstance(inst);
  }

  private _drawStickerInstancesForLabel(labelId: string) {
    for (const inst of this.scene.stickerInstances) {
      if (inst.labelId !== labelId) continue;
      if (!this.labels.isVisible(inst.labelId)) continue;
      this._drawSingleStickerInstance(inst);
    }
  }

  private _drawSingleStickerInstance(inst: StickerInstance) {
    const items = transformedInstanceItems(inst.items as any, inst.position, inst.rotationRad, inst.scale);
    this._drawTransformedItems(this.ctx, this.camera, items);
  }

  private _drawTransformedItems(ctx: CanvasRenderingContext2D, cam: Camera, items: any[]) {
    for (const it of items) {
      if (it.kind === "segment") {
        const a = cam.worldToScreen(it.a.x, it.a.y);
        const b = cam.worldToScreen(it.b.x, it.b.y);
        ctx.save();
        ctx.strokeStyle = it.color || Defaults.lineColor;
        ctx.lineWidth = this._segStrokePx(it.thicknessM || Defaults.lineThicknessM);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      } else if (it.kind === "hatch") {
        if (!it.points || it.points.length < 3) continue;
        const fillAlpha = (it.fillAlphaPct ?? Defaults.hatchFillAlphaPct) / 100;
        ctx.save();
        ctx.beginPath();
        const p0 = cam.worldToScreen(it.points[0].x, it.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < it.points.length; i++) {
          const sp = cam.worldToScreen(it.points[i].x, it.points[i].y);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = rgbaFromHex(it.fillColor || Defaults.hatchFillColor, fillAlpha);
        ctx.fill();
        const strokePx = this._scaledStrokePx(it.strokeWidthPx ?? Defaults.hatchStrokePx);
        if (strokePx > 0) {
          ctx.strokeStyle = it.strokeColor || Defaults.hatchStrokeColor;
          ctx.lineWidth = strokePx;
          ctx.stroke();
        }
        ctx.restore();
      } else if (it.kind === "dimension") {
        this._drawSingleDimension(ctx, cam, it as any, false);
      } else if (it.kind === "textbox") {
        const cs = cam.worldToScreen(it.center.x, it.center.y);
        const widthPx = it.widthM * cam.scale;
        const heightPx = it.heightM * cam.scale;
        drawRichTextBox({
          ctx, centerScreenX: cs.x, centerScreenY: cs.y,
          widthPx, heightPx,
          rotationRad: it.rotationRad || 0,
          html: it.html || "",
          baseFontSizePx: (it.style?.fontSizePx || Defaults.textFontSizePx) * (cam.scale / this.referencePxPerM),
          baseColor: it.style?.textColor || Defaults.textColor,
          bgColor: it.style?.bgColor || Defaults.textBgColor,
          bgAlpha: ((it.style?.bgAlphaPct || 0)) / 100,
          align: it.style?.align || Defaults.textAlign,
          wrap: !!it.style?.wrap,
          borderEnabled: !!it.style?.borderEnabled,
          borderColor: it.style?.borderColor || Defaults.textBorderColor,
          borderWidthPx: it.style?.borderWidthPx ?? Defaults.textBorderWidthPx,
          paddingPx: 6,
        });
      }
    }
  }

  private _drawStickerInstanceSelection() {
    if (!this.selection || this.selection.type !== SelectionType.STICKER_INSTANCE) return;
    const inst = this.scene.getStickerInstanceById(this.selection.stickerInstanceId!);
    if (!inst) return;
    if (!this.labels.isVisible(inst.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const corners = instanceBoundingCornersWorld(inst.items as any, inst.position, inst.rotationRad, inst.scale);
    const sc = corners.map(c => cam.worldToScreen(c.x, c.y));

    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.fillStyle = "rgba(77,163,255,0.08)";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sc[0].x, sc[0].y);
    for (let i = 1; i < sc.length; i++) ctx.lineTo(sc[i].x, sc[i].y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);

    // Center handle (Position)
    const center = cam.worldToScreen(inst.position.x, inst.position.y);
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(center.x, center.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Corner handles (visuell, Skalierung über Hub)
    for (const p of sc) {
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private _drawGrid() {
    const ctx = this.ctx;
    const cam = this.camera;
    const tl = cam.screenToWorld(0, 0);
    const br = cam.screenToWorld(this.vw, this.vh);

    const minX = Math.floor(Math.min(tl.x, br.x));
    const maxX = Math.ceil(Math.max(tl.x, br.x));
    const minY = Math.floor(Math.min(tl.y, br.y));
    const maxY = Math.ceil(Math.max(tl.y, br.y));

    const pxPerM = cam.scale;
    const skip = pxPerM < 35 ? 2 : pxPerM < 18 ? 4 : 1;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.06)";

    ctx.beginPath();
    for (let x = minX; x <= maxX; x += skip) {
      const s = cam.worldToScreen(x, 0);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, this.vh);
    }
    for (let y = minY; y <= maxY; y += skip) {
      const s = cam.worldToScreen(0, y);
      ctx.moveTo(0, s.y);
      ctx.lineTo(this.vw, s.y);
    }
    ctx.stroke();

    const o = cam.worldToScreen(0, 0);
    ctx.strokeStyle = "rgba(77,163,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(o.x, 0);
    ctx.lineTo(o.x, this.vh);
    ctx.moveTo(0, o.y);
    ctx.lineTo(this.vw, o.y);
    ctx.stroke();
    ctx.restore();
  }

  private _drawSegments() {
    for (const seg of this._segmentsBackToFront()) this._drawSingleSegment(seg);
  }

  private _drawSegmentsForLabel(labelId: string) {
    for (const seg of this.scene.segments) {
      if (seg.labelId !== labelId) continue;
      if (!this.labels.isVisible(seg.labelId)) continue;
      this._drawSingleSegment(seg);
    }
  }

  private _drawSingleSegment(seg: { a: Vec2; b: Vec2; color?: string; thicknessM: number; labelId: string }) {
    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);
    const isGroupSel = this.selectedLabelId && seg.labelId === this.selectedLabelId;

    ctx.save();
    ctx.strokeStyle = seg.color || Defaults.lineColor;
    ctx.lineWidth = this._segStrokePx(seg.thicknessM);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (isGroupSel) {
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = Math.max(4, this._segStrokePx(seg.thicknessM) + 1.4);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawHatches() {
    for (const hatch of this._hatchesBackToFront()) this._drawSingleHatch(hatch);
  }

  private _drawHatchesForLabel(labelId: string) {
    for (const hatch of this.scene.hatches) {
      if (hatch.labelId !== labelId) continue;
      if (!this.labels.isVisible(hatch.labelId)) continue;
      this._drawSingleHatch(hatch);
    }
  }

  private _drawSingleHatch(hatch: Hatch) {
    if (hatch.points.length < 3) return;
    const ctx = this.ctx;
    const cam = this.camera;

    const isHovered = this.hoverHatchId === hatch.id;
    const isSelected = this.selection && this.selection.hatchId === hatch.id;
    const fillAlpha = (hatch.fillAlphaPct ?? Defaults.hatchFillAlphaPct) / 100;
    const fillCol = rgbaFromHex(hatch.fillColor, fillAlpha);
    const strokeCol = hatch.strokeColor || Defaults.hatchStrokeColor;
    const strokePx = this._scaledStrokePx(hatch.strokeWidthPx);

    ctx.save();

    ctx.beginPath();
    const p0 = cam.worldToScreen(hatch.points[0].x, hatch.points[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < hatch.points.length; i++) {
      const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
      ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();

    // Holes (carved-out inner loops) → evenodd Fill schneidet sie aus
    const holes = hatch.holes || [];
    for (const loop of holes) {
      if (!loop || loop.length < 3) continue;
      const h0 = cam.worldToScreen(loop[0].x, loop[0].y);
      ctx.moveTo(h0.x, h0.y);
      for (let i = 1; i < loop.length; i++) {
        const hp = cam.worldToScreen(loop[i].x, loop[i].y);
        ctx.lineTo(hp.x, hp.y);
      }
      ctx.closePath();
    }

    ctx.fillStyle = fillCol;
    ctx.fill("evenodd");

    if (strokePx > 0) {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = strokePx;
      ctx.stroke();
    }

    if (isHovered && !isSelected) {
      ctx.strokeStyle = "rgba(77,163,255,0.55)";
      ctx.lineWidth = Math.max(1.5, strokePx + 1.2);
      ctx.stroke();
    }

    this._drawAreaLabel(hatch, !!isSelected);
    ctx.restore();
  }

  _getAreaLabelLayout(hatch: Hatch): AreaLabelLayout | null {
    if (!hatch || !hatch.areaLabel?.show || hatch.points.length < 3) return null;

    const ctx = this.ctx;
    const cam = this.camera;

    const areaM2 = polygonAreaAbs(hatch.points);
    const text = `${areaM2.toFixed(2)} m²`;
    const baseFontSize = clamp(hatch.areaLabel.fontSizePx ?? Defaults.areaFontSizePx, 8, 72);
    const zoomFactor = cam.scale / this.referencePxPerM;
    const fontSizePx = Math.max(1, baseFontSize * zoomFactor);
    const padX = 8 * zoomFactor, padY = 5 * zoomFactor;

    ctx.save();
    ctx.font = `${fontSizePx}px system-ui, Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    ctx.restore();

    const textW = metrics.width;
    const boxW = textW + padX * 2;
    const boxH = fontSizePx + padY * 2;

    const polyCenter = polygonCentroid(hatch.points);
    const centerWorld = v(polyCenter.x + (hatch.areaLabel.offsetX || 0), polyCenter.y + (hatch.areaLabel.offsetY || 0));
    const centerScreen = cam.worldToScreen(centerWorld.x, centerWorld.y);

    const rect = { x: centerScreen.x - boxW / 2, y: centerScreen.y - boxH / 2, w: boxW, h: boxH };
    const handles = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];

    return { text, fontSizePx, rect, handles, centerWorld, centerScreen };
  }

  private _drawAreaLabel(hatch: Hatch, isSelected: boolean) {
    const layout = this._getAreaLabelLayout(hatch);
    if (!layout) return;

    const ctx = this.ctx;
    const bg = rgbaFromHex(hatch.areaLabel.bgColor || Defaults.areaBgColor, (hatch.areaLabel.bgAlphaPct ?? Defaults.areaBgAlphaPct) / 100);
    const textColor = hatch.areaLabel.textColor || Defaults.areaTextColor;

    ctx.save();
    ctx.fillStyle = bg;
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(layout.rect.x, layout.rect.y, layout.rect.w, layout.rect.h);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = `${layout.fontSizePx}px system-ui, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(layout.text, layout.centerScreen.x, layout.centerScreen.y + 0.5);

    if (isSelected) {
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      for (const h of layout.handles) {
        ctx.beginPath();
        ctx.rect(h.x - 4, h.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private _drawHatchSelection() {
    if (!this.selection || !this.selection.hatchId) return;
    const hatch = this.scene.getHatchById(this.selection.hatchId);
    if (!hatch || hatch.points.length < 2) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const scaledStrokePx = this._scaledStrokePx(hatch.strokeWidthPx);

    ctx.save();
    if (hatch.points.length >= 3) {
      // Blue fill: outer minus holes (evenodd)
      ctx.beginPath();
      const p0 = cam.worldToScreen(hatch.points[0].x, hatch.points[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < hatch.points.length; i++) {
        const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      const holes = hatch.holes || [];
      for (const loop of holes) {
        if (!loop || loop.length < 3) continue;
        const h0 = cam.worldToScreen(loop[0].x, loop[0].y);
        ctx.moveTo(h0.x, h0.y);
        for (let i = 1; i < loop.length; i++) {
          const hp = cam.worldToScreen(loop[i].x, loop[i].y);
          ctx.lineTo(hp.x, hp.y);
        }
        ctx.closePath();
      }
      ctx.fillStyle = "rgba(77,163,255,0.12)";
      ctx.fill("evenodd");

      // Outer outline
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < hatch.points.length; i++) {
        const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = Math.max(1.5, scaledStrokePx + 1.6);
      ctx.stroke();

      // Hole outlines (sichtbar als Kanten)
      for (const loop of holes) {
        if (!loop || loop.length < 3) continue;
        ctx.beginPath();
        const h0 = cam.worldToScreen(loop[0].x, loop[0].y);
        ctx.moveTo(h0.x, h0.y);
        for (let i = 1; i < loop.length; i++) {
          const hp = cam.worldToScreen(loop[i].x, loop[i].y);
          ctx.lineTo(hp.x, hp.y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    for (let i = 0; i < hatch.points.length; i++) {
      const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
      ctx.fillStyle = "rgba(77,163,255,0.12)";
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (this.selection.type === SelectionType.POINT && this.selection.pointIndex === i) {
        ctx.fillStyle = "rgba(77,163,255,0.95)";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private _drawSegmentSelection() {
    if (!this.selection || !this.selection.segmentId) return;
    const seg = this.scene.getSegmentById(this.selection.segmentId);
    if (!seg) return;
    if (!this.labels.isVisible(seg.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);
    const segScreenThickness = this._segStrokePx(seg.thicknessM);

    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = Math.max(segScreenThickness + 1.6, 4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = "rgba(77,163,255,0.12)";
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (this.selection.type === SelectionType.POINT) {
      const p = this.selection.pointIndex === 0 ? seg.a : seg.b;
      const sp = cam.worldToScreen(p.x, p.y);
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawHoverSegmentPoints() {
    if (!this.hoverSegmentId) return;
    if (this.selection && this.selection.segmentId === this.hoverSegmentId) return;

    const seg = this.scene.getSegmentById(this.hoverSegmentId);
    if (!seg) return;
    if (!this.labels.isVisible(seg.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);

    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.12)";
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(a.x, a.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /* ---------- Dimensions ---------- */

  private _dimensionsBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.dimensions]
      .filter(d => this.labels.isVisible(d.labelId))
      .sort((a, b) => (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0));
  }

  private _drawDimensions() {
    for (const dim of this._dimensionsBackToFront()) {
      this._drawSingleDimension(this.ctx, this.camera, dim, false);
    }
  }

  private _drawDimensionsForLabel(labelId: string) {
    for (const dim of this.scene.dimensions) {
      if (dim.labelId !== labelId) continue;
      if (!this.labels.isVisible(dim.labelId)) continue;
      this._drawSingleDimension(this.ctx, this.camera, dim, false);
    }
  }

  /**
   * Draws a dimension. Public so MeasureTool can render previews using the same logic.
   * `isPreview` slightly reduces line widths for the live preview.
   */
  _drawSingleDimension(ctx: CanvasRenderingContext2D, cam: Camera, dim: DimensionLike & {
    textColor?: string; textSizePx?: number; lineColor?: string; tickLengthM?: number;
    showExtensions?: boolean; useFreeText?: boolean; freeText?: string; decimals?: number;
    textBgEnabled?: boolean; textBgColor?: string; textBgAlpha?: number;
  }, isPreview = false) {
    const g = getDimensionGeometry(dim);

    const p1 = cam.worldToScreen(g.ext1a.x, g.ext1a.y);
    const p2 = cam.worldToScreen(g.ext1b.x, g.ext1b.y);
    const p3 = cam.worldToScreen(g.ext2a.x, g.ext2a.y);
    const p4 = cam.worldToScreen(g.ext2b.x, g.ext2b.y);
    const d1 = cam.worldToScreen(g.d1.x, g.d1.y);
    const d2 = cam.worldToScreen(g.d2.x, g.d2.y);
    const mid = cam.worldToScreen(g.mid.x, g.mid.y);

    ctx.save();
    ctx.strokeStyle = dim.lineColor || Defaults.measureLineColor;
    ctx.lineWidth = isPreview ? 1.2 : 1.3;

    ctx.beginPath();
    if (dim.showExtensions) {
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    }
    ctx.moveTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.stroke();

    const tickDir = norm(sub(g.d2, g.d1));
    const tickN = perpLeft(tickDir);
    const tickLen = dim.tickLengthM || Defaults.measureTickLengthM;

    const t1aP = add(g.d1, mul(tickN, tickLen));
    const t1bP = sub(g.d1, mul(tickN, tickLen));
    const t2aP = add(g.d2, mul(tickN, tickLen));
    const t2bP = sub(g.d2, mul(tickN, tickLen));
    const t1a = cam.worldToScreen(t1aP.x, t1aP.y);
    const t1b = cam.worldToScreen(t1bP.x, t1bP.y);
    const t2a = cam.worldToScreen(t2aP.x, t2aP.y);
    const t2b = cam.worldToScreen(t2bP.x, t2bP.y);

    ctx.beginPath();
    ctx.moveTo(t1a.x, t1a.y); ctx.lineTo(t1b.x, t1b.y);
    ctx.moveTo(t2a.x, t2a.y); ctx.lineTo(t2b.x, t2b.y);
    ctx.stroke();

    // Text + background — proportional to dimension via reference scale
    const text = g.text || "";
    const zoomFactor = cam.scale / this.referencePxPerM;
    const baseSize = dim.textSizePx || Defaults.measureTextSizePx;
    const fontPx = Math.max(1, baseSize * zoomFactor);

    const screenAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
    const normalizedAngle = (screenAngle > Math.PI / 2 || screenAngle < -Math.PI / 2)
      ? screenAngle + Math.PI
      : screenAngle;

    const tickOffsetPx = (dim.tickLengthM || Defaults.measureTickLengthM) * cam.scale;
    const textOffsetPx = Math.max(fontPx * 0.95, tickOffsetPx * 0.9 + fontPx * 0.35);

    ctx.translate(mid.x, mid.y);
    ctx.rotate(normalizedAngle);
    ctx.font = `${fontPx}px system-ui, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.7;
    const descent = metrics.actualBoundingBoxDescent || fontPx * 0.3;
    const textHeight = ascent + descent;
    const padX = Math.max(4, fontPx * 0.45);
    const padY = Math.max(2, fontPx * 0.22);
    const textY = -textOffsetPx;

    if (dim.textBgEnabled) {
      ctx.fillStyle = hexToRgba(dim.textBgColor || Defaults.measureTextBgColor, dim.textBgAlpha ?? Defaults.measureTextBgAlpha);
      ctx.fillRect(-textWidth / 2 - padX, textY - textHeight / 2 - padY, textWidth + padX * 2, textHeight + padY * 2);
    }

    ctx.fillStyle = dim.textColor || Defaults.measureTextColor;
    ctx.fillText(text, 0, textY);
    ctx.restore();
  }

  private _drawDimensionSelection() {
    if (!this.selection || this.selection.type !== SelectionType.DIMENSION) return;
    const dim = this.scene.getDimensionById((this.selection as any).dimensionId);
    if (!dim) return;
    if (!this.labels.isVisible(dim.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const g = getDimensionGeometry(dim);
    const a = cam.worldToScreen(g.d1.x, g.d1.y);
    const b = cam.worldToScreen(g.d2.x, g.d2.y);

    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Endpoint handles
    ctx.fillStyle = "rgba(77,163,255,0.12)";
    ctx.lineWidth = 2;
    for (const ep of [g.ext1a, g.ext2a]) {
      const sp = cam.worldToScreen(ep.x, ep.y);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- TextBoxes ---------- */

  private _textBoxesBackToFront(): TextBox[] {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.textBoxes]
      .filter(t => this.labels.isVisible(t.labelId))
      .sort((a, b) => (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0));
  }

  private _drawTextBoxes() {
    for (const box of this._textBoxesBackToFront()) this._drawSingleTextBox(box);
    this._drawTextBoxHoverOutline();
  }

  private _drawTextBoxesForLabel(labelId: string) {
    for (const box of this.scene.textBoxes) {
      if (box.labelId !== labelId) continue;
      if (!this.labels.isVisible(box.labelId)) continue;
      this._drawSingleTextBox(box);
    }
    // Hover-Outline gehört global zur Vordergrund-Phase: am Ende rendern.
    if (this._isLastVisibleLabel(labelId)) this._drawTextBoxHoverOutline();
  }

  private _isLastVisibleLabel(labelId: string): boolean {
    const order = this.labels.list();
    for (let i = 0; i < order.length; i++) {
      if (this.labels.isVisible(order[i].id)) return order[i].id === labelId;
    }
    return false;
  }

  private _drawSingleTextBox(box: TextBox) {
    if (this.editingTextBoxId === box.id) return;
    const cam = this.camera;
    const cs = cam.worldToScreen(box.center.x, box.center.y);
    const widthPx = box.widthM * cam.scale;
    const heightPx = box.heightM * cam.scale;
    drawRichTextBox({
      ctx: this.ctx,
      centerScreenX: cs.x,
      centerScreenY: cs.y,
      widthPx, heightPx,
      rotationRad: box.rotationRad,
      html: box.html || "",
      baseFontSizePx: box.style.fontSizePx * (cam.scale / this.referencePxPerM),
      baseColor: box.style.textColor,
      bgColor: box.style.bgColor,
      bgAlpha: (box.style.bgAlphaPct || 0) / 100,
      align: box.style.align,
      wrap: box.style.wrap,
      borderEnabled: box.style.borderEnabled,
      borderColor: box.style.borderColor,
      borderWidthPx: box.style.borderWidthPx,
      paddingPx: 6,
    });
  }

  private _drawTextBoxHoverOutline() {
    if (this.hoverTextBoxId && (!this.selection || (this.selection as any).textBoxId !== this.hoverTextBoxId)) {
      const box = this.scene.getTextBoxById(this.hoverTextBoxId);
      if (box && this.labels.isVisible(box.labelId)) this._strokeBoxOutline(box, "rgba(77,163,255,0.55)", 2);
    }
  }

  private _strokeBoxOutline(box: TextBox, strokeStyle: string, lineWidth: number) {
    const ctx = this.ctx;
    const cam = this.camera;
    const corners = boxCornersWorld(box);
    ctx.save();
    ctx.beginPath();
    const p0 = cam.worldToScreen(corners[0].x, corners[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < corners.length; i++) {
      const sp = cam.worldToScreen(corners[i].x, corners[i].y);
      ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  private _drawTextBoxSelection() {
    if (!this.selection || (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE)) return;
    const id = (this.selection as any).textBoxId;
    if (!id) return;
    const box = this.scene.getTextBoxById(id);
    if (!box || !this.labels.isVisible(box.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    this._strokeBoxOutline(box, "rgba(77,163,255,0.95)", 2);

    const corners = boxCornersWorld(box);
    const activeIdx = this.selection.handleIndex ?? -1;
    for (let i = 0; i < corners.length; i++) {
      const sp = cam.worldToScreen(corners[i].x, corners[i].y);
      ctx.save();
      ctx.fillStyle = (i === activeIdx) ? "rgba(77,163,255,0.95)" : "rgba(77,163,255,0.12)";
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- FreeStrokes ----

  private _freeStrokesForLabel(labelId: string): FreeStroke[] {
    return this.scene.freeStrokes.filter(s => s.labelId === labelId && this.labels.isVisible(s.labelId));
  }

  private _dashForFreeStroke(s: FreeStroke): number[] {
    const cam = this.camera;
    const px = cam.scale;
    if (s.lineStyle === "dashed") {
      return [Math.max(s.gapM * 1.5, 0.001) * px, s.gapM * px];
    }
    if (s.lineStyle === "dotted") {
      return [0.001 * px, s.gapM * px];
    }
    if (s.lineStyle === "dashdot") {
      const dashLen = Math.max(s.gapM * 1.5, 0.001) * px;
      const gap = s.gapM * px;
      return [dashLen, gap, 0.001 * px, gap];
    }
    return [];
  }

  private _renderPointsForFreeStroke(s: FreeStroke): Vec2[] {
    if (!s.points || s.points.length < 2) return s.points || [];
    if (!s.smoothing) return s.points;
    return smoothChaikin(s.points, 2);
  }

  private _drawFreeStrokeBlobs(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const spacingPx = Math.max(2, s.blobSpacingM * cam.scale);
    const radiusPx = Math.max(1, (s.blobSizeM / 2) * cam.scale);
    ctx.save();
    ctx.fillStyle = rgbaFromHex(s.color, s.opacity);
    // Stamp entlang der Pfadlänge
    let acc = 0;
    let prev = cam.worldToScreen(pts[0].x, pts[0].y);
    ctx.beginPath(); ctx.arc(prev.x, prev.y, radiusPx, 0, Math.PI * 2); ctx.fill();
    for (let i = 1; i < pts.length; i++) {
      const cur = cam.worldToScreen(pts[i].x, pts[i].y);
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-3) { prev = cur; continue; }
      let used = 0;
      while (acc + (segLen - used) >= spacingPx) {
        const need = spacingPx - acc;
        used += need;
        const t = used / segLen;
        const px = prev.x + dx * t;
        const py = prev.y + dy * t;
        ctx.beginPath(); ctx.arc(px, py, radiusPx, 0, Math.PI * 2); ctx.fill();
        acc = 0;
      }
      acc += segLen - used;
      prev = cur;
    }
    ctx.restore();
  }

  /** Cache: Bildstempel DataURL → HTMLImageElement. */
  private _stampImageCache = new Map<string, HTMLImageElement>();
  private _getStampImage(src: string): HTMLImageElement | null {
    let img = this._stampImageCache.get(src);
    if (img) return img.complete && img.naturalWidth > 0 ? img : null;
    img = new Image();
    img.src = src;
    this._stampImageCache.set(src, img);
    return null;
  }

  private _drawFreeStrokeImage(s: FreeStroke) {
    if (!s.imageSrc) return;
    const img = this._getStampImage(s.imageSrc);
    if (!img) return; // wird nach onload re-rendert (next tick)
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const spacingPx = Math.max(2, s.imageSpacingM * cam.scale);
    // Bild-Größe in Px: längere Kante = imageSizeM
    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const longerPx = s.thicknessM * cam.scale;
    let drawW: number, drawH: number;
    if (aspect >= 1) { drawW = longerPx; drawH = longerPx / aspect; }
    else { drawH = longerPx; drawW = longerPx * aspect; }

    ctx.save();
    ctx.globalAlpha = s.opacity;
    let acc = 0;
    let prev = cam.worldToScreen(pts[0].x, pts[0].y);
    let prevAngle = 0;
    // Erster Stempel
    if (pts.length >= 2) {
      const next = cam.worldToScreen(pts[1].x, pts[1].y);
      prevAngle = Math.atan2(next.y - prev.y, next.x - prev.x);
    }
    this._stampImageAt(img, prev.x, prev.y, drawW, drawH, s.imageRotateAlongPath ? prevAngle : 0);
    for (let i = 1; i < pts.length; i++) {
      const cur = cam.worldToScreen(pts[i].x, pts[i].y);
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-3) { prev = cur; continue; }
      const angle = Math.atan2(dy, dx);
      let used = 0;
      while (acc + (segLen - used) >= spacingPx) {
        const need = spacingPx - acc;
        used += need;
        const t = used / segLen;
        const px = prev.x + dx * t;
        const py = prev.y + dy * t;
        this._stampImageAt(img, px, py, drawW, drawH, s.imageRotateAlongPath ? angle : 0);
        acc = 0;
      }
      acc += segLen - used;
      prev = cur;
    }
    ctx.restore();
  }

  private _stampImageAt(img: HTMLImageElement, x: number, y: number, w: number, h: number, angle: number) {
    const ctx = this.ctx;
    if (angle === 0) {
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  private _drawSingleFreeStroke(s: FreeStroke, colorOverride: string | null = null, widthOverridePx: number | null = null) {
    if (!s.points || s.points.length < 2) return;
    if (s.lineStyle === "blob" && colorOverride === null) {
      this._drawFreeStrokeBlobs(s);
      return;
    }
    if (s.lineStyle === "image" && colorOverride === null) {
      this._drawFreeStrokeImage(s);
      return;
    }
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    ctx.save();
    ctx.strokeStyle = colorOverride || rgbaFromHex(s.color, s.opacity);
    ctx.lineWidth = widthOverridePx != null ? widthOverridePx : this.segStrokePx(s.thicknessM);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(this._dashForFreeStroke(s));
    const p0 = cam.worldToScreen(pts[0].x, pts[0].y);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = cam.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawFreeStrokesForLabel(labelId: string) {
    for (const s of this._freeStrokesForLabel(labelId)) this._drawSingleFreeStroke(s);
  }

  /** Public: Wird vom FreeDrawTool für Live-Vorschau verwendet. */
  drawFreeStrokePreview(points: Vec2[], style: {
    color: string; thicknessM: number; opacity: number; lineStyle: import("./Scene").FreeLineStyle;
    gapM: number; blobSpacingM: number; blobSizeM: number; smoothing: boolean;
    imageSrc?: string | null; imageSizeM?: number; imageSpacingM?: number; imageRotateAlongPath?: boolean;
  }) {
    if (!points || points.length < 2) return;
    const tmp = new FreeStroke({ id: "_preview", points, ...style });
    this._drawSingleFreeStroke(tmp);
  }

  // ---- Ruler Guide ----
  private _drawRulerGuide() {
    const g = this.scene.rulerGuide;
    if (!g) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(g.a.x, g.a.y);
    const b = cam.worldToScreen(g.b.x, g.b.y);
    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Endpunkt-Marker
    for (const p of [a, b]) {
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
