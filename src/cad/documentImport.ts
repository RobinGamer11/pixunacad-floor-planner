import { Defaults } from "./constants";

// PDF.js wird dynamisch geladen, damit der initiale Bundle klein bleibt.
let _pdfjsPromise: Promise<any> | null = null;
export async function loadPdfJs(): Promise<any> {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

export interface ImportedPage {
  /** PNG-DataURL der gerenderten Seite (Erst-Vorschau). */
  src: string;
  /** Originalbreite in Pixeln (vor Skalierung). */
  pixelWidth: number;
  /** Originalhöhe in Pixeln. */
  pixelHeight: number;
  /** Welt-Breite in m (aus DPI/PDF-Punkten abgeleitet). */
  widthM: number;
  /** Welt-Höhe in m. */
  heightM: number;
  /** Anzeigename. */
  name: string;
  /** Bei PDFs: Seitenindex (0-basiert). */
  pageIndex: number;
  /** "image" für JPG/PNG, "pdf-page" für PDF. */
  kind: "image" | "pdf-page";
  /** Bei PDFs: Roh-Datei als Base64 (für vektorbasiertes Re-Rendering & Auflösen). */
  pdfSourceB64?: string;
}

/** Lädt ein File und gibt eine oder mehrere Seiten zurück. */
export async function importFile(file: File): Promise<ImportedPage[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return importPdf(file);
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) {
    return [await importImage(file)];
  }
  throw new Error("Nur PDF, JPG und PNG werden unterstützt.");
}

async function importImage(file: File): Promise<ImportedPage> {
  const dataUrl = await fileToDataURL(file);
  const img = await loadHTMLImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const widthM = w * Defaults.documentMetersPerPx;
  const heightM = h * Defaults.documentMetersPerPx;
  return { src: dataUrl, pixelWidth: w, pixelHeight: h, widthM, heightM, name: file.name, pageIndex: 0, kind: "image" };
}

async function importPdf(file: File): Promise<ImportedPage[]> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const sourceB64 = arrayBufferToBase64(buf);
  // Eine eigene Kopie für pdfjs übergeben (pdfjs darf ArrayBuffer behalten).
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const pages: ImportedPage[] = [];
  const renderScale = Defaults.documentPdfRenderScale;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: renderScale });
    const baseViewport = page.getViewport({ scale: 1 });
    const widthM = baseViewport.width * Defaults.documentMetersPerPdfPt;
    const heightM = baseViewport.height * Defaults.documentMetersPerPdfPt;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const src = canvas.toDataURL("image/png");
    pages.push({
      src, pixelWidth: canvas.width, pixelHeight: canvas.height,
      widthM, heightM,
      name: `${file.name} — Seite ${i}`,
      pageIndex: i - 1, kind: "pdf-page",
      pdfSourceB64: sourceB64,
    });
  }
  return pages;
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    img.src = src;
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Modul-Cache: pdfSourceB64 → pdfjs PDFDocumentProxy. */
const _pdfDocCache = new Map<string, Promise<any>>();
export async function loadPdfDocFromB64(sourceB64: string): Promise<any> {
  const hit = _pdfDocCache.get(sourceB64);
  if (hit) return hit;
  const p = (async () => {
    const pdfjs = await loadPdfJs();
    const bytes = base64ToUint8Array(sourceB64);
    // Wichtig: eine Kopie für pdfjs übergeben — pdfjs übernimmt das ArrayBuffer
    return pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  })();
  _pdfDocCache.set(sourceB64, p);
  return p;
}

/** Rendert eine Seite in der angegebenen Pixelbreite und liefert ein HTMLCanvasElement zurück. */
export async function renderPdfPageToCanvas(sourceB64: string, pageIndex: number, targetWidthPx: number): Promise<HTMLCanvasElement> {
  const pdf = await loadPdfDocFromB64(sourceB64);
  const page = await pdf.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(0.1, targetWidthPx / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
