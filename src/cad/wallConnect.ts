import { Vec2, v, dist, sub } from "./geometry";
import { Defaults } from "./constants";
import type { Scene, Wall } from "./Scene";

/**
 * ArchiCAD-Stil Bezugslinien-Trim: Ein oder beide Endpunkte einer Wand werden
 * auf das nächstgelegene Snap-Ziel (Endpunkt / Eckpunkt / Segment-Projektion)
 * fremder Bezugslinien gezogen, sofern innerhalb der Reichweite.
 *
 * Reichweite skaliert mit der Wanddicke (≥ 8 cm) — dickere Wände docken
 * großzügiger an.
 *
 * Optionen:
 *   - onlyEndpoint: 0 = nur Start, 1 = nur End, undefined = beide.
 */
export function trimWallEndpointsToNeighbors(
  scene: Scene,
  wall: Wall,
  onlyEndpoint?: "start" | "end",
): boolean {
  const all = scene.walls;
  if (wall.corners.length < 2 || all.length < 2) return false;
  // Bewusst sehr klein: nur wirklich beabsichtigte Anschlüsse dürfen andocken.
  // Größere Reichweiten führten dazu, dass dicht daneben gezeichnete Wände
  // ungewollt auf die Nachbarwand gezogen (und damit verbunden) wurden.
  const reach = Math.max(0.015, wall.thicknessM * 0.25);
  const sides: ("start" | "end")[] = onlyEndpoint ? [onlyEndpoint] : ["start", "end"];
  let changed = false;

  for (const which of sides) {
    const atStart = which === "start";
    const idx = atStart ? 0 : wall.corners.length - 1;
    // Hat dieser Endpunkt einen Sub-/Gehrungs-Anker, ist er bewusst auf der
    // Sub-Linie eines Nachbarn platziert worden → nicht auf Bezugslinie ziehen.
    if (wall.cornerAnchors && wall.cornerAnchors[idx]) continue;
    const p = wall.corners[idx];
    let bestQ: Vec2 | null = null;
    let bestD = reach;


    for (const host of all) {
      if (host === wall) continue;
      if (host.corners.length < 2) continue;

      // 1) Endpunkt-Match hat Vorrang.
      for (const ep of [host.corners[0], host.corners[host.corners.length - 1]]) {
        const d = dist(p, ep);
        if (d < bestD) { bestD = d; bestQ = v(ep.x, ep.y); }
      }
      // 2) Interner Eckpunkt-Match.
      for (let i = 1; i < host.corners.length - 1; i++) {
        const ep = host.corners[i];
        const d = dist(p, ep);
        if (d < bestD) { bestD = d; bestQ = v(ep.x, ep.y); }
      }
      // 3) Projektion auf Bezugslinien-Segment (T-Anschluss).
      for (let i = 0; i < host.corners.length - 1; i++) {
        const a = host.corners[i], b = host.corners[i + 1];
        const ab = sub(b, a);
        const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
        let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / ab2;
        if (t <= 0.001 || t >= 0.999) continue;
        const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) { bestD = d; bestQ = v(q.x, q.y); }
      }
    }

    if (bestQ) {
      const other = wall.corners[atStart ? wall.corners.length - 1 : 0];
      if (dist(bestQ, other) >= Defaults.minSegLenM) {
        wall.corners[idx] = bestQ;
        changed = true;
      }
    }
  }

  if (changed) scene.markWallsDirty();
  return changed;
}
