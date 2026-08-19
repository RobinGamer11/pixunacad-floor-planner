import { Vec2, v, sub, dist } from "./geometry";
import type { Wall, WallKind } from "./Scene";
import { computeWallLines, wallRefCorners } from "./wallGeom";

/**
 * Toleranzen (in Welt-Metern).
 *  NODE_TOL  – Cluster-Radius zum Verschmelzen von Wand-Endpunkten zu einem Knoten.
 *  TJ_TOL    – Abstand Endpunkt ↔ fremde Bezugs-Edge, ab dem ein T-Stoß-Knoten entsteht.
 *  CLEANUP_TOL – Toleranz für Mikro-Lücken im Heal-Cleanup-Pass.
 */
export const NODE_TOL = 0.05;
export const TJ_TOL = 0.03;
export const CLEANUP_TOL = 0.06;

export type IncidentEndpoint = "start" | "end";

export interface WallIncidence {
  wallId: string;
  /**
   * "start"/"end" → Wand-Endpunkt liegt am Knoten.
   * "tjunction"   → Knoten liegt im Inneren einer Wand-Edge dieser Wand
   *                 (Wand verläuft hindurch, kein Endpunkt).
   */
  kind: IncidentEndpoint | "tjunction";
  /** Bei "tjunction": Edge-Index und Param t innerhalb der Wand. */
  edgeIndex?: number;
  t?: number;
}

export interface WallNode {
  id: string;
  position: Vec2;
  incidents: WallIncidence[];
}

/**
 * Topologie-Graph aller sichtbaren Wände.
 * Phase 2: Knoten = Cluster von Endpunkten + erkannte T-Stoß-Knoten.
 * Liefert für jede Wand pro Endpunkt die Knoten-Referenz und die übrigen
 * inzidenten Wände (Nachbarn am Knoten). So kann der Heal-Algorithmus
 * deterministisch alle 3+ Wände eines Stoßes nach Priorität auflösen.
 */
export class WallTopologyGraph {
  nodes: WallNode[] = [];
  /** wallId → Knoten am Wand-Start (oder null). */
  private startNodeByWall = new Map<string, WallNode>();
  /** wallId → Knoten am Wand-Ende (oder null). */
  private endNodeByWall = new Map<string, WallNode>();

  /** Vollständiger Aufbau aus aktueller Wand-Liste. */
  build(walls: Wall[]): void {
    this.nodes = [];
    this.startNodeByWall.clear();
    this.endNodeByWall.clear();
    if (!walls || walls.length === 0) return;

    // 1) Endpunkte clustern (greedy nearest-merge mit NODE_TOL).
    const endpoints: { wall: Wall; kind: IncidentEndpoint; p: Vec2 }[] = [];
    for (const w of walls) {
      if (w.corners.length < 2) continue;
      endpoints.push({ wall: w, kind: "start", p: w.corners[0] });
      endpoints.push({ wall: w, kind: "end", p: w.corners[w.corners.length - 1] });
    }

    let nodeIdSeq = 0;
    const newNode = (p: Vec2): WallNode => ({
      id: "n" + (++nodeIdSeq),
      position: v(p.x, p.y),
      incidents: [],
    });

    for (const ep of endpoints) {
      let host: WallNode | null = null;
      let bestD = NODE_TOL;
      for (const n of this.nodes) {
        const d = dist(n.position, ep.p);
        if (d <= bestD) { bestD = d; host = n; }
      }
      if (!host) {
        host = newNode(ep.p);
        this.nodes.push(host);
      } else {
        // Knoten leicht in Richtung neuer Punkt mitteln (stabilisiert Cluster).
        const k = host.incidents.length + 1;
        host.position = v(
          host.position.x + (ep.p.x - host.position.x) / k,
          host.position.y + (ep.p.y - host.position.y) / k,
        );
      }
      host.incidents.push({ wallId: ep.wall.id, kind: ep.kind });
      if (ep.kind === "start") this.startNodeByWall.set(ep.wall.id, host);
      else this.endNodeByWall.set(ep.wall.id, host);
    }

    // 2) T-Stoß-Knoten: für jeden Knoten prüfen, welche fremde Wand mit ihrer
    //    Bezugs-Polylinie nahe der Knoten-Position vorbeiläuft. Wände, deren
    //    Endpunkte bereits am Knoten hängen, werden übersprungen.
    for (const node of this.nodes) {
      const owners = new Set(node.incidents.map(i => i.wallId));
      for (const w of walls) {
        if (owners.has(w.id)) continue;
        if (w.corners.length < 2) continue;
        const hit = projectOnPolyline(node.position, wallRefCorners(w), TJ_TOL);
        if (!hit) continue;
        node.incidents.push({
          wallId: w.id,
          kind: "tjunction",
          edgeIndex: hit.edgeIndex,
          t: hit.t,
        });
      }
    }
  }

  getStartNode(wallId: string): WallNode | null { return this.startNodeByWall.get(wallId) || null; }
  getEndNode(wallId: string): WallNode | null { return this.endNodeByWall.get(wallId) || null; }
  getNodeForEndpoint(wallId: string, atStart: boolean): WallNode | null {
    return atStart ? this.getStartNode(wallId) : this.getEndNode(wallId);
  }
}

/**
 * Projiziert p auf die nächste Edge der Polylinie. Liefert {edgeIndex, t}, wenn
 * der Abstand <= tol UND t strikt im Inneren (nicht an einem Knoten-Endpunkt).
 */
function projectOnPolyline(p: Vec2, poly: Vec2[], tol: number): { edgeIndex: number; t: number } | null {
  let best: { edgeIndex: number; t: number; d: number } | null = null;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const ab = sub(b, a);
    const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
    let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / ab2;
    if (t < 0.02 || t > 0.98) continue;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= tol && (!best || d < best.d)) best = { edgeIndex: i, t, d };
  }
  return best;
}

/** Hilfsklasse: gleichnamige Linien (main/help/sub) am Knoten priorisiert auflösen. */
export function priorityIndex(kind: WallKind, line: "main" | "help" | "sub"): number {
  const base = kind === "outer" ? 0 : 3;
  const off = line === "main" ? 1 : line === "help" ? 2 : 3;
  return base + off;
}

/** Gibt die Wand-Linien-Endpunkte (main/help/sub) am Anfang oder Ende einer Wand zurück. */
export function endpointLineCorners(
  wall: Wall,
  atStart: boolean,
): { main: Vec2; help: Vec2; sub: Vec2 } {
  const lines = computeWallLines(wallRefCorners(wall as any), wall.thicknessM, wall.referenceSide);
  const idx = atStart ? 0 : lines.mainCorners.length - 1;
  return {
    main: v(lines.mainCorners[idx].x, lines.mainCorners[idx].y),
    help: v(lines.helpCorners[idx].x, lines.helpCorners[idx].y),
    sub: v(lines.subCorners[idx].x, lines.subCorners[idx].y),
  };
}
