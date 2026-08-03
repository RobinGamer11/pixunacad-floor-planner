/**
 * CSS-Maske für radierte Seiten-Elemente (z. B. CAD-Blatt, PDF, Bild).
 *
 * Die Radier-Kreise werden als SVG-Maske serialisiert: weiße Fläche = sichtbar,
 * schwarze Kreise = radiert. Im Smooth-Modus wird jeder Stempel mit einer
 * Deckkraft < 1 und einem weichen Verlauf gezeichnet — dadurch akkumulieren
 * überlappende Stempel (längeres Verweilen = vollständig radiert) und der Rand
 * läuft nebelartig aus.
 */
export type EraseCircle = { x: number; y: number; r: number; s: number; a?: number };

export function buildEraseMaskCss(
  circles: EraseCircle[] | undefined,
  wMm: number,
  hMm: number,
): React.CSSProperties {
  if (!circles || circles.length === 0 || wMm <= 0 || hMm <= 0) return {};
  const gradients = circles
    .map((c, i) => {
      const softness = Math.max(0, Math.min(1, c.s));
      if (softness <= 0.01) return "";
      // Stärkere Weichheit: bei 100 % beginnt der Auslauf direkt in der Mitte
      // und die Deckkraft bleibt niedrig — nur längeres Verweilen radiert voll.
      const core = Math.max(0, Math.min(99, Math.pow(1 - softness, 3.5) * 100));
      const mid = Math.max(0.04, 1 - 0.85 * softness).toFixed(3);
      return (
        `<radialGradient id="g${i}">` +
        `<stop offset="0%" stop-color="black" stop-opacity="1"/>` +
        `<stop offset="${core.toFixed(1)}%" stop-color="black" stop-opacity="${mid}"/>` +
        `<stop offset="${Math.min(99, core + (100 - core) * 0.45).toFixed(1)}%" stop-color="black" stop-opacity="${(0.18 * (1 - 0.85 * softness)).toFixed(3)}"/>` +
        `<stop offset="100%" stop-color="black" stop-opacity="0"/>` +
        `</radialGradient>`
      );


    })
    .join("");
  const holes = circles
    .map((c, i) => {
      const soft = c.s > 0.01;
      const alpha = Math.max(0.02, Math.min(1, c.a ?? (soft ? 0.35 * (1 - 0.6 * Math.min(1, c.s)) : 1)));
      return (
        `<circle cx="${c.x.toFixed(3)}" cy="${c.y.toFixed(3)}" r="${Math.max(0.01, c.r).toFixed(3)}" ` +
        `fill="${soft ? `url(#g${i})` : "black"}" fill-opacity="${alpha.toFixed(3)}"/>`
      );
    })
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
