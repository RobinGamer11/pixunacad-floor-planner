/**
 * scale.ts — KANONISCHE Quelle für das Maßstabssystem.
 *
 * Grundregeln:
 *   - Das CAD-Modell ist IMMER 1:1 (1 Welt-Meter = 1 realer Meter).
 *     Ein Maßstab verändert niemals gespeicherte Modellgeometrie.
 *   - Ein Maßstab existiert ausschließlich für die Abbildung
 *     Modell → Papier (Druckplan-Viewport, CAD-Blatt in der Projektmappe,
 *     PDF-/Druckausgabe).
 *   - Kanonischer Wert ist der numerische Nenner `scaleDen` (100 ⇒ „1:100“).
 *   - Kamera-Zoom, Bildschirm-DPI und Render-Auflösung sind KEIN Maßstab.
 *
 * Kernformel für 1:N:
 *   paperMm  = modelM * 1000 / N
 *   modelM   = paperMm * N / 1000
 */

/** 1 inch = 25,4 mm. */
export const MM_PER_INCH = 25.4;
/** 1 inch = 72 PDF-Punkte ⇒ 1 mm = 72/25.4 pt. */
export const MM_TO_PT = 72 / MM_PER_INCH;

/** Standard-Maßstäbe (Nenner) für Auswahl-UIs. */
export const SCALE_PRESETS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000] as const;

/** Fallback-Maßstab, wenn nichts Sinnvolles vorliegt. */
export const DEFAULT_SCALE_DEN = 100;

/**
 * Normalisiert beliebige Maßstabs-Eingaben auf den numerischen Nenner.
 * Akzeptiert: 100, "100", "1:100", "1 : 100", "1/75", "1:12,5".
 */
export function normalizeScaleDen(input: string | number | null | undefined): number {
  if (typeof input === "number") {
    return isFinite(input) && input > 0 ? input : DEFAULT_SCALE_DEN;
  }
  if (input == null) return DEFAULT_SCALE_DEN;
  const s = String(input).trim();
  if (!s) return DEFAULT_SCALE_DEN;
  const ratio = s.match(/^1\s*[:/]\s*(\d+(?:[.,]\d+)?)$/);
  if (ratio) {
    const v = parseFloat(ratio[1].replace(",", "."));
    return isFinite(v) && v > 0 ? v : DEFAULT_SCALE_DEN;
  }
  const embedded = s.match(/1\s*[:/]\s*(\d+(?:[.,]\d+)?)/);
  if (embedded) {
    const v = parseFloat(embedded[1].replace(",", "."));
    return isFinite(v) && v > 0 ? v : DEFAULT_SCALE_DEN;
  }
  const plain = parseFloat(s.replace(",", "."));
  return isFinite(plain) && plain > 0 ? plain : DEFAULT_SCALE_DEN;
}

/** Modell-Meter → Papier-Millimeter für Maßstab 1:scaleDen. */
export function modelMetersToPaperMm(modelM: number, scaleDen: number): number {
  const den = normalizeScaleDen(scaleDen);
  return (modelM * 1000) / den;
}

/** Papier-Millimeter → Modell-Meter für Maßstab 1:scaleDen. */
export function paperMmToModelMeters(paperMm: number, scaleDen: number): number {
  const den = normalizeScaleDen(scaleDen);
  return (paperMm * den) / 1000;
}

/** Geometrischer Faktor Modell-Meter → Papier-Meter (1/N). */
export function modelToPaperFactor(scaleDen: number): number {
  return 1 / normalizeScaleDen(scaleDen);
}

/** 100 → "1:100"; nicht-ganzzahlige Nenner bleiben erhalten (1:12.5). */
export function formatScaleLabel(scaleDen: number): string {
  const den = normalizeScaleDen(scaleDen);
  const rounded = Math.round(den * 100) / 100;
  return `1:${Number.isInteger(rounded) ? rounded : String(rounded).replace(".", ",")}`;
}

/** Millimeter → PDF-Punkte (physisch exakt). */
export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}
