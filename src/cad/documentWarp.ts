/**
 * Perspektivische Verzerrung ("Verzerren") für Dokumente.
 *
 * Die Verzerrung wird als 4 Eckpunkte in UV-Koordinaten (0..1 bezogen auf die
 * unverzerrte Dokument-Box) gespeichert: [TL, TR, BR, BL].
 * Gerendert wird sie über ein Dreiecks-Mesh (Bilinear-Subdivision), das auf
 * Canvas2D eine sehr gute Näherung der Homographie liefert.
 */

export type WarpPt = { x: number; y: number };
export type WarpCorners = [WarpPt, WarpPt, WarpPt, WarpPt];

export const IDENTITY_WARP: WarpCorners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function normalizeWarp(raw: any): WarpCorners | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const pts = raw.map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }));
  if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  return pts as WarpCorners;
}

export function isIdentityWarp(c: WarpCorners | null | undefined): boolean {
  if (!c) return true;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(c[i].x - IDENTITY_WARP[i].x) > 1e-4) return false;
    if (Math.abs(c[i].y - IDENTITY_WARP[i].y) > 1e-4) return false;
  }
  return true;
}

/** Liest die aktive Verzerrung eines Dokuments (null = keine Verzerrung). */
export function getDocWarp(doc: any): WarpCorners | null {
  const c = normalizeWarp(doc?.warpCorners);
  if (!c || isIdentityWarp(c)) return null;
  return c;
}

/** Bilineare Interpolation innerhalb des Verzerrungs-Quads. */
export function warpUV(c: WarpCorners, u: number, v: number): WarpPt {
  const top = { x: c[0].x + (c[1].x - c[0].x) * u, y: c[0].y + (c[1].y - c[0].y) * u };
  const bot = { x: c[3].x + (c[2].x - c[3].x) * u, y: c[3].y + (c[2].y - c[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

/**
 * Zeichnet ein Bild verzerrt in die lokale Doc-Box (-w/2..w/2, -h/2..h/2).
 * `corners` sind UV-Punkte (0..1) der Zielform.
 */
export function drawWarpedImage(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  w: number,
  h: number,
  corners: WarpCorners,
  subdiv = 16,
) {
  if (!srcW || !srcH || w <= 0 || h <= 0) return;
  const N = Math.max(2, Math.min(40, subdiv));
  const toLocal = (u: number, v: number) => {
    const p = warpUV(corners, u, v);
    return { x: (p.x - 0.5) * w, y: (p.y - 0.5) * h };
  };

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const v0 = j / N, v1 = (j + 1) / N;
      const d00 = toLocal(u0, v0);
      const d10 = toLocal(u1, v0);
      const d11 = toLocal(u1, v1);
      const d01 = toLocal(u0, v1);
      const s00 = { x: u0 * srcW, y: v0 * srcH };
      const s10 = { x: u1 * srcW, y: v0 * srcH };
      const s11 = { x: u1 * srcW, y: v1 * srcH };
      const s01 = { x: u0 * srcW, y: v1 * srcH };
      drawTriangle(ctx, src, s00, s10, s11, d00, d10, d11);
      drawTriangle(ctx, src, s00, s11, s01, d00, d11, d01);
    }
  }
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  s0: WarpPt, s1: WarpPt, s2: WarpPt,
  d0: WarpPt, d1: WarpPt, d2: WarpPt,
) {
  const denom = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(denom) < 1e-9) return;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denom;
  const b = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denom;
  const c = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denom;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denom;
  const e = d0.x - a * s0.x - b * s0.y;
  const f = d0.y - c * s0.x - d * s0.y;

  ctx.save();
  ctx.beginPath();
  // Winziges Aufblähen verhindert Haarrisse zwischen den Dreiecken.
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: WarpPt) => {
    const dx = p.x - cx, dy = p.y - cy;
    const L = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / L) * 0.6, y: p.y + (dy / L) * 0.6 };
  };
  const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.lineTo(g2.x, g2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, c, b, d, e, f);
  try { ctx.drawImage(src, 0, 0); } catch {}
  ctx.restore();
}
