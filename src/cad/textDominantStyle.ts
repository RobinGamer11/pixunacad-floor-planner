/**
 * textDominantStyle.ts — überwiegender Zeichenstil eines Rich-Text-Inhalts.
 *
 * Wird von den Werkzeug-Einstellungen (CAD und Projektmappe) benutzt, wenn eine
 * Textbox als **Objekt** ausgewählt ist: statt nur des Basisstils zeigen die
 * Felder den gewichteten Mehrheitsstil des tatsächlichen Inhalts.
 * Gewichtet wird nach Anzahl sichtbarer Zeichen je Run.
 */

import { htmlToRuns, type BaseTextStyle } from "./textRichRenderer";

export interface DominantTextStyle {
  fontSizePt: number | null;
  color: string | null;
  bold: boolean | null;
  italic: boolean | null;
  underline: boolean | null;
  strike: boolean | null;
  /** true, wenn der Inhalt mehrere unterschiedliche Ausprägungen enthält. */
  mixed: boolean;
}

const EMPTY: DominantTextStyle = {
  fontSizePt: null, color: null, bold: null, italic: null,
  underline: null, strike: null, mixed: false,
};

function pick<T extends string | number | boolean>(
  weights: Map<T, number>,
): { value: T | null; mixed: boolean } {
  let best: T | null = null;
  let bestW = 0;
  let total = 0;
  for (const [k, w] of weights) {
    total += w;
    if (w > bestW) { bestW = w; best = k; }
  }
  if (best == null || total <= 0) return { value: null, mixed: false };
  return { value: best, mixed: weights.size > 1 };
}

/**
 * Ermittelt den überwiegenden Stil. Werte, die im Inhalt nicht ausgezeichnet
 * sind (z. B. keine Inline-Größe), erben implizit den Basisstil und werden
 * hier als `null` zurückgegeben, damit der Aufrufer den Basiswert behält.
 */
export function dominantRichStyle(html: string, base?: BaseTextStyle): DominantTextStyle {
  let runs;
  try { runs = htmlToRuns(html || "", base); } catch { return { ...EMPTY }; }
  if (!runs.length) return { ...EMPTY };

  const size = new Map<number, number>();
  const color = new Map<string, number>();
  const bold = new Map<boolean, number>();
  const italic = new Map<boolean, number>();
  const underline = new Map<boolean, number>();
  const strike = new Map<boolean, number>();
  const bump = <T>(m: Map<T, number>, k: T, w: number) => m.set(k, (m.get(k) ?? 0) + w);

  for (const run of runs) {
    const w = run.text.replace(/\s/g, "").length;
    if (w <= 0) continue;
    if (run.sizeOverridePt != null && run.sizeOverridePt > 0) bump(size, Math.round(run.sizeOverridePt * 100) / 100, w);
    if (run.color) bump(color, run.color, w);
    bump(bold, !!run.bold, w);
    bump(italic, !!run.italic, w);
    bump(underline, !!run.underline, w);
    bump(strike, !!run.strike, w);
  }

  const s = pick(size);
  const c = pick(color);
  const b = pick(bold);
  const i = pick(italic);
  const u = pick(underline);
  const st = pick(strike);

  return {
    fontSizePt: s.value,
    color: c.value,
    bold: b.value,
    italic: i.value,
    underline: u.value,
    strike: st.value,
    mixed: s.mixed || c.mixed || b.mixed || i.mixed || u.mixed || st.mixed,
  };
}
