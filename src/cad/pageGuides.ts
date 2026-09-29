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

/** Standard-Lochung: Ø 6 mm, 12 mm vom Rand. */
export const HOLE_RADIUS_MM = 3;
export const HOLE_EDGE_MM = 12;
export const HOLE_SPACING_MM = 80;

/** Lochungsmuster einer Exportseite (gleiche Maße wie in der Mappe). */
export type HolePattern = "none" | "din2" | "four" | "a5ring6";

export const HOLE_PATTERNS: Record<Exclude<HolePattern, "none">, { label: string; offsets: number[]; diameter: number }> = {
  din2: { label: "2-fach (DIN 5005, 80 mm)", offsets: [-40, 40], diameter: 6 },
  four: { label: "4-fach (8/8/8 cm)", offsets: [-120, -40, 40, 120], diameter: 6 },
  a5ring6: { label: "6-fach A5 Ringbuch", offsets: [-79, -47.5, -15.8, 15.8, 47.5, 79], diameter: 5.5 },
};

export const HOLE_PATTERN_OPTIONS: { key: HolePattern; label: string }[] = [
  { key: "none", label: "Keine" },
  { key: "din2", label: HOLE_PATTERNS.din2.label },
  { key: "four", label: HOLE_PATTERNS.four.label },
  { key: "a5ring6", label: HOLE_PATTERNS.a5ring6.label },
];

export function normalizeHolePunchSide(v: unknown): HolePunchSide {
  return v === "top" || v === "right" || v === "bottom" ? v : "left";
}

/** Liest `holePattern`; Altdaten mit `holePunch: true` → 2-fach. */
export function normalizeHolePattern(v: unknown, legacyHolePunch?: unknown): HolePattern {
  if (v === "din2" || v === "four" || v === "a5ring6" || v === "none") return v;
  return legacyHolePunch === true ? "din2" : "none";
}

/** Mittelpunkte aller Löcher plus deren Mitte (Hilfspunkt). */
export function holePunchPointsMm(widthMm: number, heightMm: number, side: HolePunchSide, pattern: HolePattern = "din2"): {
  holes: { x: number; y: number }[];
  center: { x: number; y: number };
  radiusMm: number;
} {
  if (pattern === "none") return { holes: [], center: { x: widthMm / 2, y: heightMm / 2 }, radiusMm: 0 };
  const def = HOLE_PATTERNS[pattern];
  let center: { x: number; y: number };
  let holes: { x: number; y: number }[];
  if (side === "left" || side === "right") {
    const x = side === "left" ? HOLE_EDGE_MM : widthMm - HOLE_EDGE_MM;
    center = { x, y: heightMm / 2 };
    holes = def.offsets.map(o => ({ x, y: heightMm / 2 + o }));
  } else {
    const y = side === "top" ? HOLE_EDGE_MM : heightMm - HOLE_EDGE_MM;
    center = { x: widthMm / 2, y };
    holes = def.offsets.map(o => ({ x: widthMm / 2 + o, y }));
  }
  return { holes, center, radiusMm: def.diameter / 2 };
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
export function pageGuideSnapGeometry(opts: { widthMm: number; heightMm: number; marginsMm: number; holePattern: HolePattern; holePunchSide: HolePunchSide }): {
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
  if (opts.holePattern !== "none") {
    const hp = holePunchPointsMm(W, H, opts.holePunchSide, opts.holePattern);
    for (const h of hp.holes) points.push(toW(h));
    points.push(toW(hp.center));
  }
  return { points, lines };
}
