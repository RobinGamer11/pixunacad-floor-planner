/**
 * CSS-Maske für radierte Seiten-Elemente (z. B. CAD-Blatt).
 *
 * Die Radier-Kreise werden als SVG-Maske serialisiert: weiße Fläche = sichtbar,
 * schwarze Kreise = radiert. Im Smooth-Modus bekommen die Kreise einen
 * Gauß-Weichzeichner, sodass der Rand nebelartig ausläuft statt hart zu
 * schneiden.
 */
export type EraseCircle = { x: number; y: number; r: number; s: number };

export function buildEraseMaskCss(
  circles: EraseCircle[] | undefined,
  wMm: number,
  hMm: number,
): React.CSSProperties {
  if (!circles || circles.length === 0 || wMm <= 0 || hMm <= 0) return {};
  const blur = Math.max(
    0.01,
    circles.reduce((m, c) => Math.max(m, c.r * Math.max(0, Math.min(1, c.s)) * 0.6), 0),
  );
  const holes = circles
    .map((c) => `<circle cx="${c.x.toFixed(3)}" cy="${c.y.toFixed(3)}" r="${Math.max(0.01, c.r).toFixed(3)}" fill="black"${c.s > 0.01 ? ' filter="url(#b)"' : ""}/>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}" height="${hMm}" viewBox="0 0 ${wMm} ${hMm}">` +
    `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feGaussianBlur stdDeviation="${blur.toFixed(3)}"/></filter>` +
    `<mask id="m" maskUnits="userSpaceOnUse" mask-type="luminance" style="mask-type:luminance" x="0" y="0" width="${wMm}" height="${hMm}">` +
    `<rect width="${wMm}" height="${hMm}" fill="white"/>${holes}</mask></defs>` +
    `<rect width="${wMm}" height="${hMm}" fill="black" mask="url(#m)"/></svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return {
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "0 0",
    maskPosition: "0 0",
    maskMode: "luminance",
  } as React.CSSProperties;
}
