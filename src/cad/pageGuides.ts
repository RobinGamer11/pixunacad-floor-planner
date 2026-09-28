/**
 * Nicht druckbare Hilfsgeometrie einer Exportseite (Seitenrand + Lochung).
 * Wird vom Renderer (nur Anzeige im Export-Modus) und von der Fang-Topologie
 * gemeinsam genutzt, damit Anzeige und Fangpunkte immer übereinstimmen.
 * Koordinaten in Papier-mm, Ursprung oben links, y nach unten.
 */
export type HolePunchSide = "left" | "top" | "right" | "bottom";

export const HOLE_PUNCH_SIDES: { key: HolePunchSide; label: string }[] = [
  { key: "left", label: "Links" },
  { key: "top", label: "Oben" },
  { key: "right", label: "Rechts" },
  { key: "bottom", label: "Unten" },
];

/** Standard-Zweifachlochung: Ø 6 mm, 12 mm vom Rand, Abstand 80 mm. */
export const HOLE_RADIUS_MM = 3;
export const HOLE_EDGE_MM = 12;
export const HOLE_SPACING_MM = 80;

export function normalizeHolePunchSide(v: unknown): HolePunchSide {
  return v === "top" || v === "right" || v === "bottom" ? v : "left";
}

/** Mittelpunkte der beiden Löcher plus deren Mitte (Hilfspunkt). */
export function holePunchPointsMm(widthMm: number, heightMm: number, side: HolePunchSide): {
  holes: { x: number; y: number }[];
  center: { x: number; y: number };
} {
  const d = HOLE_SPACING_MM / 2;
  let center: { x: number; y: number };
  let holes: { x: number; y: number }[];
  if (side === "left" || side === "right") {
    const x = side === "left" ? HOLE_EDGE_MM : widthMm - HOLE_EDGE_MM;
    center = { x, y: heightMm / 2 };
    holes = [{ x, y: heightMm / 2 - d }, { x, y: heightMm / 2 + d }];
  } else {
    const y = side === "top" ? HOLE_EDGE_MM : heightMm - HOLE_EDGE_MM;
    center = { x: widthMm / 2, y };
    holes = [{ x: widthMm / 2 - d, y }, { x: widthMm / 2 + d, y }];
  }
  return { holes, center };
}

/** Rechteck des Seitenrands (innen) oder null, wenn kein Rand gesetzt. */
export function marginRectMm(widthMm: number, heightMm: number, marginsMm: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const m = Math.max(0, marginsMm || 0);
  if (m <= 0 || m * 2 >= widthMm || m * 2 >= heightMm) return null;
  return { x0: m, y0: m, x1: widthMm - m, y1: heightMm - m };
}

/** Papier-mm (oben links) → Welt-Meter (Papier zentriert um den Ursprung). */
export function paperMmToWorld(p: { x: number; y: number }, widthMm: number, heightMm: number): { x: number; y: number } {
  return { x: (p.x - widthMm / 2) / 1000, y: (p.y - heightMm / 2) / 1000 };
}

/** Alle Fangpunkte und -linien der Hilfsgeometrie in Welt-Metern. */
export function pageGuideSnapGeometry(opts: { widthMm: number; heightMm: number; marginsMm: number; holePunch: boolean; holePunchSide: HolePunchSide }): {
  points: { x: number; y: number }[];
  lines: [{ x: number; y: number }, { x: number; y: number }][];
} {
  const { widthMm: W, heightMm: H } = opts;
  const toW = (p: { x: number; y: number }) => paperMmToWorld(p, W, H);
  const points: { x: number; y: number }[] = [];
  const lines: [{ x: number; y: number }, { x: number; y: number }][] = [];
  const r = marginRectMm(W, H, opts.marginsMm);
  if (r) {
    const c = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      points.push(toW(a), toW({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
      lines.push([toW(a), toW(b)]);
    }
  }
  if (opts.holePunch) {
    const hp = holePunchPointsMm(W, H, opts.holePunchSide);
    for (const h of hp.holes) points.push(toW(h));
    points.push(toW(hp.center));
  }
  return { points, lines };
}
