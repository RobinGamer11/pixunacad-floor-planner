/**
 * Einzige schreibgeschützte Quelle für Hilfslinien-Geometrie.
 * Liest Punkte und Kanten aller sichtbaren Objekte aus der echten
 * Objektgeometrie – verändert nichts, speichert nichts.
 */
import { v, type Vec2 } from "./geometry";
import { canonicalDir } from "./globalGuides";
import { computeStairGeometry } from "./stairGeometry";
import { boxCornersWorld } from "./textGeometry";
import { documentCornersWorld } from "./documentGeometry";
import { doorGeometry } from "./doorGeom";
import { getDimensionGeometry } from "./dimensionGeometry";

export type GuideSourceType =
  | "line" | "polygon" | "wall" | "door" | "hatch" | "free" | "stair" | "dimension"
  | "ruler" | "text" | "table" | "document" | "library" | "extra";

export type GuidePoint = { id: string; world: Vec2; sourceObjectId: string; sourceType: GuideSourceType; incidentDirections: Vec2[] };
export type GuideEdge = { id: string; a: Vec2; b: Vec2; direction: Vec2; sourceObjectId: string; sourceType: GuideSourceType };
export type GuideGeometry = { points: GuidePoint[]; edges: GuideEdge[] };

export interface GuideGeometrySources {
  scene: any;
  isVisible: (labelId: string | undefined) => boolean;
  /** Bereits aufgelöste Weltszenen (Bibliothek, Transparenzpause, Export-Ausschnitte). */
  extraScenes?: { id: string; type: GuideSourceType; scene: any }[];
  /** Temporäre Kanten (Vorschau / Exportrand). */
  extraEdges?: [Vec2, Vec2][];
  /** Temporäre Punkte (laufende Zeichnung). */
  extraPoints?: Vec2[];
}

const dirKey = (d: Vec2) => { const c = canonicalDir(d); return `${c.x.toFixed(4)}_${c.y.toFixed(4)}`; };
const ptKey = (p: Vec2) => `${p.x.toFixed(6)}_${p.y.toFixed(6)}`;

class Builder {
  edges: GuideEdge[] = [];
  private pts = new Map<string, { p: GuidePoint; dirs: Map<string, Vec2> }>();
  private n = 0;

  point(p: Vec2, id: string, type: GuideSourceType, dirs: Vec2[] = []) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
    const k = ptKey(p);
    let e = this.pts.get(k);
    if (!e) { e = { p: { id: `p${this.n++}`, world: v(p.x, p.y), sourceObjectId: id, sourceType: type, incidentDirections: [] }, dirs: new Map() }; this.pts.set(k, e); }
    for (const d of dirs) if (Math.hypot(d.x, d.y) > 1e-9) e.dirs.set(dirKey(d), canonicalDir(d));
  }
  edge(a: Vec2, b: Vec2, id: string, type: GuideSourceType) {
    if (!a || !b) return;
    const d = v(b.x - a.x, b.y - a.y);
    if (Math.hypot(d.x, d.y) < 1e-9) return;
    this.edges.push({ id: `e${this.n++}`, a: v(a.x, a.y), b: v(b.x, b.y), direction: canonicalDir(d), sourceObjectId: id, sourceType: type });
    this.point(a, id, type, [d]); this.point(b, id, type, [d]);
  }
  ring(ps: Vec2[], id: string, type: GuideSourceType, closed = true) {
    if (!ps || ps.length < 2) return;
    for (let i = 0; i < ps.length - 1; i++) this.edge(ps[i], ps[i + 1], id, type);
    if (closed && ps.length > 2) this.edge(ps[ps.length - 1], ps[0], id, type);
  }
  result(): GuideGeometry {
    const points = [...this.pts.values()].map(({ p, dirs }) => ({ ...p, incidentDirections: [...dirs.values()] }));
    return { points, edges: this.edges };
  }
}

function addScene(b: Builder, scn: any, vis: (l: any) => boolean, forced?: GuideSourceType, owner?: string) {
  if (!scn) return;
  const T = (t: GuideSourceType) => forced ?? t;
  const ok = (o: any) => !!o && (forced ? true : vis(o.labelId));
  for (const s of scn.segments || []) if (ok(s)) b.edge(s.a, s.b, owner ?? s.id, T("line"));
  for (const h of scn.hatches || []) if (ok(h)) b.ring(h.points, owner ?? h.id, T(h.constructor?.name === "PolygonShape" ? "polygon" : "hatch"));
  for (const w of scn.walls || []) if (ok(w)) b.ring(w.corners, owner ?? w.id, T("wall"));
  for (const f of scn.freeStrokes || []) if (ok(f)) b.ring(f.points, owner ?? f.id, T("free"), false);
  for (const box of scn.textBoxes || []) if (ok(box)) { try { b.ring(boxCornersWorld(box), owner ?? box.id, T("text")); } catch { /* */ } }
  for (const t of scn.tables || []) if (ok(t)) { try { b.ring(boxCornersWorld(t), owner ?? t.id, T("table")); } catch { /* */ } }
  for (const d of scn.documents || []) if (ok(d)) { try { b.ring(documentCornersWorld(d), owner ?? d.id, T("document")); } catch { /* */ } }
  for (const dim of scn.dimensions || []) if (ok(dim)) {
    try { const g = getDimensionGeometry(dim); b.edge(g.d1, g.d2, owner ?? dim.id, T("dimension")); b.edge(dim.p1, g.d1, owner ?? dim.id, T("dimension")); b.edge(dim.p2, g.d2, owner ?? dim.id, T("dimension")); } catch { /* */ }
  }
  for (const door of scn.doors || []) if (ok(door)) {
    try {
      const wall = scn.getWallById?.(door.wallId); const g: any = wall ? doorGeometry(wall, door) : null;
      if (g) { b.edge(g.leftEnd, g.rightEnd, owner ?? door.id, T("door")); if (g.leftInner) b.ring([g.leftInner, g.rightInner, g.rightOuter, g.leftOuter], owner ?? door.id, T("door")); b.point(g.center, owner ?? door.id, T("door"), [v(g.rightEnd.x - g.leftEnd.x, g.rightEnd.y - g.leftEnd.y)]); }
    } catch { /* */ }
  }
  for (const st of scn.stairs || []) if (ok(st)) {
    try { const g = computeStairGeometry(st); for (const [a, c] of g.outline) b.edge(a, c, owner ?? st.id, T("stair")); for (const [a, c] of g.snapLines) b.edge(a, c, owner ?? st.id, T("stair")); } catch { /* */ }
  }
  const rg = scn.rulerGuide;
  if (rg?.a && rg?.b && !forced) b.edge(rg.a, rg.b, "ruler", "ruler");
}

/** Baut die Hilfslinien-Geometrie aller sichtbaren Quellen. */
export function buildGuideGeometry(src: GuideGeometrySources): GuideGeometry {
  const b = new Builder();
  addScene(b, src.scene, src.isVisible);
  for (const x of src.extraScenes || []) addScene(b, x.scene, src.isVisible, x.type, x.id);
  for (const [a, c] of src.extraEdges || []) b.edge(a, c, "extra", "extra");
  for (const p of src.extraPoints || []) b.point(p, "extra", "extra");
  return b.result();
}

/** Anliegende Achsen an einem Weltpunkt – aus echter Geometrie (Endpunkte + Punkte auf Kanten). */
export function incidentDirectionsAt(g: GuideGeometry, p: Vec2, tolW: number): Vec2[] {
  const out = new Map<string, Vec2>();
  for (const q of g.points) if (Math.hypot(q.world.x - p.x, q.world.y - p.y) <= tolW) for (const d of q.incidentDirections) out.set(dirKey(d), d);
  for (const e of g.edges) {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = dx * dx + dy * dy;
    const t = ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / L;
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    if (Math.hypot(e.a.x + dx * t - p.x, e.a.y + dy * t - p.y) <= tolW) out.set(dirKey(e.direction), e.direction);
  }
  return [...out.values()];
}

/** Nächste Kante zum Mauspunkt (Weltmaß), oder null. */
export function nearestGuideEdge(g: GuideGeometry, p: Vec2, tolW: number): { world: Vec2; dir: Vec2 } | null {
  let best: { world: Vec2; dir: Vec2 } | null = null, bd = tolW;
  for (const e of g.edges) {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / L));
    const q = v(e.a.x + dx * t, e.a.y + dy * t), d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bd) { bd = d; best = { world: q, dir: e.direction }; }
  }
  return best;
}

/** Nächster Geometriepunkt (Weltmaß), oder null. */
export function nearestGuidePoint(g: GuideGeometry, p: Vec2, tolW: number): GuidePoint | null {
  let best: GuidePoint | null = null, bd = tolW;
  for (const q of g.points) { const d = Math.hypot(q.world.x - p.x, q.world.y - p.y); if (d <= bd) { bd = d; best = q; } }
  return best;
}
