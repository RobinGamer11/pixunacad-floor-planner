import { v, type Vec2 } from "./geometry";
import { SnapType } from "./constants";
import { axisKey, canonicalDir, type GlobalGuides } from "./globalGuides";

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
}

export interface GuideCamera {
  worldToScreen(x: number, y: number): { x: number; y: number };
  screenToWorld?(x: number, y: number): { x: number; y: number };
}

const isPoint = (t: any) => t === SnapType.POINT || t === SnapType.GUIDE_POINT;
const isEdge = (t: any) => t === SnapType.LINE || t === SnapType.GUIDE;

function dirKey(d: Vec2) { const c = canonicalDir(d); return `${c.x.toFixed(4)}_${c.y.toFixed(4)}`; }

/**
 * Liefert die anliegenden Objektachsen an einem Fangpunkt, indem die
 * Topologie in einem kleinen Ring um den Punkt nach Kanten befragt wird.
 * Funktioniert damit für jede Objektart, die Fangkanten liefert.
 */
export function incidentDirections(topo: GuideTopology, cam: GuideCamera, p: Vec2, extraEdges: [Vec2, Vec2][] = []): Vec2[] {
  const out = new Map<string, Vec2>();
  const sp = cam.worldToScreen(p.x, p.y);
  const toW = (sx: number, sy: number) => cam.screenToWorld ? cam.screenToWorld(sx, sy) : null;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const r of [7, 11]) {
      const sx = sp.x + Math.cos(a) * r, sy = sp.y + Math.sin(a) * r;
      const w = toW(sx, sy); if (!w) continue;
      let snap: any = null;
      try { snap = topo.findBestSnap(v(sx, sy), v(w.x, w.y)); } catch { snap = null; }
      if (!snap || snap.type !== SnapType.LINE || !snap.lineA || !snap.lineB) continue;
      const d = v(snap.lineB.x - snap.lineA.x, snap.lineB.y - snap.lineA.y);
      if (Math.hypot(d.x, d.y) < 1e-9) continue;
      out.set(dirKey(d), canonicalDir(d));
    }
  }
  const eps = 1e-6;
  for (const [a, b] of extraEdges) {
    if (Math.hypot(a.x - p.x, a.y - p.y) < eps || Math.hypot(b.x - p.x, b.y - p.y) < eps) {
      const d = v(b.x - a.x, b.y - a.y);
      if (Math.hypot(d.x, d.y) > 1e-9) out.set(dirKey(d), canonicalDir(d));
    }
  }
  return [...out.values()];
}

function nearestExtraEdge(cam: GuideCamera, mouseS: Vec2, edges: [Vec2, Vec2][], tolPx = 10): { world: Vec2; dir: Vec2 } | null {
  let best: { world: Vec2; dir: Vec2 } | null = null, bestPx = tolPx;
  for (const [a, b] of edges) {
    const as = cam.worldToScreen(a.x, a.y), bs = cam.worldToScreen(b.x, b.y);
    const dx = bs.x - as.x, dy = bs.y - as.y, L = dx * dx + dy * dy;
    if (L < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((mouseS.x - as.x) * dx + (mouseS.y - as.y) * dy) / L));
    const px = Math.hypot(as.x + dx * t - mouseS.x, as.y + dy * t - mouseS.y);
    if (px <= bestPx) { bestPx = px; best = { world: v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), dir: v(b.x - a.x, b.y - a.y) }; }
  }
  return best;
}

/** Seiteneffektfreie Zielsuche für einen Rechtsklick. */
export function findGuideTarget(
  topo: GuideTopology, cam: GuideCamera, mouseS: Vec2, mouseW: Vec2, ctx: GuideToolContext = { anchor: null },
): GuideTarget | null {
  let snap: any = null;
  try { snap = topo.findBestSnap(mouseS, mouseW); } catch { snap = null; }
  const extra = ctx.extraEdges || [];
  if (snap?.world && isPoint(snap.type)) {
    return { kind: "point", world: v(snap.world.x, snap.world.y), directions: incidentDirections(topo, cam, snap.world, extra) };
  }
  // Temporäre Endpunkte (Vorschau) als Fangpunkte
  for (const [a, b] of extra) for (const q of [a, b]) {
    const s = cam.worldToScreen(q.x, q.y);
    if (Math.hypot(s.x - mouseS.x, s.y - mouseS.y) <= 10) {
      return { kind: "point", world: v(q.x, q.y), directions: incidentDirections(topo, cam, q, extra) };
    }
  }
  if (snap?.world && isEdge(snap.type) && snap.lineA && snap.lineB) {
    return { kind: "edge", world: v(snap.world.x, snap.world.y), dir: v(snap.lineB.x - snap.lineA.x, snap.lineB.y - snap.lineA.y) };
  }
  const e = nearestExtraEdge(cam, mouseS, extra);
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
