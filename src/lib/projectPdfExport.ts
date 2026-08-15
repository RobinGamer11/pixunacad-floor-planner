/**
 * PDF-Export für die Projektmappe.
 *
 * Der Export läuft ausschließlich über die bereits im DOM gerenderte Seite:
 * die aktive Seite wird sequentiell umgeschaltet, mit html2canvas als Bitmap
 * eingefroren und via pdf-lib als PDF-Seite in exakter mm-Größe eingebettet.
 * Verbundene Seiten (Spread) können optional als eine breite PDF-Seite
 * zusammengelegt werden.
 */

import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";
import type { Project, ProjectPage } from "./projectStore";
import { getPageSizeMm, MM_PER_INCH } from "./paper";
import { setExportMode } from "./printExport";

export type PdfColorMode = "original" | "bw" | "gray" | "custom";

export interface PdfExportOptions {
  project: Project;
  selectedPageIds: string[];
  colorMode: PdfColorMode;
  customColor?: string; // hex #rrggbb
  spreadCombined: boolean;
  /** Aktive Seite umschalten und einen Frame warten. */
  setActivePageId: (id: string) => void;
  /** DPI der Bitmap. 150 DPI ~ druckbar, 200 = besser, 300 = groß. */
  dpi?: number;
}

export interface PdfExportProgress {
  current: number;
  total: number;
  label: string;
}

/** Gruppiert Seiten in Ausgabe-Einheiten (einzelne Seite oder Spread). */
function buildUnits(
  project: Project,
  selectedIds: string[],
  spreadCombined: boolean,
): ProjectPage[][] {
  const order = project.pages.filter((p) => selectedIds.includes(p.id));
  if (!spreadCombined) return order.map((p) => [p]);

  const seenSpread = new Set<string>();
  const units: ProjectPage[][] = [];
  for (const p of order) {
    if (!p.spreadId || p.spreadExcluded) {
      units.push([p]);
      continue;
    }
    if (seenSpread.has(p.spreadId)) continue;
    seenSpread.add(p.spreadId);
    const members = project.pages
      .filter(
        (m) =>
          m.spreadId === p.spreadId &&
          !m.spreadExcluded &&
          selectedIds.includes(m.id),
      )
      .sort((a, b) => (a.spreadIndex ?? 0) - (b.spreadIndex ?? 0));
    units.push(members.length > 0 ? members : [p]);
  }
  return units;
}

/** Nimmt DOM-Snapshot einer bereits gerenderten Seite.
 *  Bevorzugt `[data-page-capture]` — dieser Wrapper enthält neben dem Papier
 *  auch die CAD-Engine-Ebene (Linien, Texte, Schraffuren), die als Geschwister-
 *  Element des Papiers liegt. Ohne diesen Wrapper wäre der Export leer. */
async function snapshotPageElement(
  pageId: string,
  dpi: number,
  widthMm: number,
): Promise<HTMLCanvasElement> {
  // Warten, bis genau diese Seite im DOM steht (Seitenwechsel + React-Render)
  // und die CAD-Engine mindestens einen Frame gezeichnet hat.
  let el: HTMLElement | null = null;
  for (let i = 0; i < 60; i++) {
    el =
      document.querySelector<HTMLElement>(`[data-page-capture="${pageId}"]`) ??
      document.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`);
    if (el && el.getBoundingClientRect().width > 1) break;
    await waitFrames(2);
  }
  if (!el) throw new Error(`Seite ${pageId} ist im DOM nicht sichtbar.`);
  await waitFrames(6);

  const rectPx = el.getBoundingClientRect();
  // html2canvas skaliert intern; wir wählen scale so, dass Ausgabewert der
  // physikalischen DPI entspricht (Seite ist in CSS-px, aber ihre reale
  // Zielgröße kennen wir über die Projekt-mm — die Umrechnung passiert später
  // beim Einbetten in die PDF-Seite).
  const targetPxPerCssPx = Math.min(
    3, // hard cap: sonst wird das Canvas riesig
    Math.max(1, dpi / 96),
  );
  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: targetPxPerCssPx,
    useCORS: true,
    logging: false,
    width: rectPx.width,
    height: rectPx.height,
  });
  return canvas;
}

/** Wartet n RequestAnimationFrames. */
function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      i++;
      if (i >= n) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Farb-Modus post-processing auf ein Canvas anwenden. */
function applyColorMode(
  canvas: HTMLCanvasElement,
  mode: PdfColorMode,
  customHex?: string,
): HTMLCanvasElement {
  if (mode === "original") return canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const custom = customHex ? hexToRgb(customHex) : { r: 17, g: 17, b: 17 };
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminanz (BT.601).
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mode === "gray") {
      data[i] = data[i + 1] = data[i + 2] = lum;
    } else if (mode === "bw") {
      const v = lum > 200 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    } else if (mode === "custom") {
      // Weiß bleibt weiß; alles andere wird mit custom-Farbe eingefärbt,
      // Helligkeit steuert Deckkraft.
      const t = 1 - lum / 255; // 0..1 (dunkler → stärker gefärbt)
      data[i] = Math.round(255 * (1 - t) + custom.r * t);
      data[i + 1] = Math.round(255 * (1 - t) + custom.g * t);
      data[i + 2] = Math.round(255 * (1 - t) + custom.b * t);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Fügt eine PDF-Seite mit gegebener mm-Größe an, in die das Bitmap
 *  formatfüllend eingebettet wird. */
async function embedPage(
  pdf: PDFDocument,
  canvas: HTMLCanvasElement,
  widthMm: number,
  heightMm: number,
): Promise<void> {
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const jpegBytes = dataUrlToBytes(jpegDataUrl);
  const img = await pdf.embedJpg(jpegBytes);
  const wPt = (widthMm / MM_PER_INCH) * 72;
  const hPt = (heightMm / MM_PER_INCH) * 72;
  const page = pdf.addPage([wPt, hPt]);
  page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
}

function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.split(",")[1] ?? "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Zeichnet mehrere Seiten-Snapshots nebeneinander in ein neues Canvas
 *  im mm-Verhältnis. Verwendet für Spread-Kombination. */
function composeSideBySide(
  snapshots: { canvas: HTMLCanvasElement; wMm: number; hMm: number }[],
): { canvas: HTMLCanvasElement; wMm: number; hMm: number } {
  const totalWmm = snapshots.reduce((s, x) => s + x.wMm, 0);
  const maxHmm = Math.max(...snapshots.map((x) => x.hMm));
  // Ziel-Pixelbreite: Summe der Einzel-Canvas-Breiten, aber skaliert auf
  // gemeinsamen Faktor px/mm damit alle Teile 1:1 zusammenpassen.
  const pxPerMm = Math.max(
    ...snapshots.map((s) => s.canvas.width / s.wMm),
  );
  const outW = Math.round(totalWmm * pxPerMm);
  const outH = Math.round(maxHmm * pxPerMm);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  let xMm = 0;
  for (const s of snapshots) {
    const dx = Math.round(xMm * pxPerMm);
    const dw = Math.round(s.wMm * pxPerMm);
    const dh = Math.round(s.hMm * pxPerMm);
    ctx.drawImage(s.canvas, dx, 0, dw, dh);
    xMm += s.wMm;
  }
  return { canvas: out, wMm: totalWmm, hMm: maxHmm };
}

/**
 * Hauptexport. Gibt die fertigen PDF-Bytes zurück; der Aufrufer kümmert sich
 * um Download / Speicherung.
 */
export async function exportProjectToPdf(
  opts: PdfExportOptions,
  onProgress?: (p: PdfExportProgress) => void,
): Promise<Uint8Array> {
  const dpi = opts.dpi ?? 200;
  const units = buildUnits(opts.project, opts.selectedPageIds, opts.spreadCombined);
  if (units.length === 0) throw new Error("Keine Seiten ausgewählt.");

  const pdf = await PDFDocument.create();
  let step = 0;
  const total = units.reduce((s, u) => s + u.length, 0);

  // Ränder-Overlay und Hilfslinien während des Exports ausblenden.
  setExportMode(true);
  await waitFrames(3);
  try {
  for (const unit of units) {
    const snaps: { canvas: HTMLCanvasElement; wMm: number; hMm: number }[] = [];
    for (const page of unit) {
      step++;
      onProgress?.({
        current: step,
        total,
        label: `Seite „${page.title}" wird gerendert…`,
      });
      opts.setActivePageId(page.id);
      await waitFrames(6);
      const canvas = await snapshotPageElement(page.id, dpi);
      applyColorMode(canvas, opts.colorMode, opts.customColor);
      const size = getPageSizeMm(page);
      snaps.push({ canvas, wMm: size.wMm, hMm: size.hMm });
    }
    if (snaps.length === 1) {
      await embedPage(pdf, snaps[0].canvas, snaps[0].wMm, snaps[0].hMm);
    } else {
      const composed = composeSideBySide(snaps);
      await embedPage(pdf, composed.canvas, composed.wMm, composed.hMm);
    }
  }

  onProgress?.({ current: total, total, label: "PDF wird finalisiert…" });
  return await pdf.save();
  } finally {
    setExportMode(false);
  }
}

/** Löst einen Browser-Download aus. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : filename + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
