/**
 * Projektions-Rendering (Export-Ausschnitte):
 * Der Inhalt eines Zeichenblatt-Snapshots wird über den NORMALEN Renderer
 * gezeichnet — Wände (inkl. Vereinigung), Türen, Treppen, Freihand, Tabellen,
 * Textfelder, Dokumente und Bibliothekselemente erscheinen im Ausschnitt
 * exakt wie auf dem Quellblatt. Die bisherige vereinfachte Item-Liste bleibt
 * nur für Bounding-Box/Clip/Hit-Test zuständig (siehe flattenSheetSnapshot).
 *
 * Die Projektions-Kamera ist eine affine Abbildung Sheet-Meter → lokale Pixel;
 * der aufrufende Context ist bereits rotiert und geclippt.
 */
import { Scene } from "./Scene";
import { restoreOneScene } from "./sceneSerde";
import { Renderer } from "./Renderer";

/** Minimale Kamera: worldToScreen/screenToWorld/scale genügen allen Zeichenpfaden. */
export class ProjectionCamera {
  scale: number;
  offX: number;
  offY: number;
  constructor(scale: number, offX: number, offY: number) {
    this.scale = scale;
    this.offX = offX;
    this.offY = offY;
  }
  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.offX + x * this.scale, y: this.offY + y * this.scale };
  }
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.offX) / this.scale, y: (sy - this.offY) / this.scale };
  }
}

const STUB_LABELS = {
  isVisible: () => true,
  list: () => [] as any[],
};

/** Scene je Snapshot (WeakMap — Snapshots leben so lange wie ihre Projektion). */
const sceneCache = new WeakMap<object, Scene>();

export function sceneFromSnapshot(snapshot: any): Scene | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const hit = sceneCache.get(snapshot);
  if (hit) return hit;
  try {
    const scene = new Scene();
    restoreOneScene(scene, snapshot);
    sceneCache.set(snapshot, scene);
    return scene;
  } catch {
    return null;
  }
}

/** Renderer je Snapshot — Bild-/Composite-Caches bleiben so zwischen Frames erhalten. */
const rendererCache = new WeakMap<object, Renderer>();

function rendererFor(snapshot: any, definitions: any[] | undefined): Renderer | null {
  const scene = sceneFromSnapshot(snapshot);
  if (!scene) return null;
  let r = rendererCache.get(snapshot) as any;
  if (!r) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    r = new Renderer(ctx, new ProjectionCamera(1, 0, 0) as any, scene, STUB_LABELS as any);
    r.libraryDefinitionSource = definitions ? () => definitions as any : null;
    rendererCache.set(snapshot, r as any);
  } else if (definitions && !r.libraryDefinitionSource) {
    r.libraryDefinitionSource = () => definitions as any;
  }
  return r as Renderer;
}

/**
 * Zeichnet den vollen Inhalt eines Sheet-Snapshots in den gegebenen Context.
 * Annahme: ctx ist bereits transformiert (Rotation/Clip der Projektion) und
 * `cam` bildet Sheet-Meter auf Pixel in genau diesem Context-Raum ab.
 * `docImages` optional: vorgeladene Dokumentbilder (Schlüssel = doc.src) für
 * den einmaligen PDF-Rasterdurchlauf.
 */
export function drawSheetSnapshotContent(
  ctx: CanvasRenderingContext2D,
  snapshot: any,
  cam: ProjectionCamera,
  definitions?: any[],
  docImages?: Map<string, HTMLImageElement>,
) {
  const r = rendererFor(snapshot, definitions) as any;
  if (!r) return;
  r.ctx = ctx;
  r.camera = cam;
  r.setViewport(1e6, 1e6);
  if (docImages) r._docImageCache = docImages;

  const scene = sceneFromSnapshot(snapshot);
  if (!scene) return;
  const labelIds = new Set<string>();
  const collect = (list: any[]) => {
    for (const o of list || []) if (o && o.labelId) labelIds.add(o.labelId);
  };
  collect(scene.documents);
  collect(scene.hatches);
  collect(scene.walls);
  collect((scene as any).doors);
  collect((scene as any).stairs);
  collect(scene.segments);
  collect(scene.freeStrokes);
  collect(scene.dimensions);
  collect(scene.textBoxes);
  collect((scene as any).tables);
  collect(scene.libraryInstances || []);

  for (const labelId of labelIds) {
    // Gleiche Reihenfolge wie im Haupt-Renderer (Hintergrund → Vordergrund).
    try { r._drawDocumentsForLabel(labelId); } catch { /* ein Objekt darf den Ausschnitt nicht killen */ }
    try { r._drawHatchesForLabel(labelId); } catch { }
    try { r._drawWallsForLabel(labelId); } catch { }
    try { r._drawDoorsForLabel(labelId); } catch { }
    try { r._drawStairsForLabel(labelId); } catch { }
    try { r._drawSegmentsForLabel(labelId); } catch { }
    try { r._drawFreeStrokesForLabel(labelId); } catch { }
    try { r._drawDimensionsForLabel(labelId); } catch { }
    try { r._drawTextBoxesForLabel(labelId); } catch { }
    try { r._drawTablesForLabel(labelId); } catch { }
    try { r._drawLibraryInstancesForLabel(labelId); } catch { }
  }
}

/** Lädt alle Bild-Dokumente eines Snapshots vor (für den PDF-Rasterdurchlauf). */
export function preloadSnapshotDocImages(snapshot: any): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  const docs: any[] = (snapshot && Array.isArray(snapshot.documents)) ? snapshot.documents : [];
  const srcs = new Set<string>();
  for (const d of docs) {
    if (d && d.src && !d.pdfSourceB64) srcs.add(String(d.src));
  }
  const jobs: Promise<void>[] = [];
  for (const src of srcs) {
    jobs.push(new Promise<void>((resolve) => {
      const img = new Image();
      const done = () => { if (img.complete && img.naturalWidth > 0) out.set(src, img); resolve(); };
      img.onload = done;
      img.onerror = done;
      img.src = src;
      // Data-URLs dekodieren oft synchron — trotzdem absichern.
      if (img.complete) done();
      setTimeout(done, 4000);
    }));
  }
  return Promise.all(jobs).then(() => out);
}

/**
 * Rendert den Ausschnitt-Inhalt einmalig in eine Offscreen-Canvas (PNG-Basis
 * für den Vektor-PDF-Export). Rotation/Clip werden NICHT eingebrannt — das
 * Bild deckt das Clip-Rechteck im unrotierten lokalen mm-Raum ab.
 */
export function renderProjectionCanvas(
  snapshot: any,
  definitions: any[] | undefined,
  cam: ProjectionCamera,
  widthPx: number,
  heightPx: number,
  docImages?: Map<string, HTMLImageElement>,
): HTMLCanvasElement | null {
  if (widthPx < 1 || heightPx < 1) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widthPx);
  canvas.height = Math.ceil(heightPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSheetSnapshotContent(ctx, snapshot, cam, definitions, docImages);
  return canvas;
}
