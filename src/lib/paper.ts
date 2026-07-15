/**
 * paper.ts — kanonische Quelle für Papierformate & mm-Umrechnungen.
 *
 * Regeln (Paper-/Layout-Space):
 *   - Alle Papier-Koordinaten intern in Millimetern.
 *   - CAD-Modell bleibt 1:1 in Metern (kein Maßstab im Modell).
 *   - Maßstab wirkt AUSSCHLIESSLICH zwischen Papier-mm und Modell-m:
 *       modelLenM  = paperLenMm * scaleDen / 1000
 *       paperLenMm = modelLenM  * 1000     / scaleDen
 *   - Bildschirmzoom (pxPerMm) ist eine unabhängige reine Darstellungsgröße.
 *   - PDF-Export: 1 mm Papier == 1 mm PDF (kein "fit to page").
 */
import type { PageFormat, ProjectPage } from "./projectStore";

export const MM_PER_INCH = 25.4;
export const MM_TO_PT = 72 / MM_PER_INCH;

export const PAPER_FORMATS: Record<PageFormat, { w: number; h: number; label: string }> = {
  "A3-quer": { w: 420, h: 297, label: "A3 Querformat (420 × 297 mm)" },
  "A3-hoch": { w: 297, h: 420, label: "A3 Hochformat (297 × 420 mm)" },
  "A4-quer": { w: 297, h: 210, label: "A4 Querformat (297 × 210 mm)" },
  "A4-hoch": { w: 210, h: 297, label: "A4 Hochformat (210 × 297 mm)" },
  frei: { w: 400, h: 300, label: "Freies Format" },
};

/** Standard-DIN-Formate (mm) — für Auswahl und automatische Zuordnung. */
export const DIN_FORMATS_MM = {
  A0: { w: 841, h: 1189 },
  A1: { w: 594, h: 841 },
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
} as const;

/** Reale Papiergröße einer Seite in mm.
 *  Für "frei" werden — falls vorhanden — die individuellen Felder benutzt. */
export function getPageSizeMm(page: Pick<ProjectPage, "format" | "customWidthMm" | "customHeightMm">): {
  wMm: number;
  hMm: number;
} {
  if (page.format === "frei" && page.customWidthMm && page.customHeightMm) {
    return { wMm: page.customWidthMm, hMm: page.customHeightMm };
  }
  const f = PAPER_FORMATS[page.format];
  return { wMm: f.w, hMm: f.h };
}

/** "1:100" → 100. Fällt auf 100 zurück. */
export function parseScaleDen(scale: string | number | undefined | null): number {
  if (typeof scale === "number" && scale > 0) return scale;
  if (!scale) return 100;
  const m = String(scale).match(/1\s*:\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return 100;
  const v = parseFloat(m[1].replace(",", "."));
  return v > 0 ? v : 100;
}

/** 100 → "1:100". */
export function formatScale(scaleDen: number): string {
  return `1:${Math.round(scaleDen)}`;
}

/** Papier-mm → Modell-Meter bei gegebenem Maßstabsnenner. */
export function paperMmToModelM(paperMm: number, scaleDen: number): number {
  return (paperMm * scaleDen) / 1000;
}

/** Modell-Meter → Papier-mm bei gegebenem Maßstabsnenner. */
export function modelMToPaperMm(modelM: number, scaleDen: number): number {
  return (modelM * 1000) / scaleDen;
}
