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
  // Filter in SVG-Data-URI-Masken werden insbesondere in Safari und teils in
  // Chromium verworfen. Radiale Verläufe liefern denselben weichen Übergang,
  // bleiben aber als CSS mask-image zuverlässig renderbar.
  const gradients = circles
    .map((c, i) => {
      const softness = Math.max(0, Math.min(0.95, c.s));
      if (softness <= 0.01) return "";
      const core = Math.max(0, Math.min(99, (1 - softness) * 100));
      return `<radialGradient id="g${i}"><stop offset="0%" stop-color="black"/><stop offset="${core.toFixed(1)}%" stop-color="black"/><stop offset="100%" stop-color="white"/></radialGradient>`;
    })
    .join("");
  const holes = circles
    .map((c, i) => `<circle cx="${c.x.toFixed(3)}" cy="${c.y.toFixed(3)}" r="${Math.max(0.01, c.r).toFixed(3)}" fill="${c.s > 0.01 ? `url(#g${i})` : "black"}"/>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}" height="${hMm}" viewBox="0 0 ${wMm} ${hMm}">` +
    `<defs>${gradients}` +
    `<mask id="m" maskUnits="userSpaceOnUse" mask-type="luminance" style="mask-type:luminance" x="0" y="0" width="${wMm}" height="${hMm}">` +
    `<rect width="${wMm}" height="${hMm}" fill="white"/>${holes}</mask></defs>` +
    `<rect width="${wMm}" height="${hMm}" fill="black" mask="url(#m)"/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
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
