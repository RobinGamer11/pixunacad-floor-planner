import { Defaults } from "./constants";

// PDF.js wird dynamisch geladen, damit der initiale Bundle klein bleibt.
let _pdfjsPromise: Promise<any> | null = null;
async function loadPdfJs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Worker als Vite-URL importieren — funktioniert in Vite ohne extra Config.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

export interface ImportedPage {
  /** PNG/JPG/etc. DataURL der gerenderten Seite. */
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
  // 1 px @ 96 DPI = 0.0254 / 96 m
  const widthM = w * Defaults.documentMetersPerPx;
  const heightM = h * Defaults.documentMetersPerPx;
  return {
    src: dataUrl,
    pixelWidth: w,
    pixelHeight: h,
    widthM,
    heightM,
    name: file.name,
    pageIndex: 0,
    kind: "image",
  };
}

async function importPdf(file: File): Promise<ImportedPage[]> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages: ImportedPage[] = [];
  const renderScale = Defaults.documentPdfRenderScale;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: renderScale });
    // PDF "user space" Größe (1 unit = 1 pt) -> Meter via 72 DPI
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
      src,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      widthM,
      heightM,
      name: `${file.name} — Seite ${i}`,
      pageIndex: i - 1,
      kind: "pdf-page",
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
