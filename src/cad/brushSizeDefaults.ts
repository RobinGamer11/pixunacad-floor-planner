import type { BrushPresetId } from "./brushStrokes";
import { Defaults } from "./constants";

/**
 * Standardgrößen beim Auswählen einer Linienart.
 *
 * - Stifte (Pinsel): Projektmappe 400 px Strichstärke (interne Weltmeter =
 *   px / 80, weil der eingebettete MiniCad mit `referencePxPerM =
 *   basePxPerMm * 1000` arbeitet), CAD 50 cm. Marker zusätzlich 30 % Deckkraft.
 * - Normale Linienarten (Durchgezogen, Gestrichelt, Strich-Punkt, Gepunktet):
 *   die schlanke Grundstärke, damit z. B. 50 cm eines Stifts nicht bestehen
 *   bleiben, wenn man zurück auf „Durchgezogen“ wechselt.
 */
export function brushSizeDefaultsFor(
  preset: BrushPresetId | string,
  embedded: boolean,
  strokeFactor = 1,
) {
  // Kein Stift ausgewählt → schlanke Standard-Linienstärke.
  if (!preset) {
    const base = Defaults.lineThicknessM * (embedded ? strokeFactor : 1);
    return { thicknessM: base, strokeWidthPx: Defaults.hatchStrokePx, opacity: 1 };
  }
  const thicknessM = embedded ? 400 / 80 : 0.5;
  const strokeWidthPx = embedded ? 400 : 40;
  // Marker bekommt 30 % Deckkraft; jede andere Linienart stellt die
  // Transparenz automatisch wieder auf 100 % zurück.
  const opacity = preset === "marker" ? 0.3 : 1;
  return { thicknessM, strokeWidthPx, opacity };
}

/** Wendet die Linienart-Standardgrößen auf Werkzeugstandards und Auswahl an. */
export function applyBrushSizeDefaults(
  app: any,
  kind: "line" | "polygon" | "hatch" | "free",
  preset: BrushPresetId | string,
  targets: any[],
) {
  if (!app) return;
  const embedded = !!app.isEmbeddedMiniCad;
  const strokeFactor = Number(app._strokeFactor) > 0 ? Number(app._strokeFactor) : 1;
  const { thicknessM, strokeWidthPx, opacity } = brushSizeDefaultsFor(preset, embedded, strokeFactor);

  if (targets.length === 0) {
    if (kind === "line") {
      app.defaultLineThicknessM = thicknessM;
      if ("defaultLineAlpha" in app) app.defaultLineAlpha = opacity;
    }
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
