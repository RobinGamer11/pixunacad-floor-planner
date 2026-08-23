/**
 * hatchSeal.ts — rein optische Haarlinien-Versiegelung von Schraffuren.
 *
 * WICHTIG (Vertrag):
 *   Die Versiegelung ist ausschließlich eine Darstellungskorrektur. Sie läuft
 *   NACH der Bereichserkennung und arbeitet nur auf dem bereits festgeschriebenen
 *   Face-Polygon (Screen-Pfad). Sie darf niemals
 *     - Boundary-Kanten sammeln oder verändern,
 *     - Punkte snappen, Toleranzen anwenden oder Polygone verschieben,
 *     - zusätzliche Segmente in die Fläche aufnehmen.
 *
 *   Ablauf bleibt strikt:
 *     Boundary → Schnittpunkte → Segmente → Face am Klickpunkt → Face FEST
 *     → (nur hier) minimale optische Überdeckung beim Rendern.
 */

/** Maximale optische Überdeckung in CSS-Pixeln (halbe Strichbreite nach außen). */
export const SEAL_MAX_CSS_PX = 1;

/**
 * Strichbreite der Versiegelung in CSS-Pixeln. Sie hängt nur von der
 * Gerätepixeldichte ab (ein Gerätepixel), niemals von Zoom oder Geometrie.
 */
export function sealLineWidthPx(dpr = 1): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(SEAL_MAX_CSS_PX, 1 / d);
}

/**
 * Zeichnet die Versiegelung auf den AKTUELLEN Pfad des Kontexts.
 * Der Pfad muss exakt das bereits ermittelte Fill-Polygon sein.
 */
export function strokeHatchSeal(
  ctx: CanvasRenderingContext2D,
  fillColor: string,
  dpr = 1,
): void {
  ctx.save();
  ctx.strokeStyle = fillColor;
  ctx.lineWidth = sealLineWidthPx(dpr);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}
