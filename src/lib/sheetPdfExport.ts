/**
 * sheetPdfExport — wandelt einen Canvas-Ausschnitt in ein einseitiges PDF
 * (Rasterbild). Wird für die "CAD-Blatt als PDF"-Funktion in der Projektmappe
 * benutzt: die CAD-Oberfläche liefert einen Snapshot des aktiven Blatts, wir
 * verpacken ihn hier als PDF und geben Base64 zurück, damit die Projektmappe
 * das Ergebnis über die bestehende `importFile`-Pipeline verarbeiten kann.
 */
import { PDFDocument } from "pdf-lib";

/** Wandelt ein Canvas (oder ImageData-DataURL) in ein einseitiges PDF um.
 *  Die Seitengröße entspricht 1:1 der Pixelgröße (72 DPI). */
export async function canvasToPdfBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const pngUrl = canvas.toDataURL("image/png");
  const pngBytes = dataUrlToBytes(pngUrl);
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([png.width, png.height]);
  page.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
  return await pdf.save();
}

/** Schneidet einen Ausschnitt aus dem Canvas aus und packt ihn in ein einseitiges
 *  PDF mit exakter physischer Papiergröße in mm — so wird das eingefügte Dokument
 *  in der Projektmappe mit dem korrekten Maßstab dargestellt (z.B. 1:100 CAD-Blatt
 *  → 5 m Welt-Region ⇒ 50 mm auf dem Papier). */
export async function canvasRegionToPdfBytes(
  canvas: HTMLCanvasElement,
  srcRectPx: { x: number; y: number; w: number; h: number },
  paperWidthMm: number,
  paperHeightMm: number,
): Promise<Uint8Array> {
  const w = Math.max(1, Math.round(srcRectPx.w));
  const h = Math.max(1, Math.round(srcRectPx.h));
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d")!;
  // Weißer Hintergrund (Canvas kann transparent sein → PDF-Import erwartet opak).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, srcRectPx.x, srcRectPx.y, srcRectPx.w, srcRectPx.h, 0, 0, w, h);
  const pngBytes = dataUrlToBytes(tmp.toDataURL("image/png"));
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(pngBytes);
  const MM_TO_PT = 72 / 25.4;
  const wPt = Math.max(1, paperWidthMm * MM_TO_PT);
  const hPt = Math.max(1, paperHeightMm * MM_TO_PT);
  const page = pdf.addPage([wPt, hPt]);
  page.drawImage(png, { x: 0, y: 0, width: wPt, height: hPt });
  return await pdf.save();
}

/** Base64 → Uint8Array (kompakt, ohne Node/Buffer-Abhängigkeit). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Uint8Array → Base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  return base64ToBytes(dataUrl.slice(comma + 1));
}

/** Format für den Cross-Route-Handoff via sessionStorage. */
export interface PendingSheetPdf {
  projectId: string;
  returnPageId: string;
  sheetId: string;
  sheetName: string;
  mode: "full" | "view" | "frame";
  pdfBase64: string;
  /** Nennmaßstab des Quell-Blatts (z.B. "1:100") — erlaubt exakten Import
   *  ohne Skalier-Dialog. */
  sheetScale?: string;
  /** Papiergröße (mm) — nötig für Layout des cad-view Elements. */
  paperWidthMm?: number;
  paperHeightMm?: number;
  /** PNG-Snapshot des Ausschnitts (DataURL) — Vorschau des verknüpften Blatts. */
  snapshotPng?: string;
}


export function pendingSheetPdfKey(projectId: string): string {
  return `pixuna.pendingSheetPdf.${projectId}`;
}

export function stashPendingSheetPdf(entry: PendingSheetPdf) {
  try {
    sessionStorage.setItem(pendingSheetPdfKey(entry.projectId), JSON.stringify(entry));
  } catch (e) {
    console.error("stashPendingSheetPdf failed", e);
  }
}

export function popPendingSheetPdf(projectId: string): PendingSheetPdf | null {
  try {
    const key = pendingSheetPdfKey(projectId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw) as PendingSheetPdf;
  } catch {
    return null;
  }
}
