import { Vec2, v, sub, add, mul, norm, lineLineIntersectionInfinite, tessellateWithBulges, bulgeEndpointTangent } from "./geometry";

/** Linkes Lot relativ zur Zeichenrichtung – im Bildschirm (y nach unten) visuell "links". */
export function perpLeftScreen(d: Vec2): Vec2 {
  return { x: d.y, y: -d.x };
}

/**
 * Erzeugt versetzte Polylinie zur Bezugs-Polylinie `corners` mit Offset-Distanz `offset`.
 * Positiver Offset = Versatz in Richtung perpLeftScreen(dir(A->B)).
 * Live-Gehrung an inneren Eckpunkten via Schnitt der versetzten Geraden.
 *
 * miterLimitAbs (Welt-Einheiten): Maximaler Abstand der Gehrungsspitze vom
 * idealen Eckpunkt. Wird dieser Wert überschritten (sehr spitzer Winkel),
 * fällt die Ecke auf einen sauberen Bevel zurück (zwei Endpunkte der
 * benachbarten Offset-Segmente). Verhindert "explodierende" Spitzen.
 */
export function offsetPolyline(corners: Vec2[], offset: number, miterLimitAbs: number = Math.abs(offset) * 8 + 1e-6): Vec2[] {
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
    const idealCorner = corners[i + 1];
    if (ip) {
      const dx = ip.x - idealCorner.x;
      const dy = ip.y - idealCorner.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= miterLimitAbs) {
        out.push(ip);
      } else {
        // Bevel-Fallback: Ende von s1 und Anfang von s2 separat.
        out.push(v(s1.b.x, s1.b.y));
        out.push(v(s2.a.x, s2.a.y));
      }
    } else {
      out.push(v(s1.b.x, s1.b.y));
    }
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

/**
 * Wandlinien inklusive exakter Bogen-Endnormalen. Das verhindert, dass zwei
 * separat tessellierte Teilbögen am gemeinsamen Fangpunkt um wenige Mikrometer
 * auseinanderlaufen und von der Polygon-Union als getrennte Körper gelten.
 */
export function computeWallLinesForWall(
  wall: { corners: Vec2[]; bulges?: number[]; thicknessM: number; referenceSide: WallReferenceSide },
) {
  const ref = wallRefCorners(wall);
  const lines = computeWallLines(ref, wall.thicknessM, wall.referenceSide);
  if (wall.corners.length < 2 || ref.length < 2) return lines;

  const t = Math.max(0, wall.thicknessM);
  let mainOff = 0, subOff = -t, helpOff = -t / 2;
  if (wall.referenceSide === "inner") { subOff = t; helpOff = t / 2; }
  else if (wall.referenceSide === "center") { mainOff = t / 2; subOff = -t / 2; helpOff = 0; }

  const n = wall.corners.length;
  const setEnd = (atStart: boolean) => {
    const edge = atStart ? 0 : n - 2;
    const p = atStart ? wall.corners[0] : wall.corners[n - 1];
    const tangent = bulgeEndpointTangent(
      wall.corners[edge], wall.corners[edge + 1], wall.bulges?.[edge] || 0, atStart,
    );
    const normal = perpLeftScreen(tangent);
    const idx = atStart ? 0 : lines.mainCorners.length - 1;
    lines.mainCorners[idx] = add(p, mul(normal, mainOff));
    lines.subCorners[idx] = add(p, mul(normal, subOff));
    lines.helpCorners[idx] = add(p, mul(normal, helpOff));
  };
  setEnd(true);
  setEnd(false);
  return lines;
}

/**
 * Bezugs-Polylinie einer Wand inkl. Kantenwölbungen (`wall.bulges`).
 * Ohne Wölbung werden die Original-Eckpunkte zurückgegeben.
 */
export function wallRefCorners(wall: { corners: Vec2[]; bulges?: number[] }): Vec2[] {
  const b = (wall as any).bulges;
  if (!Array.isArray(b) || !b.some((x: number) => !!x)) return wall.corners;
  return tessellateWithBulges(wall.corners, b, false, 24);
}
