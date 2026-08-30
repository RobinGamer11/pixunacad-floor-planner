import type { BrushPresetId } from "./brushStrokes";

/**
 * Standardgrößen beim Auswählen eines Stifts (Pinsel-Linienart).
 *
 * - Projektmappe: 400 px Strichstärke (interne Weltmeter = px / 80, weil der
 *   eingebettete MiniCad mit `referencePxPerM = basePxPerMm * 1000` arbeitet
 *   und die Anzeige über denselben Faktor zurückrechnet).
 * - CAD: 50 cm Strichstärke.
 * - Marker zusätzlich mit 30 % Deckkraft.
 */
export function brushSizeDefaultsFor(preset: BrushPresetId | string, embedded: boolean) {
  const thicknessM = embedded ? 400 / 80 : 0.5;
  const strokeWidthPx = embedded ? 400 : 40;
  const opacity = preset === "marker" ? 0.3 : null;
  return { thicknessM, strokeWidthPx, opacity };
}

/** Wendet die Stift-Standardgrößen auf Werkzeugstandards und Auswahl an. */
export function applyBrushSizeDefaults(
  app: any,
  kind: "line" | "polygon" | "hatch" | "free",
  preset: BrushPresetId | string,
  targets: any[],
) {
  if (!app) return;
  const embedded = !!app.isEmbeddedMiniCad;
  const { thicknessM, strokeWidthPx, opacity } = brushSizeDefaultsFor(preset, embedded);

  if (targets.length === 0) {
    if (kind === "line") app.defaultLineThicknessM = thicknessM;
    else if (kind === "polygon") {
      app.defaultPolygonThicknessM = thicknessM;
      if (opacity != null) app.defaultPolygonAlpha = opacity;
    } else if (kind === "free") {
      app.defaultFreeThicknessM = thicknessM;
      if (opacity != null) app.defaultFreeOpacity = opacity;
    } else if (kind === "hatch") app.defaultHatchStrokeWidthPx = strokeWidthPx;
    return;
  }

  for (const o of targets) {
    if (kind === "hatch") {
      o.strokeWidthPx = strokeWidthPx;
    } else {
      o.thicknessM = thicknessM;
      if (opacity != null) {
        if (typeof o.opacity === "number") o.opacity = opacity;
        else if (typeof o.alpha === "number") o.alpha = opacity;
      }
    }
  }
}
