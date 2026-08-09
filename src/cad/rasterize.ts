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
 * Ziel-Auflösung: deutliches Supersampling gegenüber dem Bildschirm, mindestens
 * 1200 dpi bezogen auf den Plan-Maßstab — damit Pixelobjekte beim Zoomen fast
 * so scharf wirken wie Vektoren.
 */
function targetPxPerM(app: any): number {
  const camScale = Math.max(1, app?.camera?.scale || 80);
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  let scaleDenom = 100;
  try {
    const den = app?.getActiveSheetScaleDenom?.() ?? app?.planScaleDenom ?? app?.scaleDenom;
    if (typeof den === "number" && den > 0) scaleDenom = den;
  } catch { /* Default beibehalten */ }
  // 1200 dpi → 47244 px pro Papiermeter; 1 Weltmeter = 1000/scaleDenom mm Papier.
  const minDpiPxPerM = (1200 / 25.4) * (1000 / scaleDenom);
  return Math.max(camScale * dpr * 4, minDpiPxPerM, 600);
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

/**
 * Wandelt ein frisch erzeugtes Vektorobjekt in ein Bild-Dokument um.
 * Gibt das erzeugte DocumentObject zurück (oder null bei Fehlschlag —
 * dann bleibt das Vektorobjekt unverändert bestehen).
 */
export function rasterizeObject(app: any, input: RasterInput): DocumentObject | null {
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

    const dataUrl = canvas.toDataURL("image/png");

    removeFromApp(app, input);

    const doc = app.scene.createDocument({
      name: "Pixelobjekt",
      kind: "image",
      src: dataUrl,
      position: { x: b.x, y: b.y },
      widthM: b.w,
      heightM: b.h,
      pixelWidth: wPx,
      pixelHeight: hPx,
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

/** Bequemer Hook für die Werkzeuge: rastert nur, wenn Pixelmodus aktiv ist. */
export function maybeRasterize(app: any, input: RasterInput): void {
  if (!isPixelDrawMode(app)) return;
  rasterizeObject(app, input);
}
