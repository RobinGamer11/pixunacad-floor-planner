/**
 * PDF ⇄ Pixel-Umschaltung für Dokumente.
 *
 * Ein importiertes PDF liegt normalerweise als `kind: "pdf-page"` mit den
 * Original-Bytes (`pdfSourceB64`) in der Scene — es wird beim Zoomen als Vektor
 * neu gerendert und kann per "Auflösen" in CAD-Objekte zerlegt werden.
 *
 * Mit dem Schalter "Pixel" wird der aktuelle Zustand (inkl. Radierungen) in ein
 * hochaufgelöstes PNG eingebrannt (`kind: "image"`). Danach verhält sich das
 * Dokument wie ein importiertes Bild: der Radiergummi arbeitet inkl.
 * Smooth-Modus direkt auf den Pixeln.
 *
 * Zurück auf "Vektor" bleibt die Bearbeitung erhalten: aus dem Alpha-Kanal des
 * eingebrannten Bildes wird wieder eine Radiermaske erzeugt und auf das frisch
 * aus dem PDF gerenderte Vektorbild gelegt.
 *
 * Da die Umschaltung nur `kind`/`src`/`eraseMaskDataUrl` verändert, ist sie
 * ohne Schema-Änderung persistent: `pdfSourceB64 && kind === "image"` bedeutet
 * "PDF im Pixelmodus".
 */
import { Defaults } from "./constants";
import type { DocumentObject } from "./Scene";
import { getMaskDimensions, getOrCreateDocMask } from "./documentMask";

/** Maximale Kantenlänge des eingebrannten Pixelbildes. */
const MAX_BAKE_PX = 4096;

/** true, wenn das Dokument aus einem PDF stammt (also umschaltbar ist). */
export function isPdfBackedDocument(doc: DocumentObject | null | undefined): boolean {
  return !!doc && !!doc.pdfSourceB64;
}

/** true, wenn ein PDF-Dokument aktuell im Pixelmodus liegt. */
export function isDocumentPixelMode(doc: DocumentObject | null | undefined): boolean {
  return !!doc && !!doc.pdfSourceB64 && doc.kind === "image";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}

/** Zielauflösung fürs Einbrennen (an der PDF-Originalauflösung orientiert). */
function bakeWidthPx(doc: DocumentObject): number {
  const w = doc.pixelWidth || 1600;
  const h = doc.pixelHeight || 1200;
  const longer = Math.max(w, h);
  if (longer <= MAX_BAKE_PX) return Math.max(64, Math.round(w));
  return Math.max(64, Math.round(w * (MAX_BAKE_PX / longer)));
}

/**
 * Vektor → Pixel: rendert die PDF-Seite scharf, legt die aktuelle Radiermaske
 * darüber und ersetzt die Bildquelle durch das eingebrannte PNG.
 */
export async function convertDocumentToPixel(doc: DocumentObject): Promise<boolean> {
  if (!doc.pdfSourceB64 || doc.kind !== "pdf-page") return false;
  const { renderPdfPageToCanvas } = await import("./documentImport");
  const targetW = bakeWidthPx(doc);
  const page = await renderPdfPageToCanvas(doc.pdfSourceB64, doc.pageIndex, targetW);

  const c = document.createElement("canvas");
  c.width = page.width;
  c.height = page.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(page, 0, 0, c.width, c.height);

  // Radierungen einbrennen: Maske als Alpha anwenden.
  if (doc.eraseMaskDataUrl || doc._eraseMask) {
    const mask = doc._eraseMask ?? getOrCreateDocMask(doc);
    if (doc.eraseMaskDataUrl && !doc._eraseMask) {
      // Maske ggf. erst noch aus der DataUrl laden.
      try {
        const mi = await loadImage(doc.eraseMaskDataUrl);
        const mctx = mask.getContext("2d")!;
        mctx.clearRect(0, 0, mask.width, mask.height);
        mctx.drawImage(mi, 0, 0, mask.width, mask.height);
      } catch { /* ohne Maske weiter */ }
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
  }

  doc.src = c.toDataURL("image/png");
  doc.pixelWidth = c.width;
  doc.pixelHeight = c.height;
  doc.kind = "image";
  // Maske ist eingebrannt — ab jetzt wird direkt auf den Pixeln radiert.
  doc.eraseMaskDataUrl = null;
  doc._eraseMask = null;
  doc._eraseMaskDirty = false;
  return true;
}

/**
 * Pixel → Vektor: rendert die PDF-Seite neu (scharfe Vektorbasis) und
 * überträgt die im Pixelbild vorhandenen Radierungen als Alpha-Maske, damit
 * alle Änderungen erhalten bleiben.
 */
export async function convertDocumentToVector(doc: DocumentObject): Promise<boolean> {
  if (!doc.pdfSourceB64 || doc.kind !== "image") return false;

  // 1) Radierungen aus dem Pixelbild zurückgewinnen: eingebrannter Alpha-Kanal
  //    kombiniert mit einer evtl. im Pixelmodus entstandenen Radiermaske.
  let maskCanvas: HTMLCanvasElement | null = null;
  try {
    const baked = await loadImage(doc.src);
    const dims = getMaskDimensions(doc);
    const mc = document.createElement("canvas");
    mc.width = Math.max(1, dims.w);
    mc.height = Math.max(1, dims.h);
    const mctx = mc.getContext("2d")!;
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    // Weiß dort, wo das Bild noch Deckkraft hat → sichtbar; radierte Stellen transparent.
    mctx.drawImage(baked, 0, 0, mc.width, mc.height);
    if (doc.eraseMaskDataUrl || doc._eraseMask) {
      let live = doc._eraseMask ?? null;
      if (!live && doc.eraseMaskDataUrl) {
        try {
          const mi = await loadImage(doc.eraseMaskDataUrl);
          const tmp = document.createElement("canvas");
          tmp.width = mc.width; tmp.height = mc.height;
          tmp.getContext("2d")!.drawImage(mi, 0, 0, tmp.width, tmp.height);
          live = tmp;
        } catch { /* ignore */ }
      }
      if (live) {
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(live, 0, 0, mc.width, mc.height);
      }
    }
    mctx.globalCompositeOperation = "source-in";
    mctx.fillStyle = "#ffffff";
    mctx.fillRect(0, 0, mc.width, mc.height);
    mctx.globalCompositeOperation = "source-over";
    maskCanvas = mc;
  } catch { /* ohne Maske weiter */ }


  // 2) Frische Vektor-Renderbasis aus dem Original-PDF.
  const { renderPdfPageToCanvas } = await import("./documentImport");
  const targetW = Math.min(Defaults.documentFallbackMaxPx, bakeWidthPx(doc));
  const page = await renderPdfPageToCanvas(doc.pdfSourceB64, doc.pageIndex, targetW);

  doc.kind = "pdf-page";
  doc.src = page.toDataURL("image/png");
  doc.pixelWidth = page.width;
  doc.pixelHeight = page.height;

  if (maskCanvas) {
    doc._eraseMask = maskCanvas;
    doc.eraseMaskDataUrl = maskCanvas.toDataURL("image/png");
    doc._eraseMaskDirty = true;
  }
  return true;
}

/**
 * Prüft, ob ein Weltpunkt im Dokument wegradiert wurde (Maske transparent).
 * Wird beim Auflösen genutzt, damit radierte Bereiche keine Vektoren erzeugen.
 */
export function makeErasedSampler(doc: DocumentObject): ((u: number, v: number) => boolean) | null {
  const mask = doc._eraseMask;
  if (!mask) return null;
  let data: ImageData | null = null;
  try { data = mask.getContext("2d")!.getImageData(0, 0, mask.width, mask.height); }
  catch { return null; }
  const { width, height } = mask;
  return (u: number, vv: number) => {
    if (!data) return false;
    const x = Math.max(0, Math.min(width - 1, Math.round(u * width)));
    const y = Math.max(0, Math.min(height - 1, Math.round(vv * height)));
    return data.data[(y * width + x) * 4 + 3] < 96;
  };
}
