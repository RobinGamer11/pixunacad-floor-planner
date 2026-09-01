/**
 * Gelber Visier-/Zielpunkt des Tablet-Hilfsrads.
 *
 * Wird gezeichnet, solange eine Position "vorgemerkt" ist (Stift hat die
 * Zeichenfläche berührt, der Punkt wurde aber noch nicht per L-Klick/Enter
 * gesetzt). Gemeinsame Logik für die eigenständige CAD-Oberfläche und die
 * eingebettete CAD-Engine der Projektmappe.
 */

/** Ist aktuell eine Position vorgemerkt? */
export function isPendingPointActive(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).__pixunaLmbHint;
}

/**
 * Zeichnet den Visierpunkt an der Bildschirmposition (Canvas-Koordinaten).
 * Erwartet einen Context ohne aktive Kamera-Transformation.
 */
export function drawPendingPointHint(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
) {
  if (!isPendingPointActive()) return;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(200,150,40,0.95)";
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(sx, sy, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(sx - 12, sy); ctx.lineTo(sx + 12, sy);
  ctx.moveTo(sx, sy - 12); ctx.lineTo(sx, sy + 12);
  ctx.stroke();
  ctx.fillStyle = "rgba(200,150,40,0.95)";
  ctx.beginPath();
  ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
