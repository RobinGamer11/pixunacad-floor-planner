/**
 * Snap-Indikator-Renderer.
 * Hochkontrast-Snap-Punkt: weißer Halo (steht VOR Kanten/Linien) + farbiger Kern.
 * Wird von allen Tools verwendet, damit Fangpunkte immer im Vordergrund sichtbar sind.
 */
export function drawSnapDot(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  opts?: { color?: string; ring?: boolean; radius?: number }
) {
  const color = opts?.color ?? "rgba(77,163,255,0.95)";
  const r = opts?.radius ?? 4.5;
  const haloR = r + 2.5;
  ctx.save();
  // Outer dark border for contrast over light surfaces
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.arc(sx, sy, haloR + 1, 0, Math.PI * 2); ctx.fill();
  // White halo — sits OVER edges so the snap point is always visible
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(sx, sy, haloR, 0, Math.PI * 2); ctx.fill();
  // Colored core
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  if (opts?.ring) {
    ctx.strokeStyle = "rgba(77,163,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
