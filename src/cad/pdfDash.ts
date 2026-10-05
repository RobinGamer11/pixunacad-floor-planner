/** PDF-Strichelung (Seiten-pt) → CAD-Linienart in Welt-mm. Punkte (≈0) → Strichpunkt/Punktiert. */
export function pdfDashToPattern(dashPt: number[], mPerPt: number) {
  const mm = (pt: number) => Math.max(0.01, pt * mPerPt * 1000);
  const arr = dashPt.length % 2 ? [...dashPt, ...dashPt] : dashPt;
  const on = arr.filter((_, i) => i % 2 === 0), off = arr.filter((_, i) => i % 2 === 1);
  const gap = mm(off.reduce((s, x) => s + x, 0) / Math.max(1, off.length));
  const tiny = (x: number) => x < 0.6;
  if (on.every(tiny)) return { kind: "dotted" as const, dashLengthMm: gap, gapLengthMm: gap };
  const dash = mm(Math.max(...on));
  if (on.some(tiny)) return { kind: "dash-dot" as const, dashLengthMm: dash, gapLengthMm: gap };
  return { kind: "dashed" as const, dashLengthMm: dash, gapLengthMm: gap };
}
