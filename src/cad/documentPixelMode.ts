/**
 * Rückführung älterer PDF-Dokumente im früheren Pixelmodus
 * (`pdfSourceB64 && kind === "image"`) auf Vektor sowie Radierprüfung für
 * „Auflösen“. Neue Pixel-PDFs entstehen nicht mehr.
 */
import { Defaults } from "./constants";
import type { DocumentObject } from "./Scene";
import { getOrCreateDocMask } from "./documentMask";

/** Maximale Kantenlänge des eingebrannten Pixelbildes. */
const MAX_BAKE_PX = 4096;

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
 * Pixel → Vektor: rendert die PDF-Seite wieder als Vektorquelle. Alle im
 * Pixelmodus vorgenommenen Radierungen bleiben als Alpha-Maske erhalten und
 * werden zusätzlich aus dem Alpha-Kanal des Pixelbildes übernommen.
 */
export async function convertDocumentToVector(doc: DocumentObject): Promise<boolean> {
  if (!doc.pdfSourceB64 || doc.kind !== "image") return false;

  // 1) Zusätzliche Transparenzen aus dem Pixelbild in die Maske übernehmen.
  try {
    const baked = await loadImage(doc.src);
    const mask = doc._eraseMask ?? getOrCreateDocMask(doc);
    const probe = document.createElement("canvas");
    probe.width = mask.width;
    probe.height = mask.height;
    const pctx = probe.getContext("2d")!;
    pctx.imageSmoothingEnabled = true;
    pctx.drawImage(baked, 0, 0, probe.width, probe.height);
    const img = pctx.getImageData(0, 0, probe.width, probe.height);
    let anyTransparent = false;
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] < 250) { anyTransparent = true; break; }
    }
    if (anyTransparent) {
      const mctx = mask.getContext("2d")!;
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(probe, 0, 0, mask.width, mask.height);
      mctx.globalCompositeOperation = "source-over";
    }
    doc._eraseMask = mask;
    doc.eraseMaskDataUrl = mask.toDataURL("image/png");
    doc._eraseMaskDirty = true;
  } catch { /* Maske bleibt wie sie ist */ }

  // 2) Frische Vektor-Renderbasis aus dem Original-PDF.
  const { renderPdfPageToCanvas } = await import("./documentImport");
  const targetW = Math.min(Defaults.documentFallbackMaxPx, bakeWidthPx(doc));
  const page = await renderPdfPageToCanvas(doc.pdfSourceB64, doc.pageIndex, targetW);

  doc.kind = "pdf-page";
  doc.src = page.toDataURL("image/png");
  doc.pixelWidth = page.width;
  doc.pixelHeight = page.height;
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
