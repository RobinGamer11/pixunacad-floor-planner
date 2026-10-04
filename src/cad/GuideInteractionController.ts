import { v, type Vec2 } from "./geometry";
import { Defaults, SnapType } from "./constants";
import { axisKey, type GlobalGuides } from "./globalGuides";
import { buildGuideGeometry, incidentDirectionsAt, nearestGuideEdge, nearestGuidePoint, type GuideGeometry } from "./guideGeometry";

/** Kontext, den ein Werkzeug für Rechtsklick-Hilfslinien liefert. */
export interface GuideToolContext {
  /** Eigener Bezugspunkt (z. B. gesetzter Startpunkt), sonst null. */
  anchor: Vec2 | null;
  /** Zusätzliche temporäre Kanten (Vorschau/Entwurf), die nicht in der Topologie liegen. */
  extraEdges?: [Vec2, Vec2][];
}

/** Ziel eines Rechtsklicks (seiteneffektfrei ermittelt). */
export type GuideTarget =
  | { kind: "point"; world: Vec2; directions: Vec2[] }
  | { kind: "edge"; world: Vec2; dir: Vec2 };

export interface GuideTopology {
  findBestSnap(mouseS: Vec2, mouseW: Vec2, exclusions?: any): any;
  /** Zentrale, schreibgeschützte Objektgeometrie (guideGeometry.ts). */
  guideGeometry?(extraEdges?: [Vec2, Vec2][]): GuideGeometry;
}

export interface GuideCamera {
  worldToScreen(x: number, y: number): { x: number; y: number };
  screenToWorld?(x: number, y: number): { x: number; y: number };
}

const isPoint = (t: any) => t === SnapType.POINT || t === SnapType.GUIDE_POINT;
const isEdge = (t: any) => t === SnapType.LINE || t === SnapType.GUIDE;

/** Weltmaß von `px` Bildschirmpixeln am Punkt `w`. */
function pxToWorld(cam: GuideCamera, mouseS: Vec2, mouseW: Vec2, px: number): number {
  if (!cam.screenToWorld) return px * 0.01;
  const q = cam.screenToWorld(mouseS.x + px, mouseS.y);
  return Math.max(1e-9, Math.hypot(q.x - mouseW.x, q.y - mouseW.y));
}

/** Anliegende Objektachsen an einem Punkt – ausschließlich aus echter Geometrie. */
export function incidentDirections(geom: GuideGeometry, p: Vec2, tolW = 1e-6): Vec2[] {
  return incidentDirectionsAt(geom, p, tolW);
}

/** Seiteneffektfreie Zielsuche für einen Rechtsklick. */
export function findGuideTarget(
  topo: GuideTopology, cam: GuideCamera, mouseS: Vec2, mouseW: Vec2, ctx: GuideToolContext = { anchor: null },
): GuideTarget | null {
  const extra = ctx.extraEdges || [];
  const geom: GuideGeometry = topo.guideGeometry
    ? topo.guideGeometry(extra)
    : buildGuideGeometry({ scene: null, isVisible: () => true, extraEdges: extra });
  const tolW = pxToWorld(cam, mouseS, mouseW, Defaults.snapPx ?? 10);
  const tight = Math.max(1e-6, tolW * 0.15);
  let snap: any = null;
  try { snap = topo.findBestSnap(mouseS, mouseW); } catch { snap = null; }

  if (snap?.world && isPoint(snap.type)) {
    const w = v(snap.world.x, snap.world.y);
    return { kind: "point", world: w, directions: incidentDirectionsAt(geom, w, tight) };
  }
  const gp = nearestGuidePoint(geom, mouseW, tolW);
  if (gp) return { kind: "point", world: v(gp.world.x, gp.world.y), directions: incidentDirectionsAt(geom, gp.world, tight) };
  if (snap?.world && isEdge(snap.type) && snap.lineA && snap.lineB) {
    return { kind: "edge", world: v(snap.world.x, snap.world.y), dir: v(snap.lineB.x - snap.lineA.x, snap.lineB.y - snap.lineA.y) };
  }
  const e = nearestGuideEdge(geom, mouseW, tolW);
  if (e) return { kind: "edge", world: e.world, dir: e.dir };
  return null;
}

/** Achsen + Gruppenschlüssel nach den verbindlichen Rechtsklick-Regeln. */
export function guideAxesFor(target: GuideTarget, anchor: Vec2 | null): { key: string; axes: { point: Vec2; dir: Vec2 }[]; anchors: Vec2[] } {
  const axes: { point: Vec2; dir: Vec2 }[] = [];
  if (target.kind === "point") {
    const p = target.world;
    axes.push({ point: p, dir: v(1, 0) }, { point: p, dir: v(0, 1) });
    for (const d of target.directions) {
      axes.push({ point: p, dir: d }, { point: p, dir: v(-d.y, d.x) });
    }
    let key = `pt:${p.x.toFixed(6)}_${p.y.toFixed(6)}`;
    if (anchor && Math.hypot(anchor.x - p.x, anchor.y - p.y) > 1e-9) {
      axes.push({ point: anchor, dir: v(p.x - anchor.x, p.y - anchor.y) });
      key += `|a:${anchor.x.toFixed(6)}_${anchor.y.toFixed(6)}`;
    }
    return { key, axes, anchors: [p] };
  }
  const through = anchor ?? target.world;
  return { key: `edge:${axisKey(through, target.dir)}`, axes: [{ point: through, dir: target.dir }], anchors: [] };
}

/**
 * Einzige Instanz, die einen Rechtsklick auf der Zeichenfläche in Hilfslinien
 * übersetzt. Setzt keine Punkte, bestätigt und bricht nichts ab.
 * Rückgabe: true = Rechtsklick verarbeitet.
 */
export class GuideInteractionController {
  constructor(private guides: GlobalGuides, private topo: GuideTopology, private cam: GuideCamera) {}

  handleRightClick(mouseS: Vec2, mouseW: Vec2, ctx: GuideToolContext = { anchor: null }): boolean {
    const target = findGuideTarget(this.topo, this.cam, mouseS, mouseW, ctx);
    if (!target) return false;
    const { key, axes, anchors } = guideAxesFor(target, ctx.anchor);
    if (this.guides.hasGroup(key)) { this.guides.toggleGroup(key, []); return true; }
    this.guides.toggleGroup(key, axes, anchors);
    return true;
  }
}
