/**
 * Zeichnet eine Treppe ausschließlich aus ihren abgeleiteten Daten.
 * Derselbe Pfad dient CAD, Exportausschnitten, PDF und Rastern.
 */
import { computeStairGeometry, stairLabelLines, type P, type StairGeometry } from "./stairGeometry";

type Cam = { worldToScreen(x: number, y: number): { x: number; y: number }; scale: number };

export interface StairDrawOpts {
  alpha?: number;
  invalid?: boolean;
  selected?: boolean;
  /** Vorschau-Geometrie statt Neuberechnung. */
  geometry?: StairGeometry;
}

export function drawStair(ctx: CanvasRenderingContext2D, cam: Cam, st: any, opts: StairDrawOpts = {}) {
  const g = opts.geometry ?? computeStairGeometry(st);
  const S = (q: P) => cam.worldToScreen(q.x, q.y);
  const color = opts.invalid ? "#d33" : (st.color || "#111111");
  ctx.save();
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, st.lineWidthPx || 1);

  const polyPath = (poly: P[]) => {
    ctx.beginPath();
    poly.forEach((q, i) => { const s = S(q); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.closePath();
  };
  for (const l of g.landings) { polyPath(l.poly); ctx.stroke(); }
  for (const t of g.treads) { polyPath(t.poly); ctx.stroke(); }

  if (opts.selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 2;
    for (const [a, b] of g.outline) {
      const sa = S(a), sb = S(b);
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
    }
    ctx.restore();
  }

  const wl = g.walkLine;
  if (wl.length >= 2 && st.showArrow !== false) {
    const sp = wl.map(S);
    ctx.beginPath();
    sp.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
    ctx.stroke();
    const a = sp[sp.length - 2], b = sp[sp.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const hl = Math.max(6, Math.min(16, 0.12 * cam.scale));
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - hl * Math.cos(ang - 0.4), b.y - hl * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - hl * Math.cos(ang + 0.4), b.y - hl * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  if (wl.length >= 1 && st.showCircle !== false) {
    const c = S(wl[0]);
    const r = Math.max(3, Math.min(10, 0.05 * cam.scale));
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (wl.length >= 2 && st.showLabel !== false && g.treadCount > 0) {
    // Mitte der Lauflinie (nach Länge).
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < wl.length; i++) { const d = Math.hypot(wl[i].x - wl[i - 1].x, wl[i].y - wl[i - 1].y); segs.push(d); total += d; }
    let half = total / 2, i = 0;
    while (i < segs.length - 1 && half > segs[i]) { half -= segs[i]; i++; }
    const t = segs[i] ? half / segs[i] : 0;
    const m = { x: wl[i].x + (wl[i + 1].x - wl[i].x) * t, y: wl[i].y + (wl[i + 1].y - wl[i].y) * t };
    const sa = S(wl[i]), sb = S(wl[i + 1]);
    let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    const ms = S(m);
    const fs = Math.max(7, Math.min(28, 0.11 * cam.scale));
    const lines = stairLabelLines(st, g, !!st.showWidth);
    ctx.save();
    ctx.translate(ms.x, ms.y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.font = `${fs}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(lines[0], 0, -fs * 0.25);
    ctx.textBaseline = "top";
    ctx.fillText(lines[1], 0, fs * 0.25);
    if (lines[2]) ctx.fillText(lines[2], 0, fs * 1.35);
    ctx.restore();
  }
  ctx.restore();
}
