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
