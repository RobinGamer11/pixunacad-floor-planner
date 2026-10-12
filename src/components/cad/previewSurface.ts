/**
 * Untergrund für Werkzeug-Vorschauen.
 *
 * Eine dunkle Linie auf dunklem Panels-Untergrund ist praktisch unsichtbar
 * (z. B. Freihand mit #111111 im Nachtmodus). Deshalb wählt die Vorschau den
 * Untergrund danach aus, welche Fläche zur Linienfarbe den größeren Kontrast
 * bietet – helle Linien bekommen einen dunklen Kasten, dunkle einen hellen.
 */

export type PreviewSurface = { bg: string; border: string };

/** Heller Vorschau-Kasten (für dunkle Linien). */
export const LIGHT_SURFACE: PreviewSurface = {
  bg: "#f7f7f5",
  border: "rgba(0, 0, 0, 0.32)",
};

/** Dunkler Vorschau-Kasten (für helle Linien). */
export const DARK_SURFACE: PreviewSurface = {
  bg: "#15171c",
  border: "rgba(255, 255, 255, 0.32)",
};

/** Näherungswerte der beiden Kästen – nur für die Auswahlentscheidung. */
const LIGHT_LUM = 0.92;
const DARK_LUM = 0.012;

/**
 * Relative Helligkeit (0..1) einer Hex-Farbe, oder null wenn die Angabe
 * nicht lesbar ist (z. B. „transparent“ oder ein CSS-Kommando).
 */
export function colorLuminance(color: string): number | null {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(String(color || "").trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 4) hex = hex.slice(0, 3);
  else if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6) return null;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return null;
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Kontrastverhältnis zweier Helligkeiten (1..21, wie WCAG). */
export function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Vorschau-Untergrund mit dem größten Kontrast zur Linienfarbe.
 * Ist die Farbe nicht lesbar, bleibt `fallback` (das Panels-Design) stehen.
 */
export function previewSurface(color: string, fallback: PreviewSurface): PreviewSurface {
  const lum = colorLuminance(color);
  if (lum === null) return fallback;
  return contrastRatio(lum, LIGHT_LUM) >= contrastRatio(lum, DARK_LUM)
    ? LIGHT_SURFACE
    : DARK_SURFACE;
}
