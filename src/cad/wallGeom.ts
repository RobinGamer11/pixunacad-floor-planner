import { Vec2, v, sub, add, mul, norm, lineLineIntersectionInfinite } from "./geometry";

/** Linkes Lot relativ zur Zeichenrichtung – im Bildschirm (y nach unten) visuell "links". */
export function perpLeftScreen(d: Vec2): Vec2 {
  return { x: d.y, y: -d.x };
}

/**
 * Erzeugt versetzte Polylinie zur Bezugs-Polylinie `corners` mit Offset-Distanz `offset`.
 * Positiver Offset = Versatz in Richtung perpLeftScreen(dir(A->B)).
 * Live-Gehrung an inneren Eckpunkten via Schnitt der versetzten Geraden.
 */
export function offsetPolyline(corners: Vec2[], offset: number): Vec2[] {
  if (corners.length < 2) return corners.map(c => v(c.x, c.y));
  const segs: { a: Vec2; b: Vec2; dir: Vec2; n: Vec2 }[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1];
    const dir = norm(sub(b, a));
    const n = perpLeftScreen(dir);
    segs.push({
      a: add(a, mul(n, offset)),
      b: add(b, mul(n, offset)),
      dir,
      n,
    });
  }
  const out: Vec2[] = [];
  out.push(v(segs[0].a.x, segs[0].a.y));
  for (let i = 0; i < segs.length - 1; i++) {
    const s1 = segs[i], s2 = segs[i + 1];
    const ip = lineLineIntersectionInfinite(s1.a, s1.dir, s2.a, s2.dir);
    if (ip) out.push(ip);
    else out.push(v(s1.b.x, s1.b.y));
  }
  out.push(v(segs[segs.length - 1].b.x, segs[segs.length - 1].b.y));
  return out;
}

export type WallReferenceSide = "outer" | "center" | "inner";
export type WallKind = "outer" | "inner";

/**
 * Berechnet die drei Polylinien einer Wand aus der Bezugs-Polylinie:
 * - mainCorners: Hauptlinie (== gezeichnete Bezugslinie, A,B,..)
 * - subCorners: Sublinie (gegenüberliegende Wandkante, A',B',..) – liegt IMMER links der Zeichenrichtung
 * - helpCorners: Mittellinie (A'',B''..) – immer Mitte
 * Je nach `referenceSide` wandert die ganze Wand:
 *   - "outer": gezeichnete Linie ist Außenkante, Sub liegt links (Innenkante).
 *   - "inner": gezeichnete Linie ist Innenkante, Sub liegt rechts (Außenkante) – wir spiegeln offset.
 *   - "center": gezeichnete Linie ist Mittellinie, Wand verteilt sich symmetrisch.
 */
export function computeWallLines(corners: Vec2[], thicknessM: number, side: WallReferenceSide) {
  const t = Math.max(0, thicknessM);
  // Hinweis: "outer" / "inner" wurden bewusst getauscht — die Bezugsseite "Außen"
  // legt die Wand jetzt rechts der Zeichenrichtung an (Sub liegt rechts), "Innen"
  // legt sie links an. Mittig bleibt symmetrisch.
  let mainOff = 0;
  let subOff = -t;
  let helpOff = -t / 2;
  if (side === "inner") {
    // Sub liegt links (positiver Offset) der Zeichenrichtung
    subOff = t;
    helpOff = t / 2;
  } else if (side === "center") {
    mainOff = t / 2;     // visuell verschiebt sich die Hauptlinie nach links
    subOff = -t / 2;     // Sub nach rechts
    helpOff = 0;         // Mitte = Bezug
  }
  return {
    mainCorners: offsetPolyline(corners, mainOff),
    subCorners: offsetPolyline(corners, subOff),
    helpCorners: offsetPolyline(corners, helpOff),
  };
}
