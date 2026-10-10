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
import { coveredTiles, type CoverageGeom, type TileKey } from "./raster/rasterCoverage";
import { planRasterAction, RASTER_BUDGET } from "./raster/RasterPolicy";
import { rasterTempStoreAvailable, tempPut, tempGet, tempDeleteAction } from "./raster/RasterTempStore";
import { registerRasterJob, unregisterRasterJob, serializeOnLayer } from "./raster/RasterJobs";

export type RasterInput =
  | { type: "segment"; obj: Segment }
  | { type: "free"; obj: FreeStroke }
  | { type: "hatch"; obj: Hatch }
  | { type: "text"; obj: TextBox };

/** Maximale Bildgröße in Pixeln (Speicherschutz). */
const MAX_PIXELS = 48_000_000;

/** Arbeitsfläche je Teilbereich beim Einbrennen in Rasterebenen (≈ 64 MB RGBA). */
export const RASTER_CHUNK_PIXELS = 16_000_000;

export class RasterTooLargeError extends Error {
  constructor(public wPx: number, public hPx: number) {
    super(`Rasterfläche zu groß (${wPx} × ${hPx} px)`);
  }
}

function notifyRasterFailure(e: unknown) {
  const msg = e instanceof RasterTooLargeError
    ? "Das Objekt ist für die Pixel-Umwandlung zu groß. Es bleibt als Vektorobjekt erhalten."
    : "Pixel-Umwandlung fehlgeschlagen. Das Projekt bleibt unverändert.";
  try { void import("sonner").then(({ toast }) => toast.error(msg)); } catch { /* optional */ }
}

/** Gibt den Speicher eines Hilfs-Canvas sofort frei. */
function freeCanvas(c: HTMLCanvasElement | null | undefined) {
  if (!c) return;
  try { c.width = 0; c.height = 0; } catch { /* noop */ }
}

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
  /** Nur diesen Weltausschnitt rendern (Teilbereich für große Objekte). */
  boundsOverride?: { x: number; y: number; w: number; h: number },
): RasterRenderResult | null {
  if (!app || !app.scene || !app.renderer) return null;
  const b = boundsOverride || worldBounds(app, input);
  if (!b) return null;

  const pxPerM = pxPerMOverride && pxPerMOverride > 0 ? pxPerMOverride : targetPxPerM(app);
  let wPx = Math.ceil(b.w * pxPerM);
  let hPx = Math.ceil(b.h * pxPerM);
  // Keine stille Qualitätsminderung: zu große Flächen werden abgelehnt.
  if (wPx * hPx > MAX_PIXELS) throw new RasterTooLargeError(wPx, hPx);
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
      freeCanvas(canvas);
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

/** Eindeutiges Ergebnis einer Pixel-Umwandlung. */
export type RasterOutcome =
  /** Sofort eingebrannt, Vektororiginal entfernt. */
  | "ok"
  /** Hintergrundjob gestartet; Vektor bleibt bis zum atomaren Abschluss. */
  | "pending"
  /** Kein Pixelvorgang nötig/möglich (z. B. Hilfslinie, leeres Ergebnis). */
  | "skipped"
  /** Bewusst abgelehnt (zu groß); Vektor bleibt unverändert. */
  | "rejected"
  /** Technischer Fehler; Vektor bleibt unverändert. */
  | "failed";

function toast(kind: "error" | "info", msg: string) {
  try { void import("sonner").then(({ toast: t }) => (kind === "error" ? t.error(msg) : t(msg))); } catch { /* optional */ }
}

function sourceStillInScene(app: any, input: RasterInput): boolean {
  const sc = app?.scene;
  if (!sc) return false;
  const list = input.type === "segment" ? sc.segments : input.type === "free" ? sc.freeStrokes : input.type === "hatch" ? sc.hatches : sc.textBoxes;
  return Array.isArray(list) && list.includes(input.obj as any);
}

/** Tatsächlich belegte Geometrie für die Kachelermittlung. */
function coverageOf(app: any, input: RasterInput): CoverageGeom | null {
  const b = worldBounds(app, input);
  if (!b) return null;
  const refRatio = Defaults.strokeWidthBaseScale / Math.max(1, (app?.renderer?.referencePxPerM || Defaults.strokeWidthBaseScale));
  if (input.type === "segment") {
    const s = input.obj;
    const pad = Math.max((s.thicknessM || 0) * refRatio * 6, 0.02);
    return { polylines: [{ pts: [s.a, s.b], pad }], polygons: [] };
  }
  if (input.type === "free") {
    const s = input.obj;
    const pad = Math.max((s.thicknessM || 0) * refRatio * 4, 0.02);
    return { polylines: [{ pts: s.points || [], pad }], polygons: [] };
  }
  if (input.type === "hatch") {
    const h = input.obj as any;
    const pad = Math.max(((h.strokeWidthPx || 0) * refRatio) / 80, 0.02);
    const pts = h.points || [];
    // Offene Polylinien (Polygonwerkzeug „Linie“) belegen nur ihren Verlauf.
    if (h.closed === false) return { polylines: [{ pts, pad }], polygons: [] };
    return { polylines: [{ pts: [...pts, pts[0]].filter(Boolean), pad }], polygons: [{ pts, pad }] };
  }
  // Text: gedrehtes Rechteck als Fläche.
  const pts = [
    { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
  ];
  return { polylines: [], polygons: [{ pts, pad: 0 }] };
}

/**
 * Wiederverwendbarer Kachel-Renderer: EIN Arbeitscanvas in Kachelgröße für die
 * gesamte Aktion. Kachelursprünge liegen auf ganzen Pixeln → nahtlos.
 */
class TileRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private cam = new Camera();
  private renderer: Renderer;
  private origLabel: any;
  constructor(private app: any, private input: RasterInput, private pxPerM: number, private tilePx: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = tilePx; this.canvas.height = tilePx;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Kein Zeichenkontext verfügbar");
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    this.cam.scale = pxPerM;
    const scene = new Scene();
    this.renderer = new Renderer(ctx, this.cam, scene, new LabelManager());
    this.renderer.setViewport(tilePx, tilePx);
    this.renderer.referencePxPerM = (app.renderer as any).referencePxPerM || Defaults.strokeWidthBaseScale;
    this.renderer.transparentBackground = true;
    this.renderer.gridSettings = { ...this.renderer.gridSettings, enabled: false };
    this.renderer.planMode = null;
    this.renderer.setSelection(null);
    this.renderer.setExtraSelections([]);
    pushToScene(scene, input);
  }
  /** Rendert Kachel (tx,ty); true, wenn sichtbare Pixel entstanden sind. */
  render(tx: number, ty: number): boolean {
    this.cam.offsetX = -tx * this.tilePx;
    this.cam.offsetY = -ty * this.tilePx;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.tilePx, this.tilePx);
    this.origLabel = (this.input.obj as any).labelId;
    (this.input.obj as any).labelId = Defaults.defaultLabelId;
    try { this.renderer.render(); }
    finally { (this.input.obj as any).labelId = this.origLabel; }
    const data = this.ctx.getImageData(0, 0, this.tilePx, this.tilePx).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  }
  copy(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = this.tilePx; c.height = this.tilePx;
    c.getContext("2d")!.drawImage(this.canvas, 0, 0);
    return c;
  }
  dispose() { freeCanvas(this.canvas); }
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG-Kodierung fehlgeschlagen"))), "image/png"));
}
const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

function finishSync(app: any) {
  try { app.clearSelection?.(); } catch { /* optional */ }
  try { app.requestRender?.(); } catch { /* optional */ }
  try { app.renderer?.render?.(); } catch { /* optional */ }
  try { app.refreshLabelUI?.(); } catch { /* optional */ }
}

/**
 * Brennt das Vektorobjekt kachelweise in die Rasterebene seiner Ebene ein.
 * Es entsteht KEIN Bildobjekt. Nur die tatsächlich belegten Kacheln werden
 * gerendert; leere Ergebnisse werden verworfen. Erst nach vollständigem Erfolg
 * wird eingezeichnet und das Vektororiginal entfernt.
 */
export function rasterizeIntoLayer(app: any, input: RasterInput): RasterOutcome {
  if (input.type === "segment" && input.obj.isGuide) return "skipped";
  const layers = app?.rasterLayers;
  if (!layers?.get) return "failed";
  const probeLabel = (input.obj as any).labelId || Defaults.defaultLabelId;
  const layer = layers.get(probeLabel, true);
  if (!layer) return "failed";
  const geom = coverageOf(app, input);
  if (!geom) return "skipped";
  const tiles = coveredTiles(geom, layer.tileWorld, RASTER_BUDGET.maxActionTiles);
  const supportsJobs = typeof app?.commitRasterJob === "function";
  const plan = tiles
    ? planRasterAction({ layerPxPerM: layer.pxPerM, tilePx: layer.tilePx, touchedTiles: tiles.length, hasTempStore: rasterTempStoreAvailable(), supportsJobs })
    : ({ ok: false, reason: "too-large", tiles: Infinity } as const);
  if (!plan.ok || !tiles) {
    toast("error", "Das Objekt ist für die Pixel-Umwandlung zu groß. Es bleibt als Vektorobjekt erhalten.");
    return "rejected";
  }
  if (plan.mode === "sync") {
    let tr: TileRenderer | null = null;
    const staged: { tx: number; ty: number; image: HTMLCanvasElement }[] = [];
    try {
      if (tiles.some((t) => layer.isTileLoading(t.tx, t.ty))) {
        // Gespeicherte Kachel lädt noch: nicht über einen unvollständigen Stand zeichnen.
        return startRasterJob(app, input, layers, layer, tiles);
      }
      tr = new TileRenderer(app, input, layer.pxPerM, layer.tilePx);
      for (const t of tiles) if (tr.render(t.tx, t.ty)) staged.push({ ...t, image: tr.copy() });
    } catch (e) {
      for (const s of staged) freeCanvas(s.image);
      console.error("rasterizeIntoLayer failed:", e);
      toast("error", "Pixel-Umwandlung fehlgeschlagen. Das Objekt bleibt als Vektorobjekt erhalten.");
      return "failed";
    } finally { tr?.dispose(); }
    if (!staged.length) return "skipped";
    layer.applyTiles(staged);
    layer.noteStroke();
    for (const s of staged) freeCanvas(s.image);
    removeFromApp(app, input);
    finishSync(app);
    return "ok";
  }
  return startRasterJob(app, input, layers, layer, tiles);
}

/**
 * Großer Pixelvorgang als Hintergrundjob: begrenztes Arbeitsbild, temporäre
 * Ablage je Action-ID (IndexedDB), atomarer Abschluss über
 * `app.commitRasterJob` (gleicher Undo-Schritt wie die auslösende Aktion).
 */
function startRasterJob(app: any, input: RasterInput, layers: any, layer: any, tiles: TileKey[]): RasterOutcome {
  if (typeof app?.commitRasterJob !== "function") return "rejected";
  const token: string | null = app.currentActionToken?.() ?? null;
  app.deferActionCommit?.(token);
  const job = registerRasterJob(app);
  const useIdb = rasterTempStoreAvailable();
  const toastId = `raster-${job.id}`;
  let lastShown = -1;
  const show = (done: number, phase: string) => {
    const pct = Math.floor((done / Math.max(1, tiles.length)) * 100);
    if (pct === lastShown) return;
    lastShown = pct;
    void import("sonner").then(({ toast: t }) => t.loading(`${phase} … ${pct} %`, {
      id: toastId,
      action: { label: "Abbrechen", onClick: () => job.cancel("user") },
    })).catch(() => undefined);
  };
  const dismiss = () => { void import("sonner").then(({ toast: t }) => t.dismiss(toastId)).catch(() => undefined); };

  void serializeOnLayer(layer, async () => {
    const memStaged: { tx: number; ty: number; image: HTMLCanvasElement }[] = [];
    const keys: TileKey[] = [];
    const decoded: { tx: number; ty: number; image: ImageBitmap | HTMLCanvasElement }[] = [];
    let tr: TileRenderer | null = null;
    let outcome: Exclude<RasterOutcome, "pending"> | "cancelled" = "failed";
    try {
      tr = new TileRenderer(app, input, layer.pxPerM, layer.tilePx);
      for (let i = 0; i < tiles.length; i++) {
        if (job.signal.cancelled) { outcome = "cancelled"; return; }
        const t = tiles[i];
        if (tr.render(t.tx, t.ty)) {
          if (useIdb) { await tempPut(job.id, `${t.tx},${t.ty}`, await toBlob(tr.canvas)); keys.push(t); }
          else memStaged.push({ ...t, image: tr.copy() });
        }
        show(i + 1, "Pixel werden berechnet");
        if (i % 2 === 1) await nextTick();
      }
      tr.dispose(); tr = null;
      if (job.signal.cancelled) { outcome = "cancelled"; return; }
      if (!keys.length && !memStaged.length) { outcome = "skipped"; return; }
      // Ausstehende gespeicherte Kacheln abwarten (nie über unvollständigen Stand).
      for (let w = 0; [...keys, ...memStaged].some((t) => layer.isTileLoading(t.tx, t.ty)); w++) {
        if (w > 200 || job.signal.cancelled) { outcome = job.signal.cancelled ? "cancelled" : "failed"; return; }
        await new Promise((r) => setTimeout(r, 50));
      }
      for (let i = 0; i < keys.length; i++) {
        if (job.signal.cancelled) { outcome = "cancelled"; return; }
        const blob = await tempGet(job.id, `${keys[i].tx},${keys[i].ty}`);
        if (!blob) throw new Error("Temporäre Kachel fehlt");
        decoded.push({ ...keys[i], image: await createImageBitmap(blob) });
      }
      decoded.push(...memStaged);
      // Nie in eine fremde offene Aktion einschachteln: warten, bis sie endet.
      for (let w = 0; app.isActionOpen?.(); w++) {
        if (job.signal.cancelled || app._destroyed) { outcome = "cancelled"; return; }
        await new Promise((r) => setTimeout(r, 50));
      }
      if (job.signal.cancelled || app._destroyed) { outcome = "cancelled"; return; }
      // Zeichenfläche gewechselt oder Quelle inzwischen gelöscht → verwerfen.
      if (app.rasterLayers !== layers || layers.get((input.obj as any).labelId || Defaults.defaultLabelId) !== layer || !sourceStillInScene(app, input)) {
        outcome = "cancelled"; return;
      }
      const committed = app.commitRasterJob(token, () => {
        layer.applyTiles(decoded);
        layer.noteStroke();
        removeFromApp(app, input);
      });
      if (!committed) { outcome = "failed"; return; }
      finishSync(app);
      outcome = "ok";
    } catch (e) {
      console.error("Rasterjob fehlgeschlagen:", e);
      outcome = "failed";
    } finally {
      tr?.dispose();
      for (const d of decoded) { if ("close" in d.image) (d.image as ImageBitmap).close(); else freeCanvas(d.image as HTMLCanvasElement); }
      if (useIdb) void tempDeleteAction(job.id);
      unregisterRasterJob(app, job);
      app.releaseDeferredAction?.(token);
      dismiss();
      if (outcome === "failed") toast("error", "Pixel-Umwandlung fehlgeschlagen. Das Objekt bleibt als Vektorobjekt erhalten.");
      else if (outcome === "cancelled" && job.signal.reason === "user") toast("info", "Pixel-Umwandlung abgebrochen. Das Objekt bleibt als Vektorobjekt erhalten.");
    }
  });
  show(0, "Pixel werden berechnet");
  return "pending";
}

/**
 * Teilt ein Weltrechteck in Teilbereiche entlang des Kachelrasters, sodass
 * jeder Teilbereich höchstens RASTER_CHUNK_PIXELS umfasst. Grenzen liegen auf
 * ganzen Kachelpixeln → nahtlos.
 */
export function rasterChunks(b: { x: number; y: number; w: number; h: number }, pxPerM: number, tileWorld: number) {
  const total = Math.ceil(b.w * pxPerM) * Math.ceil(b.h * pxPerM);
  if (total <= RASTER_CHUNK_PIXELS) return [b];
  const tilePx = Math.max(1, Math.round(tileWorld * pxPerM));
  const tilesPerChunk = Math.max(1, Math.floor(Math.sqrt(RASTER_CHUNK_PIXELS) / tilePx));
  const step = tilesPerChunk * tileWorld;
  const x0 = Math.floor(b.x / tileWorld) * tileWorld, y0 = Math.floor(b.y / tileWorld) * tileWorld;
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = y0; y < b.y + b.h; y += step) {
    for (let x = x0; x < b.x + b.w; x += step) {
      const cx = Math.max(x, b.x), cy = Math.max(y, b.y);
      const cw = Math.min(x + step, b.x + b.w) - cx, ch = Math.min(y + step, b.y + b.h) - cy;
      if (cw > 0 && ch > 0) out.push({ x: cx, y: cy, w: cw, h: ch });
    }
  }
  return out;
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

    const pxPerM = targetPxPerM(app);
    let wPx = Math.ceil(b.w * pxPerM);
    let hPx = Math.ceil(b.h * pxPerM);
    if (wPx * hPx > MAX_PIXELS) throw new RasterTooLargeError(wPx, hPx);
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
    notifyRasterFailure(e);
    return null;
  }
}

/**
 * Hook für die Werkzeuge: rastert nur im Pixelmodus, immer in die Rasterebene
 * der Ebene. Kein Bildobjekt-Fallback – bei Ablehnung/Fehler bleibt der Vektor.
 */
export function maybeRasterize(app: any, input: RasterInput): RasterOutcome {
  if (!isPixelDrawMode(app)) return "skipped";
  return rasterizeIntoLayer(app, input);
}

/**
 * Ermittelt das aktuell ausgewählte, nachträglich in Pixel umwandelbare
 * Vektorobjekt (Linie, Freihand, Schraffur/Polygon, Text).
 * - `null`: keine Auswahl
 * - `{ unsupported: true }`: Auswahl vorhanden, aber nicht sicher umwandelbar
 */
export function getConvertibleSelection(
  app: any,
): RasterInput | { unsupported: true } | null {
  const sel = app?.selection;
  const scene = app?.scene;
  if (!sel || !scene) return null;
  const t = sel.type;
  if ((t === "segment" || t === "point") && sel.segmentId) {
    const seg = scene.getSegmentById?.(sel.segmentId);
    if (seg && !seg.isGuide) return { type: "segment", obj: seg };
  } else if (t === "free_stroke" && sel.freeStrokeId) {
    const fs = scene.getFreeStrokeById?.(sel.freeStrokeId);
    if (fs) return { type: "free", obj: fs };
  } else if (t === "hatch" && sel.hatchId) {
    const h = scene.getHatchById?.(sel.hatchId);
    if (h) return { type: "hatch", obj: h };
  } else if ((t === "textbox" || t === "textbox_handle") && sel.textBoxId) {
    const tb = scene.getTextBoxById?.(sel.textBoxId);
    if (tb) return { type: "text", obj: tb };
  }
  return { unsupported: true };
}

/**
 * Nachträgliche Umwandlung eines ausgewählten Vektorobjekts — exakt derselbe
 * Weg wie bei neu im Pixelmodus gezeichneten Objekten (rasterizeIntoLayer).
 * Das Vektororiginal wird erst nach erfolgreichem Einbrennen entfernt; ein
 * Undo-Schritt stellt es wieder her. Kein Bildobjekt-Fallback.
 */
export function convertSelectionToPixel(app: any): boolean {
  const target = getConvertibleSelection(app);
  if (!target || "unsupported" in target) return false;
  if (!app?.rasterLayers?.get) return false;
  const outcome = rasterizeIntoLayer(app, target);
  const ok = outcome === "ok" || outcome === "pending";
  if (ok) app.defaultDrawRasterMode = "pixel";
  return ok;
}
