/**
 * Vektor → Pixel Rasterisierung.
 *
 * Wird von Linien-, Freihand-, Text- und Schraffur-Werkzeug benutzt, wenn der
 * Zeichenmodus auf "pixel" steht: das frisch erzeugte Vektorobjekt wird
 * offscreen über den normalen Renderer gezeichnet und als Bild-Dokument
 * (DocumentObject) in die Scene gelegt. Danach verhält es sich wie ein
 * importiertes PNG (verschieben, drehen, skalieren, radieren inkl. Smooth).
 */
import { Camera } from "./Camera";
import { Scene, type Segment, type FreeStroke, type Hatch, type TextBox, type DocumentObject } from "./Scene";
import { LabelManager } from "./LabelManager";
import { Renderer } from "./Renderer";
import { Defaults } from "./constants";

export type RasterInput =
  | { type: "segment"; obj: Segment }
  | { type: "free"; obj: FreeStroke }
  | { type: "hatch"; obj: Hatch }
  | { type: "text"; obj: TextBox };

/** Maximale Bildgröße in Pixeln (Speicherschutz). */
const MAX_PIXELS = 48_000_000;

/** true, wenn der aktuelle Zeichenmodus Pixel ist. */
export function isPixelDrawMode(app: any): boolean {
  return !!app && (app as any).defaultDrawRasterMode === "pixel";
}

function boundsOfPoints(pts: { x: number; y: number }[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Ziel-Auflösung aus den projektweiten Pixel-Einstellungen. Optionales
 * Supersampling erhöht die Renderauflösung vor dem verlustfreien PNG-Zuschnitt.
 */
function targetPxPerM(app: any): number {
  const camScale = Math.max(1, app?.camera?.scale || 80);
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  let scaleDenom = 100;
  try {
    const den = app?.getActiveSheetScaleDenom?.() ?? app?.planScaleDenom ?? app?.scaleDenom;
    if (typeof den === "number" && den > 0) scaleDenom = den;
  } catch { /* Default beibehalten */ }
  const configuredDpi = Math.max(600, Math.min(2400, Number(app?.pixelRenderDpi) || 1200));
  const ss = app?.pixelSupersampling
    ? (app?.pixelSupersamplingFactor === 4 ? 4 : 2)
    : 1;
  // DPI → Pixel pro Papiermeter; 1 Weltmeter = 1000/scaleDenom mm Papier.
  const dpiPxPerM = (configuredDpi / 25.4) * (1000 / scaleDenom) * ss;
  return Math.max(camScale * dpr * ss, dpiPxPerM, 600);
}

function worldBounds(app: any, input: RasterInput): { x: number; y: number; w: number; h: number } | null {
  const refRatio = Defaults.strokeWidthBaseScale / Math.max(1, (app?.renderer?.referencePxPerM || Defaults.strokeWidthBaseScale));
  let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  let padWorld = 0;

  if (input.type === "segment") {
    const s = input.obj;
    b = boundsOfPoints([s.a, s.b]);
    padWorld = Math.max((s.thicknessM || 0) * refRatio * 2, 0.02);
    // Pfeilspitzen brauchen zusätzlichen Rand.
    padWorld += (s.thicknessM || 0) * refRatio * 4;
  } else if (input.type === "free") {
    const s = input.obj;
    b = boundsOfPoints(s.points || []);
    padWorld = Math.max((s.thicknessM || 0) * refRatio * 4, 0.02);
  } else if (input.type === "hatch") {
    const h = input.obj as any;
    const pts = [...(h.points || [])];
    for (const loop of (h.holes || [])) for (const p of loop) pts.push(p);
    b = boundsOfPoints(pts);
    padWorld = Math.max(((h.strokeWidthPx || 0) * refRatio) / 80, 0.02);
  } else {
    const t = input.obj;
    const hw = t.widthM / 2;
    const hh = t.heightM / 2;
    const rot = t.rotationRad || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh },
    ].map(c => ({ x: t.center.x + c.x * cos - c.y * sin, y: t.center.y + c.x * sin + c.y * cos }));
    b = boundsOfPoints(corners);
    padWorld = Math.max(t.heightM * 0.15, 0.02);
  }

  if (!b) return null;
  return {
    x: b.minX - padWorld,
    y: b.minY - padWorld,
    w: Math.max(1e-4, (b.maxX - b.minX) + padWorld * 2),
    h: Math.max(1e-4, (b.maxY - b.minY) + padWorld * 2),
  };
}
/** Bounding-Box der nicht-transparenten Pixel (für engen PNG-Rahmen). */
function alphaTrimBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > 2) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    // 1 px Sicherheitsrand gegen angeschnittene Kanten.
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
    maxX = Math.min(w - 1, maxX + 1); maxY = Math.min(h - 1, maxY + 1);
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch {
    return null;
  }
}


function pushToScene(scene: Scene, input: RasterInput) {
  if (input.type === "segment") scene.segments.push(input.obj);
  else if (input.type === "free") scene.freeStrokes.push(input.obj);
  else if (input.type === "hatch") scene.hatches.push(input.obj);
  else scene.textBoxes.push(input.obj);
}

function removeFromApp(app: any, input: RasterInput) {
  try {
    if (input.type === "segment") app.scene.removeSegment(input.obj);
    else if (input.type === "free") app.scene.removeFreeStroke(input.obj);
    else if (input.type === "hatch") app.scene.removeHatch(input.obj);
    else app.scene.removeTextBox(input.obj);
  } catch (e) { console.error("rasterize: remove source failed", e); }
}

/** Ergebnis der Offscreen-Rasterisierung eines Vektorobjekts. */
export interface RasterRenderResult {
  canvas: HTMLCanvasElement;
  /** Weltrechteck, das das Canvas exakt abdeckt. */
  x: number; y: number; w: number; h: number;
  wPx: number; hPx: number;
  pxPerM: number;
  labelId: string;
}

/**
 * Rendert ein Vektorobjekt offscreen (transparenter Hintergrund) und schneidet
 * transparente Ränder weg. Gemeinsame Basis für Pixel-Bildobjekte (CAD) und
 * Raster-Zeichenebenen (Projektmappe).
 */
export function renderObjectToCanvas(
  app: any,
  input: RasterInput,
  /** Feste Zielauflösung (px pro Weltmeter); sonst aus den Pixel-Einstellungen. */
  pxPerMOverride?: number,
): RasterRenderResult | null {
  if (!app || !app.scene || !app.renderer) return null;
  const b = worldBounds(app, input);
  if (!b) return null;

  let pxPerM = pxPerMOverride && pxPerMOverride > 0 ? pxPerMOverride : targetPxPerM(app);
  let wPx = Math.ceil(b.w * pxPerM);
  let hPx = Math.ceil(b.h * pxPerM);
  if (wPx * hPx > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (wPx * hPx));
    pxPerM *= k;
    wPx = Math.max(1, Math.floor(wPx * k));
    hPx = Math.max(1, Math.floor(hPx * k));
  }
  wPx = Math.max(1, wPx);
  hPx = Math.max(1, hPx);

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cam = new Camera();
  cam.scale = pxPerM;
  cam.offsetX = -b.x * pxPerM;
  cam.offsetY = -b.y * pxPerM;

  const scene = new Scene();
  const labels = new LabelManager();
  const renderer = new Renderer(ctx, cam, scene, labels);
  renderer.setViewport(wPx, hPx);
  renderer.referencePxPerM = (app.renderer as any).referencePxPerM || Defaults.strokeWidthBaseScale;
  renderer.transparentBackground = true;
  renderer.gridSettings = { ...renderer.gridSettings, enabled: false };
  renderer.planMode = null;
  renderer.setSelection(null);
  renderer.setExtraSelections([]);

  const origLabel = (input.obj as any).labelId;
  (input.obj as any).labelId = Defaults.defaultLabelId;
  pushToScene(scene, input);
  try {
    renderer.render();
  } finally {
    (input.obj as any).labelId = origLabel;
  }

  let outCanvas: HTMLCanvasElement = canvas;
  let outX = b.x, outY = b.y, outW = b.w, outH = b.h;
  let outWPx = wPx, outHPx = hPx;
  const trim = alphaTrimBox(ctx, wPx, hPx);
  if (trim && (trim.w < wPx || trim.h < hPx)) {
    const c2 = document.createElement("canvas");
    c2.width = trim.w;
    c2.height = trim.h;
    const c2ctx = c2.getContext("2d");
    if (c2ctx) {
      c2ctx.imageSmoothingEnabled = false;
      c2ctx.drawImage(canvas, trim.x, trim.y, trim.w, trim.h, 0, 0, trim.w, trim.h);
      outCanvas = c2;
      outWPx = trim.w;
      outHPx = trim.h;
      outX = b.x + trim.x / pxPerM;
      outY = b.y + trim.y / pxPerM;
      outW = trim.w / pxPerM;
      outH = trim.h / pxPerM;
    }
  }

  return {
    canvas: outCanvas,
    x: outX, y: outY, w: outW, h: outH,
    wPx: outWPx, hPx: outHPx,
    pxPerM,
    labelId: origLabel || Defaults.defaultLabelId,
  };
}

/**
 * Projektmappe: brennt das Vektorobjekt direkt in die Raster-Zeichenebene der
 * aktuell verwendeten Ebene ein. Es entsteht KEIN eigenes Bildobjekt — der
 * Strich wird Teil des Rasterinhalts dieser Ebene (nicht einzeln auswählbar).
 */
export function rasterizeIntoLayer(app: any, input: RasterInput): boolean {
  if (input.type === "segment" && input.obj.isGuide) return false;
  const layers = app?.rasterLayers;
  if (!layers?.get) return false;
  try {
    const probeLabel = (input.obj as any).labelId || Defaults.defaultLabelId;
    // Auflösung der Rasterebene (feste Papier-DPI, zoom-unabhängig).
    const layer = layers.get(probeLabel, true);
    if (!layer) return false;
    const res = renderObjectToCanvas(app, input, layer.pxPerM);
    if (!res) return false;
    layer.blit(res.canvas, res.x, res.y, res.w, res.h);
    removeFromApp(app, input);
    try { app.clearSelection?.(); } catch { /* optional */ }
    try { app.requestRender?.(); } catch { /* optional */ }
    try { app.commitHistorySnapshot?.(); } catch { /* optional */ }
    return true;
  } catch (e) {
    console.error("rasterizeIntoLayer failed:", e);
    return false;
  }
}

/**
 * Wandelt ein frisch erzeugtes Vektorobjekt in ein Bild-Dokument um.
 * Gibt das erzeugte DocumentObject zurück (oder null bei Fehlschlag —
 * dann bleibt das Vektorobjekt unverändert bestehen).
 */
export function rasterizeObject(app: any, input: RasterInput): DocumentObject | null {
  // Hilfslinien sind semantische, nicht druckende Vektorobjekte. Ein zuvor
  // am Linienwerkzeug aktivierter Pixelmodus darf sie deshalb niemals in ein
  // normales (und damit druckbares) DocumentObject umwandeln.
  if (input.type === "segment" && input.obj.isGuide) return null;
  if (!app || !app.scene || !app.renderer) return null;
  try {
    const b = worldBounds(app, input);
    if (!b) return null;

    let pxPerM = targetPxPerM(app);
    let wPx = Math.ceil(b.w * pxPerM);
    let hPx = Math.ceil(b.h * pxPerM);
    if (wPx * hPx > MAX_PIXELS) {
      const k = Math.sqrt(MAX_PIXELS / (wPx * hPx));
      pxPerM *= k;
      wPx = Math.max(1, Math.floor(wPx * k));
      hPx = Math.max(1, Math.floor(hPx * k));
    }
    wPx = Math.max(1, wPx);
    hPx = Math.max(1, hPx);

    const canvas = document.createElement("canvas");
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const cam = new Camera();
    cam.scale = pxPerM;
    cam.offsetX = -b.x * pxPerM;
    cam.offsetY = -b.y * pxPerM;

    const scene = new Scene();
    const labels = new LabelManager();
    const renderer = new Renderer(ctx, cam, scene, labels);
    renderer.setViewport(wPx, hPx);
    renderer.referencePxPerM = (app.renderer as any).referencePxPerM || Defaults.strokeWidthBaseScale;
    renderer.transparentBackground = true;
    renderer.gridSettings = { ...renderer.gridSettings, enabled: false };
    renderer.planMode = null;
    renderer.setSelection(null);
    renderer.setExtraSelections([]);

    const origLabel = (input.obj as any).labelId;
    (input.obj as any).labelId = Defaults.defaultLabelId;
    pushToScene(scene, input);
    try {
      renderer.render();
    } finally {
      (input.obj as any).labelId = origLabel;
    }

    // Transparente Ränder wegschneiden: der PNG-Rahmen liegt danach eng an der
    // tatsächlichen Kubatur des Objekts an (statt an der weiten Bounding-Box).
    let outCanvas: HTMLCanvasElement = canvas;
    let outX = b.x, outY = b.y, outW = b.w, outH = b.h;
    let outWPx = wPx, outHPx = hPx;
    const trim = alphaTrimBox(ctx, wPx, hPx);
    if (trim && (trim.w < wPx || trim.h < hPx)) {
      const c2 = document.createElement("canvas");
      c2.width = trim.w;
      c2.height = trim.h;
      const c2ctx = c2.getContext("2d");
      if (c2ctx) {
        c2ctx.imageSmoothingEnabled = false;
        c2ctx.drawImage(canvas, trim.x, trim.y, trim.w, trim.h, 0, 0, trim.w, trim.h);
        outCanvas = c2;
        outWPx = trim.w;
        outHPx = trim.h;
        outX = b.x + trim.x / pxPerM;
        outY = b.y + trim.y / pxPerM;
        outW = trim.w / pxPerM;
        outH = trim.h / pxPerM;
      }
    }

    const dataUrl = outCanvas.toDataURL("image/png");

    removeFromApp(app, input);

    const doc = app.scene.createDocument({
      name: "Pixelobjekt",
      kind: "image",
      src: dataUrl,
      position: { x: outX, y: outY },
      widthM: outW,
      heightM: outH,
      pixelWidth: outWPx,
      pixelHeight: outHPx,
      labelId: origLabel || Defaults.defaultLabelId,
      importScaleDenom: 100,
    });

    try { app.clearSelection?.(); } catch { /* optional */ }
    try { app.refreshLabelUI?.(); } catch { /* optional */ }
    try { app.requestRender?.(); } catch { /* optional */ }
    try { app.commitHistorySnapshot?.(); } catch { /* optional */ }
    return doc;
  } catch (e) {
    console.error("rasterizeObject failed:", e);
    return null;
  }
}

/**
 * Bequemer Hook für die Werkzeuge: rastert nur, wenn Pixelmodus aktiv ist.
 * - Projektmappe (MiniCad mit `rasterLayers`): direkt in die Raster-Ebene.
 * - CAD-Oberfläche: wie bisher als eigenständiges Pixel-Bildobjekt.
 */
export function maybeRasterize(app: any, input: RasterInput): void {
  if (!isPixelDrawMode(app)) return;
  if (app?.rasterLayers?.get) {
    if (rasterizeIntoLayer(app, input)) return;
  }
  rasterizeObject(app, input);
}
