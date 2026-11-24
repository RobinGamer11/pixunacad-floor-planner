/**
 * financePdfExport — exportiert einen DOM-Ausschnitt der Finanzen-Oberfläche
 * (das rechte Detailfenster) als mehrseitiges DIN-A4-PDF.
 */
import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";
import { StandardFonts, rgb } from "pdf-lib";
import type { FinanceState } from "./financeStore";
import { collectEnabledActionNodes, computeProcessSummary, computeScopeSummary, formatMoney } from "./financeMath";

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

/** Erzeugt einen strukturierten Finanzbericht (DIN A4) direkt aus den zentralen Berechnungsfunktionen. */
export async function exportFinanceReportPdf(
  state: FinanceState,
  scopeNodeId: string | null,
  projectName: string,
): Promise<void> {
  const perspective = state.perspective ?? "client";
  const taxDisplay = state.taxDisplay ?? "gross";
  const summary = computeScopeSummary(state, scopeNodeId, taxDisplay);
  const actions = collectEnabledActionNodes(state, scopeNodeId);
  const fmt = (v: number) => formatMoney(v, summary.currency);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([A4_W, A4_H]);
  let y = A4_H - MARGIN - 10;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 16) {
      page = pdf.addPage([A4_W, A4_H]);
      y = A4_H - MARGIN - 10;
    }
  };

  const drawLine = (text: string, size = 10, isBold = false, color = rgb(0.12, 0.12, 0.14)) => {
    ensureSpace(size + 6);
    page.drawText(text, { x: MARGIN, y, size, font: isBold ? bold : font, color });
    y -= size + 5;
  };

  drawLine(`Finanzbericht – ${projectName || "Projekt"}`, 16, true);
  drawLine(
    `Perspektive: ${perspective === "contractor" ? "Auftragnehmer" : "Auftraggeber"}  |  Bereich: ${summary.scopeName}  |  Basis: ${taxDisplay === "net" ? "Netto" : "Brutto"}  |  Stand: ${new Date().toLocaleDateString("de-DE")}`,
    9,
    false,
    rgb(0.4, 0.4, 0.45),
  );
  y -= 8;

  if (perspective === "client") {
    drawLine("Kennzahlen (Auftraggeber)", 12, true);
    drawLine(`Budget: ${summary.budgetAmount !== null ? fmt(summary.budgetAmount) : "Noch nicht festgelegt"}`);
    drawLine(`Aufträge vergeben: ${fmt(summary.expense.orderTotal)}`);
    drawLine(`Rechnungen erhalten: ${fmt(summary.expense.invoicedTotal)}`);
    drawLine(`Noch zu bezahlen: ${fmt(summary.expense.openInvoiceAmount)}`);
    drawLine(`Erwartete Gesamtkosten: ${fmt(summary.expense.expectedTotal)}${summary.expense.isProvisional ? " (vorläufig)" : ""}`);
  } else {
    drawLine("Kennzahlen (Auftragnehmer)", 12, true);
    drawLine(`Aufträge erhalten: ${fmt(summary.income.orderTotal)}`);
    drawLine(`Rechnungen gestellt: ${fmt(summary.income.invoicedTotal)}`);
    drawLine(`Zahlungen erhalten: ${fmt(summary.income.paidTotal)}`);
    drawLine(`Voraussichtlicher Überschuss (Projektprognose): ${fmt(summary.expectedSurplus)}`);
    drawLine(`Erwartete eigene Gesamtkosten: ${fmt(summary.expense.expectedTotal)}${summary.expense.isProvisional ? " (vorläufig)" : ""}`);
  }

  y -= 10;
  drawLine(`Vorgänge (${actions.length})`, 12, true);
  if (actions.length === 0) {
    drawLine("Keine Vorgänge in diesem Bereich erfasst.", 10, false, rgb(0.4, 0.4, 0.45));
  } else {
    for (const node of actions) {
      const p = computeProcessSummary(state, node, taxDisplay);
      const label = `${node.name}${node.partner ? ` · ${node.partner}` : ""} (${p.direction === "income" ? "Einnahme" : "Ausgabe"})`;
      drawLine(label, 10, true);
      drawLine(
        `Beauftragt: ${fmt(p.orderTotal)}  |  Berechnet: ${fmt(p.invoicedTotal)}  |  Bezahlt: ${fmt(p.paidTotal)}  |  Offen: ${fmt(p.openInvoiceAmount)}  |  Erwartet: ${fmt(p.expectedTotal)}${p.isProvisional ? " (vorläufig)" : ""}`,
        8.5,
        false,
        rgb(0.3, 0.3, 0.35),
      );
      y -= 3;
    }
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Finanzen_${(projectName || "Projekt").replace(/[^\w-]+/g, "_")}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
