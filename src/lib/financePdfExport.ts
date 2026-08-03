/**
 * financePdfExport — exportiert einen DOM-Ausschnitt der Finanzen-Oberfläche
 * (das rechte Detailfenster) als mehrseitiges DIN-A4-PDF.
 */
import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";

const A4_W = 595.28; // pt
const A4_H = 841.89; // pt
const MARGIN = 28; // pt

/** Rendert das Element und legt es seitenweise auf DIN A4 (Hochformat) ab. */
export async function exportElementToA4Pdf(el: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: el.scrollWidth,
  });

  const pdf = await PDFDocument.create();
  const contentW = A4_W - MARGIN * 2;
  const contentH = A4_H - MARGIN * 2;
  // Skalierung: Canvas-Breite füllt die Inhaltsbreite.
  const pxPerPt = canvas.width / contentW;
  const sliceHpx = Math.floor(contentH * pxPerPt);

  for (let y = 0; y < canvas.height; y += sliceHpx) {
    const h = Math.min(sliceHpx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

    const png = await pdf.embedPng(slice.toDataURL("image/png"));
    const page = pdf.addPage([A4_W, A4_H]);
    const drawH = h / pxPerPt;
    page.drawImage(png, { x: MARGIN, y: A4_H - MARGIN - drawH, width: contentW, height: drawH });
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
