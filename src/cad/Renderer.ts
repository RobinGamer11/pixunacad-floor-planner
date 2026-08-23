import { Defaults, SelectionType } from "./constants";
import { Vec2, v, sub, add, mul, norm, perpLeft, len, clamp, rgbaFromHex, hexToRgba, polygonAreaAbs, polygonCentroid, tessellateWithBulges, hatchOuterRing, hatchHoleRings } from "./geometry";
import { Camera } from "./Camera";
import type { RasterLayers } from "./RasterLayers";
import { Scene, Hatch, Dimension, TextBox, StickerInstance, DocumentObject, FreeStroke } from "./Scene";
import { smoothChaikin } from "./freeGeom";
import { LabelManager } from "./LabelManager";
import { getDimensionGeometry, getAngleDimensionParts, type DimensionLike } from "./dimensionGeometry";
import { boxCornersWorld } from "./textGeometry";
import { getDocWarp, drawWarpedImage } from "./documentWarp";
import { drawRichTextBox } from "./textRichRenderer";
import { textStyleFontSizePt, ptToCssPx } from "./textTypography";
import { normalizeTable, isCovered, effectiveFormat, effectiveBorders } from "@/lib/table/tableModel";
import { layoutTable, cellRectMm } from "@/lib/table/tableLayout";
import { evalCell } from "@/lib/table/tableFormula";
import { strokeHatchSeal } from "./hatchSeal";
import { fillWithHatchPattern, PATTERN_BASE_TILE_M, type HatchPatternId } from "./hatchPatterns";
import { transformedInstanceItems, instanceBoundingCornersWorld } from "./StickerManager";
import { documentCornersWorld, documentCenterWorld, documentVisibleCornersWorld, documentAnchorsWorld } from "./documentGeometry";
import { getOrCreateDocMask } from "./documentMask";
import { applyFilterToCanvas, filterSignature } from "./documentFilters";
import { applyBgRemovalToCanvas, bgRemovalSignature } from "./documentBgRemove";

import { computeHealedWallLines } from "./wallHeal";
import { getWallUnionGroups } from "./wallUnion";
import { buildHealedWallSolidRing, buildWallSolidRing, ringToPCPolygon } from "./wallSolid";
import { drawDoor } from "./doorGeom";
import { isExportMode } from "@/lib/printExport";
import { type MultiPolygon } from "polygon-clipping";

export interface Selection {
  type: string;
  segmentId?: string;
  hatchId?: string;
  dimensionId?: string;
  textBoxId?: string;
  stickerInstanceId?: string;
  documentId?: string;
  freeStrokeId?: string;
  handleIndex?: number | null;
  pointIndex?: number | null;
  /** Bei HATCH-Selection optional: Index der angeklickten Kante (für Edge-Offset-Hub). */
  edgeIndex?: number | null;
  /** Bei Hatch Punkt/Kanten-Auswahl: Index der Hole-Loop (null/undefined = äußere Kontur). */
  holeIndex?: number | null;
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
  rotationRad: number;
  boxW: number;
  boxH: number;
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
  /** Sekundär-Selektionen für Mehrfachauswahl (Primary bleibt `selection`). */
  extraSelections: Selection[] = [];

  /** Raster-Einstellungen (Hintergrund-Grid). */
  gridSettings: { enabled: boolean; sizeM: number; color: string; opacity: number } = {
    enabled: true,
    sizeM: 1,
    color: "#000000",
    opacity: 0.06,
  };

  /** Hintergrundfarbe der CAD-Oberfläche (außerhalb des Kartenkreises). */
  backgroundColor: string = "#ffffff";

  /** Wenn true: kein Hintergrund füllen (Offscreen-Rasterisierung mit Alpha). */
  transparentBackground = false;

  /**
   * Optionale Raster-Zeichenebenen (Pixelmodus der Projektmappe). Wird von
   * MiniCad gesetzt; in der großen CAD-Oberfläche bleibt sie null.
   */
  rasterLayers: RasterLayers | null = null;

  selectedLabelId: string | null = null;
  hoverSegmentId: string | null = null;
  hoverHatchId: string | null = null;
  hoverTextBoxId: string | null = null;
  /** Box currently being edited inline — skip canvas rendering for it. */
  editingTextBoxId: string | null = null;
  /** True während ein Wand-Edit (Bewegen/Verschieben/Drehen) läuft. */
  wallEditActive = false;

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

  /**
   * Zusätzlicher pt→px-Faktor für Text (Basis ist ptToCssPx = 96 dpi).
   * Bildschirm-CAD: 1. Papierbezogene Hosts (Projektmappe) setzen hier
   * (25,4/72 × paperPxPerMm) / (96/72), damit 1 pt exakt 25,4/72 mm auf dem
   * Papier entspricht — identisch zur Tabellen-Skalierung.
   */
  textPtScale: number = 1;

  constructor(ctx: CanvasRenderingContext2D, camera: Camera, scene: Scene, labels: LabelManager) {
    this.ctx = ctx;
    this.camera = camera;
    this.scene = scene;
    this.labels = labels;
  }

  private _drawWallMulti(multi: MultiPolygon, fillStyle: string, strokeStyle?: string, lineWidth = 1.5) {
    if (!multi || multi.length === 0) return;
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    for (const poly of multi) {
      for (const ring of poly) {
        if (!ring || ring.length < 3) continue;
        const p0 = cam.worldToScreen(ring[0][0], ring[0][1]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ring.length; i++) {
          const p = cam.worldToScreen(ring[i][0], ring[i][1]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }
    }
    ctx.fill("evenodd");

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      for (const poly of multi) {
        for (const ring of poly) {
          if (!ring || ring.length < 3) continue;
          ctx.beginPath();
          const p0 = cam.worldToScreen(ring[0][0], ring[0][1]);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < ring.length; i++) {
            const p = cam.worldToScreen(ring[i][0], ring[i][1]);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  setViewport(w: number, h: number) { this.vw = w; this.vh = h; }
  setSelection(selection: Selection | null) { this.selection = selection; }
  setExtraSelections(list: Selection[]) { this.extraSelections = list || []; }

  setSelectedLabelId(labelId: string | null) { this.selectedLabelId = labelId || null; }
  setHoverSegmentId(id: string | null) { this.hoverSegmentId = id || null; }
  setHoverHatchId(id: string | null) { this.hoverHatchId = id || null; }
  setHoverTextBoxId(id: string | null) { this.hoverTextBoxId = id || null; }
  setEditingTextBoxId(id: string | null) { this.editingTextBoxId = id || null; }

  private _segmentsBackToFront() {
    // Höher in der ID-Panel-Liste (kleinerer Index) = Vordergrund.
    // Wir zeichnen back-to-front, daher: höchster Index zuerst, Index 0 zuletzt.
    // Hilfslinien (isGuide) immer vor allen anderen Segmenten zeichnen, damit
    // sie im Hintergrund liegen.
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    const hideGuides = isExportMode();
    return [...this.scene.segments]
      .filter(s => this.labels.isVisible(s.labelId))
      .filter(s => !(hideGuides && s.isGuide))
      .sort((a, b) => {
        const ga = a.isGuide ? 1 : 0;
        const gb = b.isGuide ? 1 : 0;
        if (ga !== gb) return gb - ga; // guides first (back)
        return (rank.get(b.labelId) ?? 0) - (rank.get(a.labelId) ?? 0);
      });
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

  /**
   * Cache: Bildquelle (src/DataURL) -> HTMLImageElement.
   * Schlüssel ist die Quelle, damit identische Bilder (Kopien, mehrfach
   * eingefügte Objekte) nur EINMAL dekodiert im Speicher liegen.
   */
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
      // Rasterinhalt dieser Ebene (Pixelmodus der Projektmappe): liegt über den
      // Dokumenten, aber unter allen Vektorobjekten derselben Ebene.
      this.rasterLayers?.drawLayer(this.ctx, this.camera, labelId);
      this._drawHatchesForLabel(labelId);
      this._drawWallsForLabel(labelId);
      this._drawDoorsForLabel(labelId);
      this._drawSegmentsForLabel(labelId);
      this._drawFreeStrokesForLabel(labelId);
      this._drawDimensionsForLabel(labelId);
      this._drawTextBoxesForLabel(labelId);
      this._drawTablesForLabel(labelId);
      this._drawStickerInstancesForLabel(labelId);
    }
    if (!isExportMode()) {
      // Fangpunkte der selektierten Wand IMMER ganz oben (über allen Wänden/Hatches),
      // damit Bewegen/Verschieben/Drehen jederzeit greifbar bleibt.
      this._drawSelectedWallHandles();
      // Ruler-Guide (Lineal) immer ganz oben in der aktiven Scene zeichnen.
      this._drawRulerGuide();
    }
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
      if (!this.transparentBackground) {
        ctx.save();
        ctx.fillStyle = this.backgroundColor || "hsl(0 0% 100%)";
        ctx.fillRect(0, 0, this.vw, this.vh);
        ctx.restore();
      }
      if (this.gridSettings.enabled) this._drawGrid();
    }

    // Overlay-Sheets (Transparentpause) UNTER aktiver Scene zeichnen.
    this._drawOverlayScenes();

    this._drawByLabelOrder();
    this._drawHatchSelection();
    this._drawSegmentSelection();
    this._drawDimensionSelection();
    this._drawTextBoxSelection();
    this._drawStickerInstanceSelection();
    this._drawDocumentSnapAffordances();
    this._drawDocumentGuides();
    this._drawDocumentSelection();
    this._drawFreeStrokeSelection();
    this._drawHoverSegmentPoints();

    // Sekundär-Selektionen (Multi-Select): identische Highlight-Pässe für jedes
    // weitere Objekt — wir tauschen kurz `this.selection` aus, malen die
    // entsprechenden Selection-Pässe, und stellen den Original-Zustand wieder her.
    if (this.extraSelections && this.extraSelections.length > 0) {
      const original = this.selection;
      for (const extra of this.extraSelections) {
        if (!extra || extra === original) continue;
        this.selection = extra;
        this._drawHatchSelection();
        this._drawSegmentSelection();
        this._drawDimensionSelection();
        this._drawTextBoxSelection();
        this._drawStickerInstanceSelection();
        this._drawDocumentSelection();
        this._drawFreeStrokeSelection();
      }
      this.selection = original;
    }

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


  /**
   * Bild eines Dokuments — der Cache ist bewusst über die QUELLE (src) und
   * nicht über die Dokument-ID geschlüsselt: Kopien desselben Bildes (Copy &
   * Paste, „auf allen Seiten“, wiederholter Import) teilen sich damit ein
   * einziges dekodiertes Bild statt jeweils ein eigenes Duplikat im Speicher
   * zu halten.
   */
  private _getDocImage(doc: DocumentObject): HTMLImageElement | null {
    const key = doc.src;
    if (!key) return null;
    let img = this._docImageCache.get(key);
    if (img) return img.complete ? img : null;
    img = new Image();
    img.src = key;
    this._docImageCache.set(key, img);
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

  /** Cache: docId -> adaptiver PDF-Render-Canvas (Low-Res Fallback, ganze Seite). */
  private _pdfAdaptiveCache = new Map<string, { canvas: HTMLCanvasElement | null; renderedWidthPx: number; renderingForPx: number | null }>();

  private _getDocAdaptiveBitmap(doc: DocumentObject, targetWidthPx: number): HTMLCanvasElement | null {
    if (doc.kind !== "pdf-page" || !doc.pdfSourceB64) return null;
    const dpr = Math.max(1, (window.devicePixelRatio || 1));
    // Fallback bewusst gedeckelt — Tile übernimmt die Detailschärfe.
    const targetPx = Math.min(
      Defaults.documentFallbackMaxPx,
      Math.max(64, Math.ceil(targetWidthPx * dpr)),
    );
    let entry = this._pdfAdaptiveCache.get(doc.id);
    if (!entry) {
      entry = { canvas: null, renderedWidthPx: 0, renderingForPx: null };
      this._pdfAdaptiveCache.set(doc.id, entry);
    }
    const need = entry.renderedWidthPx === 0
      || targetPx > entry.renderedWidthPx * 1.25
      || targetPx < entry.renderedWidthPx * 0.4;
    if (need && entry.renderingForPx !== targetPx) {
      entry.renderingForPx = targetPx;
      const cappedPx = Math.min(targetPx, Defaults.documentFallbackMaxPx);
      import("./documentImport").then(({ renderPdfPageToCanvas }) => {
        return renderPdfPageToCanvas(doc.pdfSourceB64!, doc.pageIndex, cappedPx);
      }).then(canvas => {
        const e = this._pdfAdaptiveCache.get(doc.id);
        if (!e || e.renderingForPx !== targetPx) return;
        e.canvas = canvas;
        e.renderedWidthPx = canvas.width;
        e.renderingForPx = null;
      }).catch(() => {
        const e = this._pdfAdaptiveCache.get(doc.id);
        if (e) e.renderingForPx = null;
      });
    }
    return entry.canvas;
  }

  /**
   * Cache: docId -> viewport-basiertes Tile.
   * Rendert nur den aktuell sichtbaren Ausschnitt der PDF in voller Bildschirm-Pixeldichte,
   * damit auch bei starkem Zoom keine Pixel/„Partikel" mehr sichtbar sind (Adobe-ähnlich scharf).
   */
  private _pdfTileCache = new Map<string, {
    canvas: HTMLCanvasElement | null;
    u0: number; v0: number; u1: number; v1: number;
    pxW: number; pxH: number;
    filterSig: string;
    renderTask: any | null;
    pendingKey: string | null;
    debounceHandle: any;
    lastRequestMs: number;
  }>();

  private _computeDocVisibleFraction(doc: DocumentObject): { u0: number; v0: number; u1: number; v1: number } | null {
    const canvas = this.ctx.canvas as HTMLCanvasElement;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const cx = doc.position.x + doc.widthM / 2;
    const cy = doc.position.y + doc.heightM / 2;
    const cs = Math.cos(-doc.rotationRad), sn = Math.sin(-doc.rotationRad);
    const corners: [number, number][] = [[0, 0], [cssW, 0], [cssW, cssH], [0, cssH]];
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const [sx, sy] of corners) {
      const w = this.camera.screenToWorld(sx, sy);
      const dx = w.x - cx, dy = w.y - cy;
      const lx = dx * cs - dy * sn + doc.widthM / 2;
      const ly = dx * sn + dy * cs + doc.heightM / 2;
      const u = lx / doc.widthM, v = ly / doc.heightM;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const u0 = Math.max(0, minU), v0 = Math.max(0, minV);
    const u1 = Math.min(1, maxU), v1 = Math.min(1, maxV);
    if (u1 - u0 <= 1e-4 || v1 - v0 <= 1e-4) return null;
    return { u0, v0, u1, v1 };
  }

  private _getDocPdfTile(doc: DocumentObject, wPx: number, hPx: number): { canvas: HTMLCanvasElement; u0: number; v0: number; u1: number; v1: number } | null {
    if (doc.kind !== "pdf-page" || !doc.pdfSourceB64) return null;
    if ((doc as any)._snapOnly) return null;
    const frac = this._computeDocVisibleFraction(doc);
    if (!frac) return null;
    // Overscan 20 % pro Achse (aber innerhalb [0..1]) — reduziert Re-Renders beim Panning.
    const dU = frac.u1 - frac.u0, dV = frac.v1 - frac.v0;
    const ou0 = Math.max(0, frac.u0 - dU * 0.2);
    const ov0 = Math.max(0, frac.v0 - dV * 0.2);
    const ou1 = Math.min(1, frac.u1 + dU * 0.2);
    const ov1 = Math.min(1, frac.v1 + dV * 0.2);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const tileMax = Defaults.documentTileMaxPx;
    let pxW = Math.ceil((ou1 - ou0) * wPx * dpr);
    let pxH = Math.ceil((ov1 - ov0) * hPx * dpr);
    if (pxW < 32 || pxH < 32) return null;
    if (pxW > tileMax || pxH > tileMax) {
      const s = Math.min(tileMax / pxW, tileMax / pxH);
      pxW = Math.max(32, Math.floor(pxW * s));
      pxH = Math.max(32, Math.floor(pxH * s));
    }
    const filter = doc.activeFilterId ? doc.filters.find(f => f.id === doc.activeFilterId) : undefined;
    const bgSig = bgRemovalSignature(doc);
    const filterSig = (filter ? filterSignature(filter) : "") + "|bg:" + bgSig;

    let entry = this._pdfTileCache.get(doc.id);
    if (!entry) {
      entry = { canvas: null, u0: 0, v0: 0, u1: 0, v1: 0, pxW: 0, pxH: 0, filterSig: "", renderTask: null, pendingKey: null, debounceHandle: null, lastRequestMs: 0 };
      this._pdfTileCache.set(doc.id, entry);
    }

    // Cache deckt sichtbare Region ab UND hat noch genug effektive Auflösung?
    const covered = !!entry.canvas
      && entry.u0 <= frac.u0 + 1e-4 && entry.u1 >= frac.u1 - 1e-4
      && entry.v0 <= frac.v0 + 1e-4 && entry.v1 >= frac.v1 - 1e-4
      && entry.filterSig === filterSig;
    const desiredPxPerU = pxW / Math.max(1e-6, (ou1 - ou0));
    const cachedPxPerU = entry.canvas ? entry.canvas.width / Math.max(1e-6, (entry.u1 - entry.u0)) : 0;
    const resOk = covered && cachedPxPerU >= desiredPxPerU * 0.7;

    const key = `${ou0.toFixed(3)}|${ov0.toFixed(3)}|${ou1.toFixed(3)}|${ov1.toFixed(3)}|${pxW}|${pxH}|${filterSig}`;
    if (!resOk && entry.pendingKey !== key) {
      entry.pendingKey = key;
      entry.lastRequestMs = performance.now();
      if (entry.debounceHandle) { clearTimeout(entry.debounceHandle); entry.debounceHandle = null; }
      entry.debounceHandle = setTimeout(() => {
        entry!.debounceHandle = null;
        if (entry!.pendingKey !== key) return;
        // Ggf. laufenden Render abbrechen — beim Zoom ändert sich der Wunsch schnell.
        if (entry!.renderTask) { try { entry!.renderTask.cancel(); } catch { /* noop */ } entry!.renderTask = null; }
        void this._renderPdfTile(doc, ou0, ov0, ou1, ov1, pxW, pxH, filterSig, entry!, key);
      }, Defaults.documentTileDebounceMs);
    }

    return entry.canvas ? { canvas: entry.canvas, u0: entry.u0, v0: entry.v0, u1: entry.u1, v1: entry.v1 } : null;
  }

  private async _renderPdfTile(
    doc: DocumentObject,
    u0: number, v0: number, u1: number, v1: number,
    pxW: number, pxH: number,
    filterSig: string,
    entry: NonNullable<ReturnType<Map<string, any>["get"]>>,
    key: string,
  ) {
    try {
      const { renderPdfPageRegionToCanvas } = await import("./documentImport");
      const raw = await renderPdfPageRegionToCanvas(
        doc.pdfSourceB64!, doc.pageIndex,
        u0, v0, u1, v1, pxW, pxH,
        (task) => { entry.renderTask = task; },
      );
      if (entry.pendingKey !== key) return;
      let out: HTMLCanvasElement = raw;
      if (doc.activeFilterId) {
        const filter = doc.filters.find(f => f.id === doc.activeFilterId);
        if (filter) out = applyFilterToCanvas(raw, raw.width, raw.height, filter);
      }
      if (bgRemovalSignature(doc)) out = applyBgRemovalToCanvas(out, doc);
      entry.canvas = out;
      entry.u0 = u0; entry.v0 = v0; entry.u1 = u1; entry.v1 = v1;
      entry.pxW = pxW; entry.pxH = pxH; entry.filterSig = filterSig;
      entry.pendingKey = null;
      entry.renderTask = null;
    } catch {
      if (entry.pendingKey === key) entry.pendingKey = null;
      entry.renderTask = null;
    }
  }


  /** Cache: docId → gefiltertes Bild (key: sourceSig|filterSig|bgSig|wxh). */
  private _docFilterCache = new Map<string, { canvas: HTMLCanvasElement; key: string }>();

  private _getFilteredBitmap(doc: DocumentObject, baseSource: CanvasImageSource, baseW: number, baseH: number, sourceSig: string): HTMLCanvasElement | null {
    const activeId = doc.activeFilterId;
    const bgSig = bgRemovalSignature(doc);
    if (!activeId && !bgSig) return null;
    const filter = activeId ? doc.filters.find(f => f.id === activeId) || null : null;
    const key = `${sourceSig}|${filter ? filterSignature(filter) : "-"}|${bgSig}|${baseW}x${baseH}`;
    const cached = this._docFilterCache.get(doc.id);
    if (cached && cached.key === key) return cached.canvas;
    let c = applyFilterToCanvas(baseSource, baseW, baseH, filter);
    if (bgSig) c = applyBgRemovalToCanvas(c, doc);
    this._docFilterCache.set(doc.id, { canvas: c, key });
    return c;
  }

  private _drawSingleDocument(doc: DocumentObject) {
    // Snap-only Dokumente (z. B. Projektmappen-PDF/Bild als Snap-Quelle) werden
    // nicht gezeichnet — der echte Inhalt liegt im DOM darunter. Snap-Marker,
    // Guides und Selektion werden weiterhin in _drawDocumentSnapAffordances /
    // _drawDocumentGuides / _drawDocumentSelection gerendert.
    if ((doc as any)._snapOnly) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const center = documentCenterWorld(doc);
    const cs = cam.worldToScreen(center.x, center.y);
    const wPx = doc.widthM * cam.scale;
    const hPx = doc.heightM * cam.scale;


    // Vektor-PDF: adaptiver Re-Render bei Zoom
    const adaptive = this._getDocAdaptiveBitmap(doc, wPx);
    const img = this._getDocImage(doc);

    ctx.save();
    ctx.translate(cs.x, cs.y);
    if (doc.rotationRad) ctx.rotate(doc.rotationRad);
    // Spiegeln (links/rechts bzw. oben/unten)
    const fx = (doc as any).flipX ? -1 : 1;
    const fy = (doc as any).flipY ? -1 : 1;
    if (fx < 0 || fy < 0) ctx.scale(fx, fy);
    // Opacity
    const op = typeof doc.opacity === "number" ? doc.opacity : 1;
    if (op < 1) ctx.globalAlpha = ctx.globalAlpha * op;
    // Crop-Clip (lokale Doc-Koords, Pixel-Skalierung)
    const crop = (doc as any).cropM as { top: number; right: number; bottom: number; left: number } | undefined;
    if (crop && (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0)) {
      const sx = cam.scale;
      const clipL = -wPx / 2 + (crop.left || 0) * sx;
      const clipT = -hPx / 2 + (crop.top || 0) * sx;
      const clipW = wPx - ((crop.left || 0) + (crop.right || 0)) * sx;
      const clipH = hPx - ((crop.top || 0) + (crop.bottom || 0)) * sx;
      if (clipW > 0 && clipH > 0) {
        ctx.beginPath();
        ctx.rect(clipL, clipT, clipW, clipH);
        ctx.clip();
      }
    }
    // High-Quality-Smoothing: sorgt für saubere Zwischenstufen bis das scharfe Tile da ist.
    const prevSmoothing = ctx.imageSmoothingEnabled;
    const prevQuality = (ctx as any).imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    const warp = getDocWarp(doc);
    if (adaptive) {
      // Zuerst die Low-Res-Fallback-Vollseite zeichnen — nie leere Fläche beim Panning/Zoomen.
      const baseW = adaptive.width, baseH = adaptive.height;
      const filtered = this._getFilteredBitmap(doc, adaptive, baseW, baseH, `adp:${baseW}`);
      const srcAdp: CanvasImageSource = (filtered || adaptive) as CanvasImageSource;
      if (warp) {
        drawWarpedImage(ctx, srcAdp, baseW, baseH, wPx, hPx, warp);
      } else {
        ctx.drawImage(srcAdp, -wPx / 2, -hPx / 2, wPx, hPx);
        // Darüber das scharfe Viewport-Tile (nur wenn vorhanden) — Adobe-ähnliche Schärfe.
        const tile = this._getDocPdfTile(doc, wPx, hPx);
        if (tile) {
          const tx = -wPx / 2 + tile.u0 * wPx;
          const ty = -hPx / 2 + tile.v0 * hPx;
          const tw = (tile.u1 - tile.u0) * wPx;
          const th = (tile.v1 - tile.v0) * hPx;
          ctx.drawImage(tile.canvas, tx, ty, tw, th);
        }
      }
    } else if (img) {
      const composite = this._getDocComposite(doc, img);
      const drawSrc: CanvasImageSource = composite || img;
      const baseW = (composite ? composite.width : (img.naturalWidth || img.width));
      const baseH = (composite ? composite.height : (img.naturalHeight || img.height));
      const filtered = this._getFilteredBitmap(doc, drawSrc, baseW, baseH, composite ? `cmp:${baseW}` : `img:${img.src.length}`);
      const finalSrc: CanvasImageSource = (filtered || drawSrc) as CanvasImageSource;
      // Schärfe: wird stärker als die native Auflösung vergrößert, erzeugt die
      // bilineare Glättung nur Unschärfe. Ab ~1,5-facher Vergrößerung wird
      // deshalb pixelgenau (nearest neighbour) gezeichnet — PNG/JPG und
      // Pixelobjekte bleiben beim Hineinzoomen scharf statt zu verwaschen.
      const magnify = baseW > 0 ? wPx / baseW : 1;
      if (magnify > 1.5) {
        ctx.imageSmoothingEnabled = false;
      }
      if (warp) {
        drawWarpedImage(ctx, finalSrc, baseW, baseH, wPx, hPx, warp);
      } else {
        ctx.drawImage(finalSrc, -wPx / 2, -hPx / 2, wPx, hPx);
      }
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = "rgba(180,180,180,0.3)";
      ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Lade …", 0, 0);
    }
    ctx.imageSmoothingEnabled = prevSmoothing;
    if (prevQuality) (ctx as any).imageSmoothingQuality = prevQuality;
    ctx.restore();
  }


  /** Zeichnet alle aktiven Document-Guide-Lines (unendlich verlängerte Kanten-Strahlen). */
  private _drawDocumentGuides() {
    const ctx = this.ctx;
    const cam = this.camera;
    const big = 100000;
    for (const doc of this.scene.documents) {
      if (!this.labels.isVisible(doc.labelId)) continue;
      const g = doc.guideEdges;
      if (!g || (!g.top && !g.right && !g.bottom && !g.left)) continue;
      const corners = documentVisibleCornersWorld(doc);
      const edges = [
        { on: g.top,    a: corners[0], b: corners[1] },
        { on: g.right,  a: corners[1], b: corners[2] },
        { on: g.bottom, a: corners[2], b: corners[3] },
        { on: g.left,   a: corners[3], b: corners[0] },
      ];
      ctx.save();
      ctx.strokeStyle = "rgba(255,140,0,0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      for (const e of edges) {
        if (!e.on) continue;
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
        const L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L;
        const p1 = cam.worldToScreen(e.a.x - ux * big, e.a.y - uy * big);
        const p2 = cam.worldToScreen(e.b.x + ux * big, e.b.y + uy * big);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Markiert ALLE Dokumente mit kleinen Snap-Eck-Markern + Kanten-Hovers (immer sichtbar). */
  private _drawDocumentSnapAffordances() {
    const ctx = this.ctx;
    const cam = this.camera;
    for (const doc of this.scene.documents) {
      if (!this.labels.isVisible(doc.labelId)) continue;
      const corners = documentVisibleCornersWorld(doc).map(c => cam.worldToScreen(c.x, c.y));
      ctx.save();
      // dezente Kanten-Hervorhebung
      ctx.strokeStyle = "rgba(77,163,255,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      // Eck-Snap-Marker (kleine Quadrate)
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = 1.5;
      for (const p of corners) {
        ctx.beginPath();
        ctx.rect(p.x - 3.5, p.y - 3.5, 7, 7);
        ctx.fill();
        ctx.stroke();
      }
      // Benutzer-Anker (Fangpunkte) — goldenes Anker-Icon
      const anchors = documentAnchorsWorld(doc);
      if (anchors.length > 0) {
        for (const w of anchors) {
          const p = cam.worldToScreen(w.x, w.y);
          ctx.beginPath();
          ctx.fillStyle = "#c99a3b";
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Kleiner Ring als „Anker"-Silhouette
          ctx.beginPath();
          ctx.strokeStyle = "#c99a3b";
          ctx.lineWidth = 1;
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private _drawDocumentSelection() {
    if (!this.selection || this.selection.type !== SelectionType.DOCUMENT) return;
    const doc = this.scene.getDocumentById(this.selection.documentId!);
    if (!doc || !this.labels.isVisible(doc.labelId)) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const corners = documentVisibleCornersWorld(doc);
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
    // Eckhandles (größer)
    for (const p of sc) {
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(p.x - 5, p.y - 5, 10, 10);
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
        this._paintHatchPattern(ctx, cam, it);
        const strokePx = this._scaledStrokePx(it.strokeWidthPx ?? Defaults.hatchStrokePx);
        if (strokePx > 0) {
          ctx.strokeStyle = it.strokeColor || Defaults.hatchStrokeColor;
          ctx.lineWidth = strokePx;
          ctx.stroke();
        }
        ctx.restore();
      } else if (it.kind === "wall") {
        const ring = buildWallSolidRing({
          corners: it.corners, thicknessM: it.thicknessM, referenceSide: it.referenceSide,
        } as any);
        if (ring.length >= 3) {
          ctx.save();
          ctx.beginPath();
          const r0 = cam.worldToScreen(ring[0].x, ring[0].y);
          ctx.moveTo(r0.x, r0.y);
          for (let i = 1; i < ring.length; i++) {
            const rp = cam.worldToScreen(ring[i].x, ring[i].y);
            ctx.lineTo(rp.x, rp.y);
          }
          ctx.closePath();
          ctx.fillStyle = it.fillColor || Defaults.wallFillColorOuter;
          ctx.fill();
          ctx.strokeStyle = it.color || Defaults.lineColor;
          ctx.lineWidth = this._scaledStrokePx(1);
          ctx.stroke();
          ctx.restore();
        }
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
          baseFontSizePt: textStyleFontSizePt(it.style || {}),
          displayScale: (cam.scale / this.referencePxPerM) * this.textPtScale,
          baseColor: it.style?.textColor || Defaults.textColor,
          bgColor: it.style?.bgColor || Defaults.textBgColor,
          bgAlpha: ((it.style?.bgAlphaPct || 0)) / 100,
          textAlpha: (it.style?.textAlphaPct ?? 100) / 100,
          align: it.style?.align || Defaults.textAlign,
          wrap: !!it.style?.wrap,
          borderEnabled: !!it.style?.borderEnabled,
          borderColor: it.style?.borderColor || Defaults.textBorderColor,
          borderWidthPx: it.style?.borderWidthPx ?? Defaults.textBorderWidthPx,
          paddingPx: 1 * (cam.scale / this.referencePxPerM),
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
    const size = Math.max(0.01, this.gridSettings.sizeM || 1);
    const tl = cam.screenToWorld(0, 0);
    const br = cam.screenToWorld(this.vw, this.vh);

    const minX = Math.floor(Math.min(tl.x, br.x) / size) * size;
    const maxX = Math.ceil(Math.max(tl.x, br.x) / size) * size;
    const minY = Math.floor(Math.min(tl.y, br.y) / size) * size;
    const maxY = Math.ceil(Math.max(tl.y, br.y) / size) * size;

    const pxPerCell = cam.scale * size;
    // Keep the labelled grid cell (e.g. 1 m) constant. When cells become tiny
    // we fade them out via opacity instead of doubling their world spacing —
    // otherwise the "1 m" raster silently turns into 2 m / 4 m on zoom-out.
    const baseAlpha = this.gridSettings.opacity ?? 0.06;
    let alpha = baseAlpha;
    if (pxPerCell < 6) alpha = baseAlpha * Math.max(0, (pxPerCell - 2) / 4);
    if (pxPerCell < 2) return;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexToRgba(this.gridSettings.color || "#000000", alpha);

    ctx.beginPath();
    for (let x = minX; x <= maxX; x += size) {
      const s = cam.worldToScreen(x, 0);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, this.vh);
    }
    for (let y = minY; y <= maxY; y += size) {
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
    const list = this._segmentsBackToFront();
    for (const seg of list) this._drawSingleSegment(seg);
    this._drawSegmentJoints(list as any[]);
  }

  private _drawSegmentsForLabel(labelId: string) {
    const hideGuides = isExportMode();
    const list: any[] = [];
    for (const seg of this.scene.segments) {
      if (seg.labelId !== labelId) continue;
      if (!this.labels.isVisible(seg.labelId)) continue;
      if (hideGuides && seg.isGuide) continue;
      this._drawSingleSegment(seg);
      list.push(seg);
    }
    this._drawSegmentJoints(list);
  }

  /**
   * Schließt die Ecke zwischen zwei Linien, die sich exakt einen Endpunkt
   * teilen (Gehrung / Miter). Ohne diesen Pass bleibt an der Außenseite
   * dicker Linien eine keilförmige Lücke stehen, weil jede Linie als
   * eigener Pfad mit "butt"-Enden gezeichnet wird.
   */
  private _drawSegmentJoints(segs: any[]) {
    if (!segs || segs.length < 2) return;
    const cam = this.camera;
    const ctx = this.ctx;
    const key = (p: { x: number; y: number }) => `${p.x.toFixed(6)}_${p.y.toFixed(6)}`;
    const joints = new Map<string, { p: { x: number; y: number }; items: { seg: any; other: { x: number; y: number } }[] }>();

    for (const seg of segs) {
      if (seg.isGuide || (seg as any).bulge) continue;
      for (const [p, other] of [[seg.a, seg.b], [seg.b, seg.a]] as const) {
        const k = key(p);
        let e = joints.get(k);
        if (!e) { e = { p, items: [] }; joints.set(k, e); }
        e.items.push({ seg, other });
      }
    }

    for (const { p, items } of joints.values()) {
      if (items.length !== 2) continue;
      const [i1, i2] = items;
      if (i1.seg.thicknessM !== i2.seg.thicknessM) continue;
      if ((i1.seg.color || Defaults.lineColor) !== (i2.seg.color || Defaults.lineColor)) continue;

      const j = cam.worldToScreen(p.x, p.y);
      const a = cam.worldToScreen(i1.other.x, i1.other.y);
      const b = cam.worldToScreen(i2.other.x, i2.other.y);
      const wpx = this._segStrokePx(i1.seg.thicknessM);
      if (wpx <= 1.2) continue;

      const stub = (from: { x: number; y: number }) => {
        const dx = from.x - j.x, dy = from.y - j.y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-6) return null;
        const len = Math.min(L, wpx * 2);
        return { x: j.x + (dx / L) * len, y: j.y + (dy / L) * len };
      };
      const s1 = stub(a), s2 = stub(b);
      if (!s1 || !s2) continue;

      ctx.save();
      ctx.strokeStyle = i1.seg.color || Defaults.lineColor;
      ctx.lineWidth = wpx;
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      ctx.miterLimit = 12;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(j.x, j.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  private _drawSingleSegment(seg: { a: Vec2; b: Vec2; color?: string; thicknessM: number; labelId: string; isGuide?: boolean; arrowStart?: boolean; arrowEnd?: boolean; arrowScale?: number; bulge?: number }) {
    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);
    const isGroupSel = this.selectedLabelId && seg.labelId === this.selectedLabelId;

    ctx.save();
    ctx.strokeStyle = seg.color || Defaults.lineColor;
    ctx.fillStyle = seg.color || Defaults.lineColor;
    ctx.lineWidth = this._segStrokePx(seg.thicknessM);
    if (seg.isGuide) {
      // Hilfslinie: gestrichelt und mit der frei gewählten Strichbreite.
      ctx.strokeStyle = seg.color || "#7DD3FC";
      ctx.lineWidth = this._segStrokePx(seg.thicknessM);
      const dash = Math.max(4, ctx.lineWidth * 4);
      const gap = Math.max(3, ctx.lineWidth * 3);
      ctx.setLineDash([dash, gap]);
    }
    const bulgePts = ((seg as any).bulge)
      ? tessellateWithBulges([seg.a, seg.b], [(seg as any).bulge], false, 32).map(p => cam.worldToScreen(p.x, p.y))
      : null;
    ctx.beginPath();
    if (bulgePts) {
      ctx.moveTo(bulgePts[0].x, bulgePts[0].y);
      for (let i = 1; i < bulgePts.length; i++) ctx.lineTo(bulgePts[i].x, bulgePts[i].y);
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Pfeilspitzen (nicht für Hilfslinien)
    if (!seg.isGuide && (seg.arrowStart || seg.arrowEnd)) {
      const scale = (typeof seg.arrowScale === "number" && seg.arrowScale > 0) ? seg.arrowScale : 1;
      // Pfeilgröße proportional zur Linienstärke (in px).
      const sizePx = Math.max(6, this._segStrokePx(seg.thicknessM) * 6 * scale);
      const dxw = b.x - a.x, dyw = b.y - a.y;
      const L = Math.hypot(dxw, dyw) || 1;
      const ux = dxw / L, uy = dyw / L;
      const drawHead = (tipX: number, tipY: number, dirX: number, dirY: number) => {
        const baseX = tipX - dirX * sizePx;
        const baseY = tipY - dirY * sizePx;
        const px = -dirY, py = dirX; // perp
        const halfW = sizePx * 0.5;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX + px * halfW, baseY + py * halfW);
        ctx.lineTo(baseX - px * halfW, baseY - py * halfW);
        ctx.closePath();
        ctx.fill();
      };
      if (seg.arrowEnd) drawHead(b.x, b.y, ux, uy);
      if (seg.arrowStart) drawHead(a.x, a.y, -ux, -uy);
    }

    if (isGroupSel) {
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = Math.max(4, this._segStrokePx(seg.thicknessM) + 1.4);
      ctx.beginPath();
      if (bulgePts) {
        ctx.moveTo(bulgePts[0].x, bulgePts[0].y);
        for (let i = 1; i < bulgePts.length; i++) ctx.lineTo(bulgePts[i].x, bulgePts[i].y);
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }


  private _drawDoorsForLabel(labelId: string) {
    if (!this.scene.doors || this.scene.doors.length === 0) return;
    for (const d of this.scene.doors) {
      if (d.labelId !== labelId) continue;
      const w = this.scene.getWallById(d.wallId);
      if (!w) continue;
      drawDoor(this.ctx, this.camera, w, d, 1);
    }
  }

  /**
   * Zeichnet die Baustoff-Schraffur einer Wand in ihren Wandkörper.
   * Die Musterdichte skaliert mit der Wanddicke (wie im Architektur-CAD),
   * die Ausrichtung folgt der Wandrichtung.
   */
  private _paintWallPattern(wall: any) {
    const ctx = this.ctx;
    const cam = this.camera;
    const ring = buildHealedWallSolidRing(wall, this.scene.walls, this.scene.getWallTopology());
    if (!ring || ring.length < 3) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pts = ring.map((p: any) => {
      const sp = cam.worldToScreen(p.x, p.y);
      if (sp.x < minX) minX = sp.x;
      if (sp.y < minY) minY = sp.y;
      if (sp.x > maxX) maxX = sp.x;
      if (sp.y > maxY) maxY = sp.y;
      return sp;
    });
    if (!Number.isFinite(minX)) return;

    const origin = cam.worldToScreen(0, 0);
    const pxPerMeter = Math.abs(cam.worldToScreen(1, 0).x - origin.x) || 1;


    // Musterkachel ≈ 1/3 der Wanddicke → dünne Wände bekommen feineres Muster.
    const tileM = Math.max(0.02, wall.thicknessM / 3) * Math.max(0.1, wall.patternScale ?? 1);
    const scale = tileM / PATTERN_BASE_TILE_M;

    // Ausrichtung: erste Wandachse
    const a = wall.corners[0], b = wall.corners[1];
    const angleDeg = wall.patternAlignToWall
      ? -(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      : 0;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.clip();
    fillWithHatchPattern(
      ctx,
      { x: minX - 2, y: minY - 2, w: (maxX - minX) + 4, h: (maxY - minY) + 4 },
      origin, pxPerMeter,
      {
        patternId: wall.patternId as HatchPatternId,
        scale,
        angleDeg,
        skewDeg: 0,
        stretch: 1,
        color: wall.color || Defaults.lineColor,
        alpha: 0.9,
        lineWidthPx: 0.8,
      },
    );
    ctx.restore();
  }


  private _drawWallsForLabel(labelId: string) {
    if (!this.scene.walls || this.scene.walls.length === 0) return;
    const ctx = this.ctx;
    const cam = this.camera;

    // BIM-Pipeline: Pro Label/Style-Gruppe alle Wandkörper unionieren.
    // Das eliminiert automatisch innere Stoßkanten und doppelte Konturen.
    const groups = getWallUnionGroups(this.scene.walls, labelId, this.scene.getWallTopology());
    if (groups.length === 0) return;

    for (const group of groups) {
      if (!group.multi || group.multi.length === 0) continue;

      this._drawWallMulti(group.multi, group.fillColor, group.strokeColor, 1.5);
    }

    // Baustoff-Schraffur pro Wand (Mauerwerk, Stahlbeton …), an die
    // Wanddicke angepasst und in Wandrichtung ausgerichtet.
    for (const wall of this.scene.walls) {
      if (wall.labelId !== labelId) continue;
      if (!this.labels.isVisible(wall.labelId)) continue;
      if (!wall.patternId || wall.patternId === "none") continue;
      if (wall.corners.length < 2) continue;
      this._paintWallPattern(wall);
    }


    // 3. Selektion / Helpers / Bezugslinien — pro Wand
    // Eine Wand gilt als selektiert, sobald die Selection eine wallId trägt —
    // egal ob direkt (SelectionType.WALL) oder via Eckpunkt (SelectionType.POINT).
    const selectedWallId: string | null =
      this.selection && (this.selection as any).wallId
        ? (this.selection as any).wallId
        : null;

    for (const wall of this.scene.walls) {
      if (wall.labelId !== labelId) continue;
      if (!this.labels.isVisible(wall.labelId)) continue;
      if (wall.corners.length < 2) continue;

      const isSelected = selectedWallId === wall.id;

      // Selektion: die selektierte Wand bleibt als eigenes Solid sichtbar.
      // An T-Stößen wird nur die Fläche strikt höher priorisierter Wände aus
      // dem blauen Overlay herausgenommen; die Nachbarwand wird danach erneut
      // darüber gezeichnet. So gehört der Anschlussbereich optisch zur jeweils
      // selektierten Wand, ohne die bestehende Wand zu übermalen.
      // Selektion: die selektierte Wand wird als volles blaues Solid gezeichnet.
      // Anschließend werden ALLE anderen Wandgruppen erneut darüber gezeichnet,
      // damit Nachbarwände visuell unverändert (komplett) bleiben und die
      // selektierte Wand optisch sauber an sie andockt — ohne aus der
      // Nachbarwand etwas auszusparen.
      if (isSelected) {
        const topo = this.scene.getWallTopology();
        const selRing = buildHealedWallSolidRing(wall, this.scene.walls, topo);
        if (selRing.length >= 3) {
          const selMulti: MultiPolygon = [[ringToPCPolygon(selRing)]] as MultiPolygon;
          this._drawWallMulti(selMulti, "rgba(77,163,255,0.28)", Defaults.wallSelectionColor, 2.2);

          // T-Stoß-Analyse (geometrisch, auto-split-robust): Nur wenn die
          // selektierte Wand selbst als Branch in eine Host-Wand läuft, wird
          // diese Host-Wand nochmals darüber gezeichnet. Alle anderen Wände
          // bleiben im ursprünglichen Union-Render, damit fremde T-Kreuzungen
          // nicht durch Einzelwand-Redraws verfälscht werden.
          const hostsOfSelected = new Set<string>();
          const selStart = wall.corners[0];
          const selEnd = wall.corners[wall.corners.length - 1];
          const NODE_TOL = 0.05;
          const EDGE_TOL = 0.03;
          for (const ow of this.scene.walls) {
            if (ow.id === wall.id || ow.corners.length < 2) continue;
            for (const ep of [selStart, selEnd]) {
              const owStart = ow.corners[0];
              const owEnd = ow.corners[ow.corners.length - 1];
              if (Math.hypot(ep.x - owStart.x, ep.y - owStart.y) <= NODE_TOL) continue;
              if (Math.hypot(ep.x - owEnd.x, ep.y - owEnd.y) <= NODE_TOL) continue;
              let onSel = false;
              for (let i = 1; i < ow.corners.length - 1; i++) {
                const c = ow.corners[i];
                if (Math.hypot(ep.x - c.x, ep.y - c.y) <= NODE_TOL) { onSel = true; break; }
              }
              if (!onSel) {
                for (let i = 0; i < ow.corners.length - 1; i++) {
                  const a = ow.corners[i], b = ow.corners[i + 1];
                  const abx = b.x - a.x, aby = b.y - a.y;
                  const ab2 = abx * abx + aby * aby || 1e-12;
                  const t = ((ep.x - a.x) * abx + (ep.y - a.y) * aby) / ab2;
                  if (t <= 0.02 || t >= 0.98) continue;
                  const qx = a.x + abx * t, qy = a.y + aby * t;
                  if (Math.hypot(qx - ep.x, qy - ep.y) <= EDGE_TOL) { onSel = true; break; }
                }
              }
              if (onSel) { hostsOfSelected.add(ow.id); break; }
            }
          }

          for (const wid of hostsOfSelected) {
            const ow = this.scene.walls.find(w => w.id === wid);
            const group = groups.find(g => g.wallIds.includes(wid));
            if (!ow || !group || ow.corners.length < 2) continue;
            const r = buildHealedWallSolidRing(ow, this.scene.walls, topo);
            if (r.length < 3) continue;
            const multi: MultiPolygon = [[ringToPCPolygon(r)]] as MultiPolygon;
            this._drawWallMulti(multi, group.fillColor, group.strokeColor, 1.5);
          }
        }
      }


      // Bezugslinie + Mittellinie als Helper (nur Wand-Tool aktiv ODER selektiert)
      if (this.showWallHelpers || isSelected) {
        const lines = computeHealedWallLines(wall, this.scene.walls, this.scene.getWallTopology());
        // Bezugslinie (= wall.corners inkl. Wölbung). Bei Selektion deutlich
        // kräftiger, damit sofort erkennbar ist, wo die Bezugslinie liegt.
        const refPts = tessellateWithBulges(wall.corners, (wall as any).bulges, false, 24);
        ctx.save();
        ctx.lineCap = "round";

        ctx.strokeStyle = isSelected ? "rgba(255,138,0,0.98)" : "rgba(80,80,80,0.85)";
        ctx.lineWidth = isSelected ? 2.6 : 1;
        ctx.beginPath();
        const r0 = cam.worldToScreen(refPts[0].x, refPts[0].y);
        ctx.moveTo(r0.x, r0.y);
        for (let i = 1; i < refPts.length; i++) {
          const p = cam.worldToScreen(refPts[i].x, refPts[i].y);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // Mittellinie gestrichelt
        if (lines.helpCorners.length >= 2) {
          ctx.strokeStyle = "rgba(120,120,120,0.55)";
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          const h0 = cam.worldToScreen(lines.helpCorners[0].x, lines.helpCorners[0].y);
          ctx.moveTo(h0.x, h0.y);
          for (let i = 1; i < lines.helpCorners.length; i++) {
            const p = cam.worldToScreen(lines.helpCorners[i].x, lines.helpCorners[i].y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // Fangpunkte werden ganz am Ende (über ALLEN Wänden/Labeln) gezeichnet,
      // damit sie sichtbar bleiben und stets greifbar sind. Siehe _drawSelectedWallHandles().

    }
  }

  /**
   * Fangpunkte:
   *  – Selektierte Wand: kräftige weiße Punkte mit blauem Ring (immer ganz vorne).
   *  – Alle anderen Wände: dezente Hilfs-Punkte, sobald irgendeine Wand selektiert
   *    oder gerade ein Wand-Edit aktiv ist, damit Verschieben/Bewegen jederzeit
   *    eindeutig an Nachbarwände andocken kann.
   */
  private _drawSelectedWallHandles() {
    const sel: any = this.selection;
    const selWallId: string | null = sel && sel.wallId ? sel.wallId : null;
    if (!selWallId) return;
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.save();
    const selWall = this.scene.walls.find(w => w.id === selWallId);
    const selLabel = selWall?.labelId;
    const isHiddenCorner = (w: any, idx: number) => !!w?.hiddenCornerIndices?.includes(idx);

    const dot = (x: number, y: number, r: number, fill: string, stroke: string, lw: number) => {
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    // Dezente Hilfs-Punkte auf allen anderen Wänden — NUR während eines aktiven
    // Wand-Edits (Bewegen/Verschieben/Drehen aus der Hub-Box).
    if (this.wallEditActive) for (const w of this.scene.walls) {
      if (w.id === selWallId) continue;
      if (selLabel && w.labelId !== selLabel) continue;
      if (!this.labels.isVisible(w.labelId)) continue;
      // Bezugslinien-Eckpunkte (kräftiger als die Gegenseite)
      for (let i = 0; i < w.corners.length; i++) {
        if (isHiddenCorner(w, i)) continue;
        const c = w.corners[i];
        const s = cam.worldToScreen(c.x, c.y);
        dot(s.x, s.y, 3, "rgba(255,255,255,0.85)", "rgba(120,120,120,0.65)", 1);
      }
    }

    // Kräftige Fangpunkte der selektierten Wand (nur Bezugslinie).
    if (selWall && this.labels.isVisible(selWall.labelId)) {
      for (let i = 0; i < selWall.corners.length; i++) {
        if (isHiddenCorner(selWall, i)) continue;
        const c = selWall.corners[i];
        const s = cam.worldToScreen(c.x, c.y);
        dot(s.x, s.y, 4.5, "#ffffff", Defaults.wallSelectionColor, 1.6);
      }
    }

    ctx.restore();
  }


  /** Wenn aktiv, wird die Mittel-/Helplinie der Wände als Hilfslinie gezeichnet. */
  showWallHelpers = false;

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

  /** Legt das CAD-Schraffurmuster über die aktuell aufgebaute (geclippte) Fläche. */
  private _paintHatchPattern(ctx: CanvasRenderingContext2D, cam: Camera, hatch: any) {
    if (!hatch?.patternEnabled || !hatch.points?.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of hatch.points) {
      const sp = cam.worldToScreen(p.x, p.y);
      if (sp.x < minX) minX = sp.x;
      if (sp.y < minY) minY = sp.y;
      if (sp.x > maxX) maxX = sp.x;
      if (sp.y > maxY) maxY = sp.y;
    }
    if (!Number.isFinite(minX)) return;
    const zero = cam.worldToScreen(0, 0);
    const pxPerMeter = Math.abs(cam.worldToScreen(1, 0).x - zero.x) || 1;
    const origin = cam.worldToScreen(hatch.patternOffsetX ?? 0, hatch.patternOffsetY ?? 0);
    ctx.save();
    ctx.clip("evenodd");
    fillWithHatchPattern(
      ctx,
      { x: minX - 2, y: minY - 2, w: (maxX - minX) + 4, h: (maxY - minY) + 4 },
      origin, pxPerMeter,
      {
        patternId: (hatch.patternId || "mauerwerk") as HatchPatternId,
        scale: hatch.patternScale ?? 1,
        angleDeg: hatch.patternAngleDeg ?? 0,
        skewDeg: hatch.patternSkewDeg ?? 0,
        stretch: hatch.patternStretch ?? 1,
        color: hatch.strokeColor || Defaults.hatchStrokeColor,
        alpha: 1,
        lineWidthPx: Math.max(0.6, this._scaledStrokePx(hatch.strokeWidthPx ?? Defaults.hatchStrokePx)),
      },
    );
    ctx.restore();
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
    const outerPts = tessellateWithBulges(hatch.points, (hatch as any).bulges, true, 32);
    const p0 = cam.worldToScreen(outerPts[0].x, outerPts[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < outerPts.length; i++) {
      const sp = cam.worldToScreen(outerPts[i].x, outerPts[i].y);
      ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();

    // Holes (carved-out inner loops) → evenodd Fill schneidet sie aus
    const holes = hatch.holes || [];
    for (let hi = 0; hi < holes.length; hi++) {
      const raw = holes[hi];
      if (!raw || raw.length < 3) continue;
      const loop = tessellateWithBulges(raw, (hatch as any).holeBulges?.[hi], true, 32);
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

    // Haarlinien-Versiegelung — REIN OPTISCH auf dem bereits festgeschriebenen
    // Face-Polygon (siehe hatchSeal.ts). Verändert weder Topologie noch die
    // ermittelte Fill-Geometrie und nimmt keine weiteren Segmente auf.
    if (fillAlpha >= 0.999) {
      strokeHatchSeal(ctx, fillCol, typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1);
    }

    this._paintHatchPattern(ctx, cam, hatch);

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

    const outerRing = hatchOuterRing(hatch as any);
    const holeRings = hatchHoleRings(hatch as any);
    const areaM2 = Math.max(0, polygonAreaAbs(outerRing) - holeRings.reduce((s, h) => s + polygonAreaAbs(h), 0));
    const text = `${areaM2.toFixed(2)} m²`;
    const scale = Math.max(0.1, hatch.areaLabel.scale ?? 1);
    const baseFontSize = clamp(hatch.areaLabel.fontSizePx ?? Defaults.areaFontSizePx, 6, 72) * scale;
    const zoomFactor = cam.scale / this.referencePxPerM;
    const fontSizePx = Math.max(1, baseFontSize * zoomFactor);
    const padX = 8 * scale * zoomFactor, padY = 5 * scale * zoomFactor;

    ctx.save();
    ctx.font = `${fontSizePx}px system-ui, Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    ctx.restore();

    const textW = metrics.width;
    const boxW = textW + padX * 2;
    const boxH = fontSizePx + padY * 2;

    const polyCenter = polygonCentroid(outerRing);
    const centerWorld = v(polyCenter.x + (hatch.areaLabel.offsetX || 0), polyCenter.y + (hatch.areaLabel.offsetY || 0));
    const centerScreen = cam.worldToScreen(centerWorld.x, centerWorld.y);

    const rect = { x: centerScreen.x - boxW / 2, y: centerScreen.y - boxH / 2, w: boxW, h: boxH };
    const rotationRad = hatch.areaLabel.rotationRad || 0;
    const cos = Math.cos(rotationRad), sin = Math.sin(rotationRad);
    const hw = boxW / 2, hh = boxH / 2;
    const localCorners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
    const handles = localCorners.map(p => ({
      x: centerScreen.x + p.x * cos - p.y * sin,
      y: centerScreen.y + p.x * sin + p.y * cos,
    }));

    return { text, fontSizePx, rect, handles, centerWorld, centerScreen, rotationRad, boxW, boxH } as AreaLabelLayout;
  }

  private _drawAreaLabel(hatch: Hatch, isSelected: boolean) {
    const layout = this._getAreaLabelLayout(hatch);
    if (!layout) return;

    const ctx = this.ctx;
    const bg = rgbaFromHex(hatch.areaLabel.bgColor || Defaults.areaBgColor, (hatch.areaLabel.bgAlphaPct ?? Defaults.areaBgAlphaPct) / 100);
    const textColor = hatch.areaLabel.textColor || Defaults.areaTextColor;

    ctx.save();
    ctx.translate(layout.centerScreen.x, layout.centerScreen.y);
    ctx.rotate(layout.rotationRad || 0);
    const w = (layout as any).boxW as number;
    const h = (layout as any).boxH as number;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    if (hatch.areaLabel.borderEnabled) {
      ctx.strokeStyle = hatch.areaLabel.borderColor || Defaults.areaBorderColor;
      ctx.lineWidth = Math.max(0.5, (hatch.areaLabel.borderWidthPx ?? Defaults.areaBorderWidthPx));
      ctx.stroke();
    }
    ctx.fillStyle = textColor;
    ctx.font = `${layout.fontSizePx}px system-ui, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(layout.text, 0, 0.5);
    ctx.restore();

    if (isSelected) {
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      for (const hd of layout.handles) {
        ctx.beginPath();
        ctx.rect(hd.x - 4, hd.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
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
      const outer = tessellateWithBulges(hatch.points, (hatch as any).bulges, true, 32);
      const holesRaw = hatch.holes || [];
      const holeLoops = holesRaw.map((loop: any, hi: number) =>
        (loop && loop.length >= 3) ? tessellateWithBulges(loop, (hatch as any).holeBulges?.[hi], true, 32) : null);
      const tracePath = () => {
        ctx.beginPath();
        const p0 = cam.worldToScreen(outer[0].x, outer[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < outer.length; i++) {
          const sp = cam.worldToScreen(outer[i].x, outer[i].y);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
      };
      const traceHoles = () => {
        for (const loop of holeLoops) {
          if (!loop) continue;
          const h0 = cam.worldToScreen(loop[0].x, loop[0].y);
          ctx.moveTo(h0.x, h0.y);
          for (let i = 1; i < loop.length; i++) {
            const hp = cam.worldToScreen(loop[i].x, loop[i].y);
            ctx.lineTo(hp.x, hp.y);
          }
          ctx.closePath();
        }
      };

      // Blue fill: outer minus holes (evenodd)
      tracePath();
      traceHoles();
      ctx.fillStyle = "rgba(77,163,255,0.12)";
      ctx.fill("evenodd");

      // Outer outline
      tracePath();
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = Math.max(1.5, scaledStrokePx + 1.6);
      ctx.stroke();

      // Hole outlines (sichtbar als Kanten)
      for (const loop of holeLoops) {
        if (!loop) continue;
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

    const drawHandle = (sp: Vec2, isActive: boolean) => {
      ctx.fillStyle = "rgba(77,163,255,0.12)";
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isActive) {
        ctx.fillStyle = "rgba(77,163,255,0.95)";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    const sel = this.selection;
    const isPointSel = sel && sel.type === SelectionType.POINT;
    for (let i = 0; i < hatch.points.length; i++) {
      const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
      const active = !!(isPointSel && sel.pointIndex === i);
      drawHandle(sp, active);
    }
    const holes = hatch.holes || [];
    for (let h = 0; h < holes.length; h++) {
      const loop = holes[h];
      if (!loop) continue;
      for (let i = 0; i < loop.length; i++) {
        const sp = cam.worldToScreen(loop[i].x, loop[i].y);
        const active = !!(isPointSel && (sel as any).holeIndex === h && sel.pointIndex === i);
        drawHandle(sp, active);
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
    if ((seg as any).bulge) {
      const bp = tessellateWithBulges([seg.a, seg.b], [(seg as any).bulge], false, 32)
        .map(p => cam.worldToScreen(p.x, p.y));
      ctx.moveTo(bp[0].x, bp[0].y);
      for (let i = 1; i < bp.length; i++) ctx.lineTo(bp[i].x, bp[i].y);
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
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
    this._drawSegmentMidDivisionMarkers(seg);
    ctx.restore();
  }

  /** Zeichnet kleine Snap-Marker für aktivierte Mittel-/Teilungs-Snaps eines
   *  Segments (nur wenn das Segment selektiert oder gehovert ist). */
  private _drawSegmentMidDivisionMarkers(seg: { a: Vec2; b: Vec2; midpointSnap?: boolean; divisionSnap?: number }) {
    const divN = (typeof seg.divisionSnap === "number" && seg.divisionSnap >= 2) ? Math.floor(seg.divisionSnap) : 0;
    if (!seg.midpointSnap && divN < 2) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const ts: number[] = [];
    if (seg.midpointSnap) ts.push(0.5);
    if (divN >= 2) { for (let k = 1; k < divN; k++) ts.push(k / divN); }
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 1.5;
    for (const t of ts) {
      const wx = seg.a.x + (seg.b.x - seg.a.x) * t;
      const wy = seg.a.y + (seg.b.y - seg.a.y) * t;
      const sp = cam.worldToScreen(wx, wy);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
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

    this._drawSegmentMidDivisionMarkers(seg);
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
    extensionStyle?: "dashed" | "solid"; extensionColor?: string; extensionAlpha?: number;
    freeTextBold?: boolean; freeTextItalic?: boolean; freeTextColor?: string;
    doorRefId?: string | null;
  }, isPreview = false) {
    const g = getDimensionGeometry(dim);

    if ((dim as any).mode === "angle") {
      this._drawAngleDimension(ctx, cam, dim as any, isPreview);
      return;
    }

    const p1 = cam.worldToScreen(g.ext1a.x, g.ext1a.y);
    const p2 = cam.worldToScreen(g.ext1b.x, g.ext1b.y);
    const p3 = cam.worldToScreen(g.ext2a.x, g.ext2a.y);
    const p4 = cam.worldToScreen(g.ext2b.x, g.ext2b.y);
    const d1 = cam.worldToScreen(g.d1.x, g.d1.y);
    const d2 = cam.worldToScreen(g.d2.x, g.d2.y);
    const mid = cam.worldToScreen(g.mid.x, g.mid.y);

    ctx.save();
    const baseStroke = dim.lineColor || Defaults.measureLineColor;

    // Verlängerungslinien (eigene Farbe/Stil/Transparenz).
    if (dim.showExtensions) {
      ctx.save();
      const extColor = dim.extensionColor || baseStroke;
      const extAlpha = (typeof dim.extensionAlpha === "number") ? Math.max(0, Math.min(1, dim.extensionAlpha)) : 1;
      ctx.strokeStyle = hexToRgba(extColor, extAlpha);
      ctx.lineWidth = isPreview ? 1.0 : 1.1;
      const tickLenPxForDash = (dim.tickLengthM || Defaults.measureTickLengthM) * cam.scale;
      if ((dim.extensionStyle || "dashed") === "dashed") {
        const dash = Math.max(2, tickLenPxForDash * 0.45);
        ctx.setLineDash([dash, dash]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
      ctx.restore();
    }

    // Maßlinie
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = isPreview ? 1.2 : 1.3;
    ctx.beginPath();
    if (g.arcPts && g.arcPts.length > 2) {
      const sp0 = cam.worldToScreen(g.arcPts[0].x, g.arcPts[0].y);
      ctx.moveTo(sp0.x, sp0.y);
      for (let i = 1; i < g.arcPts.length; i++) {
        const sp = cam.worldToScreen(g.arcPts[i].x, g.arcPts[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
    } else {
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
    }
    ctx.stroke();

    const tickDir = norm(sub(g.d2, g.d1));
    const tickLen = dim.tickLengthM || Defaults.measureTickLengthM;
    // Gerade Maßketten: Endstriche senkrecht zur Maßlinie.
    // Gewölbte Maßketten: Endstriche zeigen radial auf die gemessenen Endpunkte.
    const tickN1 = g.arcPts
      ? (len(sub(g.d1, g.ext1a)) > 1e-9 ? norm(sub(g.d1, g.ext1a)) : perpLeft(tickDir))
      : perpLeft(tickDir);
    const tickN2 = g.arcPts
      ? (len(sub(g.d2, g.ext2a)) > 1e-9 ? norm(sub(g.d2, g.ext2a)) : perpLeft(tickDir))
      : perpLeft(tickDir);

    const t1aP = add(g.d1, mul(tickN1, tickLen));
    const t1bP = sub(g.d1, mul(tickN1, tickLen));
    const t2aP = add(g.d2, mul(tickN2, tickLen));
    const t2bP = sub(g.d2, mul(tickN2, tickLen));
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

    // Architekturkonvention für die Textlage:
    //  - Waagerechte Maßketten (|dx| >= |dy|): Text von unten lesbar (Winkel in (-π/2, π/2]).
    //  - Senkrechte Maßketten (|dy| >  |dx|): Text von rechts lesbar (Winkel = -π/2),
    //    damit die Zahlen niemals auf dem Kopf stehen.
    const screenAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
    let normalizedAngle = screenAngle;
    if (normalizedAngle >= Math.PI / 2) normalizedAngle -= Math.PI;
    else if (normalizedAngle < -Math.PI / 2) normalizedAngle += Math.PI;

    const tickOffsetPx = (dim.tickLengthM || Defaults.measureTickLengthM) * cam.scale;

    // Textseite: Architekturkonvention — Text sitzt IMMER oberhalb der Maßlinie
    // (im lokalen, rotierten Reader-Koordinatensystem: negatives Y = "oben").
    // Der Placement-Punkt bestimmt weiterhin, auf welcher Seite des Objekts die
    // Maßlinie liegt; der Text liegt jedoch stets über dieser Linie.
    // Das mirror-Flag flippt die Seite explizit auf Wunsch.
    const textSideSign = ((dim as any).mirror ? 1 : -1);

    ctx.translate(mid.x, mid.y);
    ctx.rotate(normalizedAngle);

    // Freie-Text-Styling (Fett/Kursiv) nur wenn useFreeText aktiv.
    const fontParts: string[] = [];
    if (dim.useFreeText) {
      if (dim.freeTextItalic) fontParts.push("italic");
      if (dim.freeTextBold) fontParts.push("bold");
    }
    ctx.font = `${fontParts.join(" ")} ${fontPx}px system-ui, Arial, sans-serif`.trim();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.7;
    const descent = metrics.actualBoundingBoxDescent || fontPx * 0.3;
    const textHeight = ascent + descent;
    const padX = Math.max(4, fontPx * 0.45);
    const padY = Math.max(2, fontPx * 0.22);
    // Konfigurierbarer Abstand (px) zwischen Maßlinie und Text-Kante.
    const gapPx = ((dim as any).textGapPx ?? Defaults.measureTextGapPx) * zoomFactor;
    const textOffsetPx = textHeight / 2 + Math.max(0, gapPx);
    const textY = textSideSign * textOffsetPx;

    if (dim.textBgEnabled) {
      ctx.fillStyle = hexToRgba(dim.textBgColor || Defaults.measureTextBgColor, dim.textBgAlpha ?? Defaults.measureTextBgAlpha);
      ctx.fillRect(-textWidth / 2 - padX, textY - textHeight / 2 - padY, textWidth + padX * 2, textHeight + padY * 2);
    }

    const mainTextColor = (dim.useFreeText && dim.freeTextColor)
      ? dim.freeTextColor
      : (dim.textColor || Defaults.measureTextColor);
    ctx.fillStyle = mainTextColor;
    ctx.fillText(text, 0, textY);

    // Tür-/Fenster-Referenz: Höhe (in Haupt-Textgröße) + BRH (kleiner) auf der
    // gegenüberliegenden Seite der Maßlinie anzeigen (unterhalb, wenn Haupttext oben).
    if (dim.doorRefId) {
      const door = this.scene.getDoorById(dim.doorRefId);
      if (door) {
        const dec = Math.max(0, Math.min(6, dim.decimals ?? Defaults.measureDecimals));
        const unit = (dim as any).unit ?? Defaults.measureUnit;
        const showUnit = (typeof (dim as any).showUnit === "boolean") ? (dim as any).showUnit : Defaults.measureShowUnit;
        const factor = unit === "mm" ? 1000 : unit === "cm" ? 100 : 1;
        const fmt = (m: number) => {
          const t = (m * factor).toFixed(dec);
          return showUnit ? `${t} ${unit}` : t;
        };
        const overrideText = (dim as any).doorHeightText as string | undefined;
        const heightLine = (typeof overrideText === "string" && overrideText.trim().length > 0)
          ? overrideText
          : fmt(door.heightM);
        // Höhen-Text bekommt die Haupt-Textgröße (fontPx). BRH bleibt kleiner (0.78x).
        const brhFont = Math.max(1, baseSize * zoomFactor * 0.78);
        // Auf der gegenüberliegenden Seite (unterhalb bei Standard-Ausrichtung).
        const oppSign = -textSideSign;
        let y = oppSign * (textHeight / 2 + Math.max(0, gapPx));

        // Zeile 1: Höhe (Haupt-Textgröße)
        ctx.font = `${fontPx}px system-ui, Arial, sans-serif`;
        const m1 = ctx.measureText(heightLine);
        const h1 = fontPx;
        y = oppSign * (h1 / 2 + Math.max(0, gapPx));
        if (dim.textBgEnabled) {
          const pX = Math.max(4, fontPx * 0.4);
          const pY = Math.max(2, fontPx * 0.2);
          ctx.fillStyle = hexToRgba(dim.textBgColor || Defaults.measureTextBgColor, dim.textBgAlpha ?? Defaults.measureTextBgAlpha);
          ctx.fillRect(-m1.width / 2 - pX, y - h1 / 2 - pY, m1.width + pX * 2, h1 + pY * 2);
        }
        ctx.fillStyle = dim.textColor || Defaults.measureTextColor;
        ctx.fillText(heightLine, 0, y);

        // Zeile 2: BRH (kleiner)
        if (door.breakHeightVisible) {
          const brhLine = `BRH: ${fmt(door.breakHeightM)}`;
          ctx.font = `${brhFont}px system-ui, Arial, sans-serif`;
          y += oppSign * (h1 / 2 + brhFont * 0.6);
          if (dim.textBgEnabled) {
            const m2 = ctx.measureText(brhLine);
            const pX = Math.max(4, brhFont * 0.4);
            const pY = Math.max(2, brhFont * 0.2);
            ctx.fillStyle = hexToRgba(dim.textBgColor || Defaults.measureTextBgColor, dim.textBgAlpha ?? Defaults.measureTextBgAlpha);
            ctx.fillRect(-m2.width / 2 - pX, y - brhFont / 2 - pY, m2.width + pX * 2, brhFont + pY * 2);
          }
          ctx.fillStyle = dim.textColor || Defaults.measureTextColor;
          ctx.fillText(brhLine, 0, y);
        }
      }
    }

    ctx.restore();
  }


  /** Neigungsmaß: zwei Schenkel + gestrichelter grauer Radiusbogen + Gradzahl. */
  _drawAngleDimension(ctx: CanvasRenderingContext2D, cam: Camera, dim: any, isPreview = false) {
    const parts = getAngleDimensionParts(dim);
    const g = getDimensionGeometry(dim);
    const apex = cam.worldToScreen(parts.apex.x, parts.apex.y);
    const bs = cam.worldToScreen(parts.b.x, parts.b.y);
    const cs = cam.worldToScreen(parts.c.x, parts.c.y);

    ctx.save();
    // Schenkel
    ctx.strokeStyle = dim.lineColor || Defaults.measureLineColor;
    ctx.lineWidth = isPreview ? 1.2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y); ctx.lineTo(bs.x, bs.y);
    ctx.moveTo(apex.x, apex.y); ctx.lineTo(cs.x, cs.y);
    ctx.stroke();

    // Radiusbogen zwischen den Schenkeln — gestrichelt grau.
    ctx.strokeStyle = "rgba(120,120,120,0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    parts.arcPts.forEach((p, i) => {
      const sp = cam.worldToScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    });
    ctx.stroke();
    // Sehne zwischen den Schenkel-Endpunkten (Abstand B ↔ C).
    ctx.beginPath();
    ctx.moveTo(bs.x, bs.y); ctx.lineTo(cs.x, cs.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gradzahl
    const text = g.text || "";
    if (text) {
      const zoomFactor = cam.scale / this.referencePxPerM;
      const fontPx = Math.max(1, (dim.textSizePx || Defaults.measureTextSizePx) * zoomFactor);
      const label = cam.worldToScreen(g.mid.x, g.mid.y);
      const fontParts: string[] = [];
      if (dim.useFreeText) {
        if (dim.freeTextItalic) fontParts.push("italic");
        if (dim.freeTextBold) fontParts.push("bold");
      }
      ctx.font = `${fontParts.join(" ")} ${fontPx}px system-ui, Arial, sans-serif`.trim();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const m = ctx.measureText(text);
      const th = (m.actualBoundingBoxAscent || fontPx * 0.7) + (m.actualBoundingBoxDescent || fontPx * 0.3);
      if (dim.textBgEnabled) {
        const padX = Math.max(4, fontPx * 0.45);
        const padY = Math.max(2, fontPx * 0.22);
        ctx.fillStyle = hexToRgba(dim.textBgColor || Defaults.measureTextBgColor, dim.textBgAlpha ?? Defaults.measureTextBgAlpha);
        ctx.fillRect(label.x - m.width / 2 - padX, label.y - th / 2 - padY, m.width + padX * 2, th + padY * 2);
      }
      ctx.fillStyle = (dim.useFreeText && dim.freeTextColor)
        ? dim.freeTextColor
        : (dim.textColor || Defaults.measureTextColor);
      ctx.fillText(text, label.x, label.y);
    }
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
      baseFontSizePt: textStyleFontSizePt(box.style),
      displayScale: (cam.scale / this.referencePxPerM) * this.textPtScale,
      baseColor: box.style.textColor,
      bgColor: box.style.bgColor,
      bgAlpha: (box.style.bgAlphaPct || 0) / 100,
      textAlpha: ((box.style as any).textAlphaPct ?? 100) / 100,
      align: box.style.align,
      wrap: box.style.wrap,
      baseBold: (box.style as any).bold,
      baseItalic: (box.style as any).italic,
      baseUnderline: (box.style as any).underline,
      baseStrike: (box.style as any).strike,
      lineHeightPct: (box.style as any).lineHeightPct,
      borderEnabled: box.style.borderEnabled,
      borderColor: box.style.borderColor,
      borderWidthPx: box.style.borderWidthPx,
      paddingPx: 1 * (cam.scale / this.referencePxPerM),
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

  /**
   * Tabellen (native Szenenobjekte) — Zeichnung in Weltkoordinaten.
   * Zellmaße stammen in Papier-mm aus dem gemeinsamen Tabellenmodell und
   * werden über `mPerMm * scale` in Meter und dann über die Kamera in Pixel
   * umgerechnet.
   */
  private _drawTablesForLabel(labelId: string) {
    for (const t of ((this.scene as any).tables || []) as any[]) {
      if (t.labelId !== labelId) continue;
      if (!this.labels.isVisible(t.labelId)) continue;
      this._drawSingleTable(t);
    }
  }

  private _drawSingleTable(t: any) {
    const model = normalizeTable(t.data);
    const layout = layoutTable(model);
    if (layout.widthMm <= 0 || layout.heightMm <= 0) return;
    const cam = this.camera;
    const ctx = this.ctx;
    const pxPerMm = t.mPerMm * (t.scale || 1) * cam.scale;
    const cs = cam.worldToScreen(t.center.x, t.center.y);
    const wPx = layout.widthMm * pxPerMm;
    const hPx = layout.heightMm * pxPerMm;

    ctx.save();
    ctx.translate(cs.x, cs.y);
    ctx.rotate(t.rotationRad || 0);
    ctx.translate(-wPx / 2, -hPx / 2);

    // Flächen
    if (model.background) {
      ctx.fillStyle = model.background;
      ctx.fillRect(0, 0, wPx, hPx);
    }
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        if (isCovered(model, r, c)) continue;
        const rect = cellRectMm(model, layout, r, c);
        const f = effectiveFormat(model, r, c);
        if (f.background) {
          ctx.fillStyle = f.background;
          ctx.fillRect(rect.xMm * pxPerMm, rect.yMm * pxPerMm, rect.wMm * pxPerMm, rect.hMm * pxPerMm);
        }
      }
    }

    // Rahmen + Text je Zelle
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        if (isCovered(model, r, c)) continue;
        const rect = cellRectMm(model, layout, r, c);
        const x = rect.xMm * pxPerMm, y = rect.yMm * pxPerMm;
        const w = rect.wMm * pxPerMm, h = rect.hMm * pxPerMm;
        const b = effectiveBorders(model, r, c);
        ctx.strokeStyle = model.borderColor || "#000000";
        ctx.lineWidth = Math.max(0.5, b.widthPx);
        const line = (x1: number, y1: number, x2: number, y2: number) => {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        };
        if (b.top) line(x, y, x + w, y);
        if (b.left) line(x, y, x, y + h);
        if (b.right) line(x + w, y, x + w, y + h);
        if (b.bottom) line(x, y + h, x + w, y + h);
        if (b.bottomDouble) line(x, y + h - Math.max(1.5, b.widthPx * 2), x + w, y + h - Math.max(1.5, b.widthPx * 2));

        const raw = model.cells[r]?.[c] ?? "";
        const text = raw.startsWith("=") ? String(evalCell(model.cells, r, c)) : raw;
        if (!text) continue;
        const f = effectiveFormat(model, r, c);
        // Zentrale pt-Skalierung wie im Textwerkzeug (keine eigene Umrechnung).
        const fontPx = ptToCssPx(f.fontSizePt) * (cam.scale / this.referencePxPerM) * this.textPtScale;
        if (fontPx < 3) continue;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = f.color || "#000000";
        ctx.font = `${f.italic ? "italic " : ""}${f.bold ? "600 " : ""}${fontPx}px Inter, system-ui, sans-serif`;
        ctx.textAlign = f.align === "center" ? "center" : f.align === "right" ? "right" : "left";
        ctx.textBaseline = f.valign === "top" ? "top" : f.valign === "bottom" ? "bottom" : "middle";
        const padPx = 0.8 * pxPerMm;
        const tx = f.align === "center" ? x + w / 2 : f.align === "right" ? x + w - padPx : x + padPx;
        const ty = f.valign === "top" ? y + padPx : f.valign === "bottom" ? y + h - padPx : y + h / 2;
        ctx.fillText(text, tx, ty);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private _drawTextBoxSelection() {
    if (!this.selection || (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE)) return;
    const id = (this.selection as any).textBoxId;
    if (!id) return;
    const box = (this.scene as any).getBoxById(id);
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

  private _drawFreeStrokeSelection() {
    const sel = this.selection as any;
    if (!sel || sel.type !== SelectionType.FREE_STROKE || !sel.freeStrokeId) return;
    const s = this.scene.getFreeStrokeById(sel.freeStrokeId);
    if (!s || s.points.length < 2 || !this.labels.isVisible(s.labelId)) return;
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = Math.min(Math.max(s.thicknessM * cam.scale + 1.5, 2.5), 5);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    const p0 = cam.worldToScreen(s.points[0].x, s.points[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < s.points.length; i++) {
      const p = cam.worldToScreen(s.points[i].x, s.points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    // Endpoint markers
    const last = s.points[s.points.length - 1];
    for (const ep of [s.points[0], last]) {
      const sp = cam.worldToScreen(ep.x, ep.y);
      ctx.fillStyle = "rgba(77,163,255,0.18)";
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
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
    if (s.lineStyle === "spray" && colorOverride === null) {
      this._drawFreeStrokeSpray(s);
      return;
    }
    if (s.lineStyle === "brush" && colorOverride === null) {
      this._drawFreeStrokeBrush(s);
      return;
    }
    if (s.lineStyle === "calligraphy" && colorOverride === null) {
      this._drawFreeStrokeCalligraphy(s);
      return;
    }
    if (s.lineStyle === "ink" && colorOverride === null) {
      this._drawFreeStrokeInk(s);
      return;
    }
    if (s.lineStyle === "crayon" && colorOverride === null) {
      this._drawFreeStrokeCrayon(s);
      return;
    }
    if (s.lineStyle === "chalk" && colorOverride === null) {
      this._drawFreeStrokeChalk(s);
      return;
    }
    if (s.lineStyle === "pencil" && colorOverride === null) {
      this._drawFreeStrokePencil(s);
      return;
    }
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    ctx.save();
    // Stil-spezifische Overrides für Marker/Bleistift.
    let strokeColor = colorOverride || rgbaFromHex(s.color, s.opacity);
    let strokeWidth = widthOverridePx != null ? widthOverridePx : this.segStrokePx(s.thicknessM);
    if (colorOverride === null && s.lineStyle === "marker") {
      // Textmarker: dick, flach, halbtransparent (multiply).
      strokeColor = rgbaFromHex(s.color, Math.min(s.opacity, 0.4));
      (ctx as any).globalCompositeOperation = "multiply";
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      strokeWidth = strokeWidth * 1.4;
    } else {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(this._dashForFreeStroke(s));
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
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

  /** Sprühdose: zufällige Punkte innerhalb Radius entlang Pfad. */
  private _drawFreeStrokeSpray(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const radiusPx = Math.max(2, (s.thicknessM / 2) * cam.scale);
    const spacingPx = Math.max(1.5, radiusPx * 0.35);
    const density = 6; // Punkte pro Sample
    // Deterministischer PRNG basierend auf Stroke-ID, damit sich das Rauschen nicht bei Re-Render ändert.
    let seed = 0;
    for (let i = 0; i < s.id.length; i++) seed = (seed * 31 + s.id.charCodeAt(i)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    ctx.save();
    ctx.fillStyle = rgbaFromHex(s.color, Math.min(s.opacity, 0.5));
    let acc = 0;
    let prev = cam.worldToScreen(pts[0].x, pts[0].y);
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
        const cx = prev.x + dx * t;
        const cy = prev.y + dy * t;
        for (let k = 0; k < density; k++) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * radiusPx;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        acc = 0;
      }
      acc += segLen - used;
      prev = cur;
    }
    ctx.restore();
  }

  /** Pinsel: geschwungenes Band — dünn an den Enden, deutlich dicker in der Mitte. */
  private _drawFreeStrokeBrush(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const baseW = this.segStrokePx(s.thicknessM);
    const sp = pts.map(p => cam.worldToScreen(p.x, p.y));
    const n = sp.length;
    // Breitenprofil: sanft anschwellend, Maximum in der Mitte (~1.6x).
    const widths: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const swell = Math.pow(Math.sin(Math.PI * t), 0.55);
      widths.push(Math.max(0.4, baseW * (0.10 + 1.5 * swell)) / 2);
    }
    ctx.save();
    ctx.fillStyle = rgbaFromHex(s.color, s.opacity);
    this._fillVariableRibbon(sp, widths);
    ctx.restore();
  }

  /**
   * Füllt ein Band mit variabler Halbbreite entlang der Punktfolge.
   * Nutzt gemittelte Normalen + quadratische Glättung für elegante Schwünge.
   */
  private _fillVariableRibbon(sp: { x: number; y: number }[], halfWidths: number[]) {
    const ctx = this.ctx;
    const n = sp.length;
    if (n < 2) return;
    const nx: number[] = [], ny: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = sp[Math.max(0, i - 1)];
      const b = sp[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      nx.push(-dy); ny.push(dx);
    }
    const left = sp.map((p, i) => ({ x: p.x + nx[i] * halfWidths[i], y: p.y + ny[i] * halfWidths[i] }));
    const right = sp.map((p, i) => ({ x: p.x - nx[i] * halfWidths[i], y: p.y - ny[i] * halfWidths[i] }));
    const smoothTo = (pts: { x: number; y: number }[]) => {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    };
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    smoothTo(left);
    const rev = right.slice().reverse();
    ctx.lineTo(rev[0].x, rev[0].y);
    smoothTo(rev);
    ctx.closePath();
    ctx.fill();
  }

  /** Kalligrafie: Federband mit fester Neigung, geschwungen und in der Mitte voller. */
  private _drawFreeStrokeCalligraphy(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const nibW = this.segStrokePx(s.thicknessM) * 1.25;
    const nibMin = Math.max(0.6, nibW * 0.14);
    const nibAngle = -Math.PI / 4; // 45° Feder-Neigung
    const cosA = Math.cos(nibAngle), sinA = Math.sin(nibAngle);
    const sp = pts.map(p => cam.worldToScreen(p.x, p.y));
    const n = sp.length;
    ctx.save();
    ctx.fillStyle = rgbaFromHex(s.color, s.opacity);
    // Breite hängt von Laufrichtung zur Feder ab (klassischer Feder-Effekt)
    // und schwillt zur Mitte hin an.
    const halfFor = (i: number) => {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const perp = Math.abs(dx * -sinA + dy * cosA); // 0 = längs Feder, 1 = quer
      const t = n > 1 ? i / (n - 1) : 0.5;
      const swell = 0.65 + 0.35 * Math.pow(Math.sin(Math.PI * t), 0.6);
      return Math.max(nibMin, nibW * (0.18 + 0.82 * perp) * swell) / 2;
    };
    for (let i = 1; i < n; i++) {
      const a = sp[i - 1], b = sp[i];
      const ha = halfFor(i - 1), hb = halfFor(i);
      // Bandachse = Federrichtung (fest), Breite variiert.
      ctx.beginPath();
      ctx.moveTo(a.x + cosA * ha, a.y + sinA * ha);
      ctx.lineTo(a.x - cosA * ha, a.y - sinA * ha);
      ctx.lineTo(b.x - cosA * hb, b.y - sinA * hb);
      ctx.lineTo(b.x + cosA * hb, b.y + sinA * hb);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }


  /** Tinte: taperende Enden, volle Mitte. */
  private _drawFreeStrokeInk(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const baseW = this.segStrokePx(s.thicknessM);
    const n = pts.length;
    ctx.save();
    ctx.strokeStyle = rgbaFromHex(s.color, s.opacity);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < n; i++) {
      const a = cam.worldToScreen(pts[i - 1].x, pts[i - 1].y);
      const b = cam.worldToScreen(pts[i].x, pts[i].y);
      const tMid = (i - 0.5) / (n - 1);
      const taper = Math.min(1, Math.min(tMid, 1 - tMid) * 6);
      ctx.lineWidth = Math.max(0.4, baseW * (0.15 + 0.85 * taper));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Bleistift: mehrere körnige Passes mit Jitter. */
  private _drawFreeStrokePencil(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const baseW = this.segStrokePx(s.thicknessM);
    const passes = 4;
    ctx.save();
    ctx.strokeStyle = rgbaFromHex(s.color, s.opacity);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const prevAlpha = ctx.globalAlpha;
    for (let pass = 0; pass < passes; pass++) {
      ctx.globalAlpha = s.opacity * 0.22;
      ctx.lineWidth = Math.max(0.5, baseW * (0.55 + pass * 0.12));
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = cam.worldToScreen(pts[i].x, pts[i].y);
        const jx = Math.sin(i * 12.9 + pass * 3.1) * 0.6 + Math.cos(i * 2.3 + pass) * 0.4;
        const jy = Math.cos(i * 7.1 + pass * 4.7) * 0.6 + Math.sin(i * 3.7 + pass) * 0.4;
        i ? ctx.lineTo(p.x + jx, p.y + jy) : ctx.moveTo(p.x + jx, p.y + jy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  }

  /** Wachsmal: wachsartig — ausgefranste Kanten, körnige, ungleichmäßige Deckung. */
  private _drawFreeStrokeCrayon(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const baseW = this.segStrokePx(s.thicknessM) * 1.15;
    const sp = pts.map(p => cam.worldToScreen(p.x, p.y));
    let seed = 0;
    for (let i = 0; i < s.id.length; i++) seed = (seed * 31 + s.id.charCodeAt(i)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    ctx.save();
    const prevComp = ctx.globalCompositeOperation;
    (ctx as any).globalCompositeOperation = "multiply";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgbaFromHex(s.color, 1);
    // 1) Mehrere schmale, seitlich versetzte Striche → typische Wachs-Streifen.
    const strands = 7;
    for (let k = 0; k < strands; k++) {
      const off = (k / (strands - 1) - 0.5) * baseW * 0.95;
      ctx.globalAlpha = s.opacity * (0.16 + rand() * 0.22);
      ctx.lineWidth = Math.max(0.6, baseW * (0.16 + rand() * 0.12));
      ctx.beginPath();
      for (let i = 0; i < sp.length; i++) {
        const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
        let dx = b.x - a.x, dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const jitter = Math.sin(i * (1.7 + k * 0.6) + k * 3.3) * baseW * 0.09;
        const px = sp[i].x + -dy * (off + jitter);
        const py = sp[i].y + dx * (off + jitter);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // 2) Grobes Wachs-Korn: Punkte-Cluster über der Strichbreite.
    ctx.fillStyle = rgbaFromHex(s.color, 1);
    for (let i = 1; i < sp.length; i++) {
      const a = sp[i - 1], b = sp[i];
      let dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const grains = Math.max(2, Math.round(L * 1.2));
      for (let g = 0; g < grains; g++) {
        const t = rand();
        const off = (rand() - 0.5) * baseW * 1.05;
        ctx.globalAlpha = s.opacity * (0.12 + rand() * 0.35);
        const gx = a.x + (b.x - a.x) * t + -dy * off;
        const gy = a.y + (b.y - a.y) * t + dx * off;
        ctx.beginPath();
        ctx.arc(gx, gy, Math.max(0.35, baseW * (0.05 + rand() * 0.1)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    (ctx as any).globalCompositeOperation = prevComp;
    ctx.globalAlpha = s.opacity;
    ctx.restore();
  }


  /** Kreide: körniges Rauschen entlang des Pfades. */
  private _drawFreeStrokeChalk(s: FreeStroke) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pts = this._renderPointsForFreeStroke(s);
    if (pts.length < 2) return;
    const baseW = this.segStrokePx(s.thicknessM);
    const density = 6;
    const r = baseW * 0.6;
    let seed = 0;
    for (let i = 0; i < s.id.length; i++) seed = (seed * 31 + s.id.charCodeAt(i)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    ctx.save();
    ctx.fillStyle = rgbaFromHex(s.color, 1);
    // Punkte entlang der Pfad-Länge sampeln.
    let prev = cam.worldToScreen(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cur = cam.worldToScreen(pts[i].x, pts[i].y);
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const segLen = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(segLen / Math.max(1, baseW * 0.4)));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const cx = prev.x + dx * t;
        const cy = prev.y + dy * t;
        for (let d = 0; d < density; d++) {
          const a = rand() * Math.PI * 2;
          const rr = Math.sqrt(rand()) * r;
          ctx.globalAlpha = s.opacity * (0.3 + rand() * 0.4);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(0.3, baseW * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      prev = cur;
    }
    ctx.globalAlpha = s.opacity;
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
