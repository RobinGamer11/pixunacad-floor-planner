import { Defaults, SnapType } from "./constants";
import { Vec2, v, projectPointToSegment } from "./geometry";
import { Scene, Segment, Hatch } from "./Scene";
import { Camera } from "./Camera";
import { LabelManager } from "./LabelManager";
import { boxCornersWorld } from "./textGeometry";
import { documentCornersWorld, documentEdgeMidpointsWorld } from "./documentGeometry";
import { computeWallLines } from "./wallGeom";
import { computeHealedWallLines } from "./wallHeal";
// Wall-Snap nutzt primär wall.corners (Bezugslinie); optional zusätzlich
// die Sub-Linien-Eckpunkte/-Kanten (gegenüberliegende Wandkante), wenn das
// aktive Werkzeug das anfordert (z. B. WallTool beim Zeichnen).

export type WallLineKind = "main" | "sub" | "help";

export interface Snap {
  type: string;
  world: Vec2;
  segment: Segment | null;
  hatch?: Hatch | null;
  pointIndex: number | null;
  edgeIndex?: number | null;
  t: number | null;
  px: number;
  lineA?: Vec2;
  lineB?: Vec2;
  guidePoint?: Vec2;
  guideDir?: Vec2;
  isDraftStart?: boolean;
  /** Wenn der Snap auf einer Wandlinie/-eckpunkt liegt: Wand-ID. */
  wallId?: string | null;
  /** Wandlinien-Typ (Priorität): main = Haupt (P1), help = Mitte (P2), sub = Sub (P3). */
  wallLine?: WallLineKind | null;
}

export class TopologyEngine {
  scene: Scene;
  camera: Camera;
  labels: LabelManager;
  /** Read-only Snap-Quellen aus anderen Blättern (Transparentpause). */
  overlayScenes: Scene[] = [];
  /** Wand-ID mit Snap-Vorrang (z. B. aktuell selektierte Wand) — deren Eckpunkte gewinnen Ties. */
  priorityWallId: string | null = null;
  /** Wenn true, werden zusätzlich Sub-Linien-Eckpunkte/-Kanten anderer Wände
   * (gegenüberliegende Wandkante) als Snap-Kandidaten berücksichtigt. */
  includeWallOffsetSnaps = false;
  /** Art der gerade gezeichneten Wand. Steuert, ob bei Nachbarwänden die
   * Bezugslinie (main) oder die Sublinie (sub) als bevorzugter Snap-Kandidat
   * gilt:
   *  - "inner" zeichnen + Nachbar ist "outer" → Sub bevorzugt (Innenwand
   *    orientiert sich an Innenkante der Außenwand).
   *  - sonst → Bezugslinie bevorzugt.
   */
  activeDrawingWallKind: "outer" | "inner" | null = null;


  constructor(scene: Scene, camera: Camera, labels: LabelManager) {
    this.scene = scene;
    this.camera = camera;
    this.labels = labels;
  }

  _worldToMousePx(world: Vec2, mouseS: Vec2): number {
    const sp = this.camera.worldToScreen(world.x, world.y);
    return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
  }

  _segmentsFrontToBack(): Segment[] {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.segments]
      .filter(s => this.labels.isVisible(s.labelId))
      .sort((a, b) => (rank.get(b.labelId) || 0) - (rank.get(a.labelId) || 0));
  }

  _hatchesFrontToBack(): Hatch[] {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.hatches]
      .filter(h => this.labels.isVisible(h.labelId))
      .sort((a, b) => (rank.get(b.labelId) || 0) - (rank.get(a.labelId) || 0));
  }

  findBestSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    let best: Snap | null = null;
    let bestScore = Infinity;

    const considerPoint = (world: Vec2, segment: Segment | null, hatch: Hatch | null, pointIndex: number, edgeIndex?: number | null) => {
      const px = this._worldToMousePx(world, mouseS);
      if (px > Defaults.snapPx) return;
      if (px < bestScore) {
        bestScore = px;
        best = { type: SnapType.POINT, world: v(world.x, world.y), segment, hatch, pointIndex, edgeIndex: edgeIndex ?? null, t: pointIndex === 0 ? 0 : 1, px };
      }
    };

    const considerLine = (a: Vec2, b: Vec2, segment: Segment | null, hatch: Hatch | null, edgeIndex?: number | null) => {
      const proj = projectPointToSegment(mouseW, a, b);
      const px = this._worldToMousePx(proj.q, mouseS);
      if (px > Defaults.snapPx) return;
      if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) return;
      const score = 1000 + px;
      if (score < bestScore) {
        bestScore = score;
        best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment, hatch, pointIndex: null, edgeIndex: edgeIndex ?? null, t: proj.t, px, lineA: a, lineB: b };
      }
    };

    // Segment points
    const segs = this._segmentsFrontToBack();
    for (const seg of segs) {
      considerPoint(seg.a, seg, null, 0);
      considerPoint(seg.b, seg, null, 1);
    }
    // Hatch points (outer + holes)
    for (const hatch of this._hatchesFrontToBack()) {
      for (let i = 0; i < hatch.points.length; i++) {
        considerPoint(hatch.points[i], null, hatch, i);
      }
      if (hatch.holes) {
        for (const loop of hatch.holes) {
          if (!loop) continue;
          for (const p of loop) considerPoint(p, null, null, -1);
        }
      }
    }
    // TextBox corners
    for (const box of this.scene.textBoxes) {
      if (!this.labels.isVisible(box.labelId)) continue;
      const corners = boxCornersWorld(box);
      for (const c of corners) {
        considerPoint(c, null, null, -1);
      }
    }
    // Dimension endpoints
    for (const dim of this.scene.dimensions) {
      if (!this.labels.isVisible(dim.labelId)) continue;
      considerPoint(dim.p1, null, null, -1);
      considerPoint(dim.p2, null, null, -1);
    }
    // Document corners + edge midpoints
    for (const doc of this.scene.documents) {
      if (!this.labels.isVisible(doc.labelId)) continue;
      for (const c of documentCornersWorld(doc)) considerPoint(c, null, null, -1);
      for (const m of documentEdgeMidpointsWorld(doc)) considerPoint(m, null, null, -1);
    }
    // Segment lines
    for (const seg of segs) {
      considerLine(seg.a, seg.b, seg, null);
    }
    // Wand-Snap: AUSSCHLIESSLICH Bezugslinien (wall.corners) – Offsetlinien
    // (sub/help) sind abgeleitete Geometrie und besitzen keine topologische
    // Bedeutung. Damit werden Anschlüsse zwingend über Bezugslinie ↔ Bezugslinie
    // gebildet, nicht über parallele Wandkanten.
    const visibleWalls = this.scene.walls.filter(w => this.labels.isVisible(w.labelId));
    for (const wall of visibleWalls) {
      const ref = wall.corners;
      if (ref.length < 2) continue;
      const isPriority = !!(this.priorityWallId && wall.id === this.priorityWallId);
      for (const p of ref) {
        const px = this._worldToMousePx(p, mouseS);
        if (px > Defaults.snapPx) continue;
        // Priority-Wand: Score deutlich nach unten ziehen, sodass deren
        // Bezugslinien-Eckpunkte konkurrierende Nachbarpunkte schlagen.
        const score = isPriority ? px - 10000 : px;
        if (score < bestScore) {
          bestScore = score;
          best = { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: -1, edgeIndex: null, t: null, px, wallId: wall.id, wallLine: "main" };
        }
      }
      for (let i = 0; i < ref.length - 1; i++) {
        const before = best;
        considerLine(ref[i], ref[i + 1], null, null);
        if (best !== before && best) { (best as Snap).wallId = wall.id; (best as Snap).wallLine = "main"; }
      }

      // Optional: Sub-Linien-Eckpunkte/-Kanten als Fang anbieten (z. B.
      // beim Zeichnen einer Innenwand mit Bezugsseite „Außen" oder umgekehrt).
      // Schlechtere Priorität als Bezugslinie, damit reference-line corners
      // bei Überlagerung weiterhin gewinnen.
      if (this.includeWallOffsetSnaps) {
        const otherVisibleWalls = visibleWalls.filter(w => w !== wall && w.corners.length >= 2);
        const healed = computeHealedWallLines(wall, otherVisibleWalls, this.scene.getWallTopology());

        // Gehealte Hauptlinie (verlängerte Bezugslinie an Gehrung/T-Stoß) als
        // zusätzliche Snap-Kandidaten — damit Wände auch im verlängerten
        // Bereich angedockt werden können.
        const mainPts = healed.mainCorners;
        for (const p of mainPts) {
          const px = this._worldToMousePx(p, mouseS);
          if (px > Defaults.snapPx) continue;
          const score = isPriority ? px - 10000 : px;
          if (score < bestScore) {
            bestScore = score;
            best = { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: -1, edgeIndex: null, t: null, px, wallId: wall.id, wallLine: "main" };
          }
        }
        for (let i = 0; i < mainPts.length - 1; i++) {
          const a = mainPts[i], b = mainPts[i + 1];
          const proj = projectPointToSegment(mouseW, a, b);
          const px = this._worldToMousePx(proj.q, mouseS);
          if (px > Defaults.snapPx) continue;
          if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
          const score = (isPriority ? -10000 : 0) + 1000 + px;
          if (score < bestScore) {
            bestScore = score;
            best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment: null, hatch: null, pointIndex: null, edgeIndex: null, t: proj.t, px, lineA: a, lineB: b, wallId: wall.id, wallLine: "main" };
          }
        }

        const subPts = healed.subCorners;
        const subBias = isPriority ? -10000 : 0;
        for (const p of subPts) {
          const px = this._worldToMousePx(p, mouseS);
          if (px > Defaults.snapPx) continue;
          // +200 Strafpunkte: Bezugslinien-Punkte (px direkt) gewinnen Ties.
          const score = subBias + px + 200;
          if (score < bestScore) {
            bestScore = score;
            best = { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: -1, edgeIndex: null, t: null, px, wallId: wall.id, wallLine: "sub" };
          }
        }
        for (let i = 0; i < subPts.length - 1; i++) {
          const a = subPts[i], b = subPts[i + 1];
          const proj = projectPointToSegment(mouseW, a, b);
          const px = this._worldToMousePx(proj.q, mouseS);
          if (px > Defaults.snapPx) continue;
          if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
          // Sub-Linien-Kanten: 1200 (Linien-Basis 1000 + 200 Strafe ggü. Bezugslinie)
          const score = subBias + 1200 + px;
          if (score < bestScore) {
            bestScore = score;
            best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment: null, hatch: null, pointIndex: null, edgeIndex: null, t: proj.t, px, lineA: a, lineB: b, wallId: wall.id, wallLine: "sub" };
          }
        }
      }
    }

    // Hatch edges
    for (const edge of this.scene.getHatchEdges()) {
      if (!this.labels.isVisible(edge.hatch.labelId)) continue;
      considerLine(edge.a, edge.b, null, edge.hatch, edge.edgeIndex);
    }
    // Hole edges (Snap-Linien — kein insert-on-snap, da Loops keine "edgeIndex" im Scene-Modell haben)
    for (const hatch of this._hatchesFrontToBack()) {
      if (!hatch.holes) continue;
      for (const loop of hatch.holes) {
        if (!loop || loop.length < 2) continue;
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          considerLine(a, b, null, null);
        }
      }
    }

    // Overlay-Sheets (Transparentpause) — nur Snap, nicht editierbar.
    // Wir geben Punkte/Linien als „freie" Snaps zurück (segment/hatch=null), damit
    // resolveSnapPoint() nichts splittet/inserted.
    for (const ovScene of this.overlayScenes) {
      if (!ovScene) continue;
      // Punkte: Segment-Endpunkte
      for (const seg of ovScene.segments) {
        if (!this.labels.isVisible(seg.labelId)) continue;
        considerPoint(seg.a, null, null, -1);
        considerPoint(seg.b, null, null, -1);
      }
      // Punkte: Hatch-Punkte
      for (const hatch of ovScene.hatches) {
        if (!this.labels.isVisible(hatch.labelId)) continue;
        for (const p of hatch.points) considerPoint(p, null, null, -1);
      }
      // Punkte: TextBox-Ecken
      for (const box of ovScene.textBoxes) {
        if (!this.labels.isVisible(box.labelId)) continue;
        for (const c of boxCornersWorld(box)) considerPoint(c, null, null, -1);
      }
      // Punkte: Dimension-Endpunkte
      for (const dim of ovScene.dimensions) {
        if (!this.labels.isVisible(dim.labelId)) continue;
        considerPoint(dim.p1, null, null, -1);
        considerPoint(dim.p2, null, null, -1);
      }
      // Punkte: Document-Ecken/Mittelpunkte
      for (const doc of ovScene.documents) {
        if (!this.labels.isVisible(doc.labelId)) continue;
        for (const c of documentCornersWorld(doc)) considerPoint(c, null, null, -1);
        for (const m of documentEdgeMidpointsWorld(doc)) considerPoint(m, null, null, -1);
      }
      // Linien: Segmente
      for (const seg of ovScene.segments) {
        if (!this.labels.isVisible(seg.labelId)) continue;
        considerLine(seg.a, seg.b, null, null);
      }
      // Linien: Hatch-Kanten
      for (const edge of ovScene.getHatchEdges()) {
        if (!this.labels.isVisible(edge.hatch.labelId)) continue;
        considerLine(edge.a, edge.b, null, null);
      }
    }

    return best;
  }

  findBestSnapExcludingSegment(mouseS: Vec2, mouseW: Vec2, excludedSegmentId: string): Snap | null {
    let best: Snap | null = null;
    let bestScore = Infinity;

    const considerPoint = (world: Vec2, segment: Segment | null, hatch: Hatch | null, pointIndex: number) => {
      if (segment && segment.id === excludedSegmentId) return;
      const px = this._worldToMousePx(world, mouseS);
      if (px > Defaults.snapPx) return;
      if (px < bestScore) {
        bestScore = px;
        best = { type: SnapType.POINT, world: v(world.x, world.y), segment, hatch, pointIndex, t: pointIndex === 0 ? 0 : 1, px };
      }
    };

    const considerLine = (a: Vec2, b: Vec2, segment: Segment | null, hatch: Hatch | null) => {
      if (segment && segment.id === excludedSegmentId) return;
      const proj = projectPointToSegment(mouseW, a, b);
      const px = this._worldToMousePx(proj.q, mouseS);
      if (px > Defaults.snapPx) return;
      if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) return;
      const score = 1000 + px;
      if (score < bestScore) {
        bestScore = score;
        best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment, hatch, pointIndex: null, t: proj.t, px, lineA: a, lineB: b };
      }
    };

    const segs = this._segmentsFrontToBack();
    for (const seg of segs) {
      considerPoint(seg.a, seg, null, 0);
      considerPoint(seg.b, seg, null, 1);
    }
    for (const hatch of this.scene.hatches) {
      for (let i = 0; i < hatch.points.length; i++) {
        considerPoint(hatch.points[i], null, hatch, i);
      }
    }
    for (const seg of segs) {
      considerLine(seg.a, seg.b, seg, null);
    }
    for (const edge of this.scene.getHatchEdges()) {
      considerLine(edge.a, edge.b, null, edge.hatch);
    }

    return best;
  }

  findBestSnapExcludingHatch(mouseS: Vec2, mouseW: Vec2, excludedHatchId: string, excludedPointIndex?: number, excludeAllPoints?: boolean): Snap | null {
    let best: Snap | null = null;
    let bestScore = Infinity;

    const considerPoint = (world: Vec2, segment: Segment | null, hatch: Hatch | null, pointIndex: number) => {
      const px = this._worldToMousePx(world, mouseS);
      if (px > Defaults.snapPx) return;
      if (px < bestScore) {
        bestScore = px;
        best = { type: SnapType.POINT, world: v(world.x, world.y), segment, hatch, pointIndex, t: null, px };
      }
    };

    const considerLine = (a: Vec2, b: Vec2, segment: Segment | null, hatch: Hatch | null, edgeIndex?: number) => {
      if (hatch && hatch.id === excludedHatchId) return;
      const proj = projectPointToSegment(mouseW, a, b);
      const px = this._worldToMousePx(proj.q, mouseS);
      if (px > Defaults.snapPx) return;
      if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) return;
      const score = 1000 + px;
      if (score < bestScore) {
        bestScore = score;
        best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment, hatch, pointIndex: null, edgeIndex, t: proj.t, px, lineA: a, lineB: b };
      }
    };

    const segs = this._segmentsFrontToBack();
    for (const seg of segs) {
      considerPoint(seg.a, seg, null, 0);
      considerPoint(seg.b, seg, null, 1);
    }
    // Hatches: andere Hatches voll snappen; das excluded Hatch nur an Punkten ungleich dem editierten.
    for (const hatch of this.scene.hatches) {
      if (hatch.id === excludedHatchId) {
        if (excludeAllPoints) continue; // Translate/Rotate des ganzen Hatches: keine Selbst-Snaps
        for (let i = 0; i < hatch.points.length; i++) {
          if (excludedPointIndex != null && i === excludedPointIndex) continue;
          considerPoint(hatch.points[i], null, hatch, i);
        }
        continue;
      }
      for (let i = 0; i < hatch.points.length; i++) {
        considerPoint(hatch.points[i], null, hatch, i);
      }
    }
    for (const seg of segs) {
      considerLine(seg.a, seg.b, seg, null);
    }
    for (const edge of this.scene.getHatchEdges()) {
      if (edge.hatch.id === excludedHatchId) continue;
      considerLine(edge.a, edge.b, null, edge.hatch, edge.edgeIndex);
    }

    return best;
  }

  findNearestLineSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    let best: Snap | null = null;
    let bestPx = Infinity;

    for (const seg of this._segmentsFrontToBack()) {
      const proj = projectPointToSegment(mouseW, seg.a, seg.b);
      const px = this._worldToMousePx(proj.q, mouseS);
      if (px > Defaults.snapPx) continue;
      if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
      if (px < bestPx) {
        bestPx = px;
        best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment: seg, pointIndex: null, t: proj.t, px, lineA: seg.a, lineB: seg.b };
      }
    }

    return best;
  }

  findPointSnapOnSegment(mouseS: Vec2, segment: Segment): Snap | null {
    if (!segment) return null;
    if (!this.labels.isVisible(segment.labelId)) return null;

    let best: Snap | null = null;
    let bestPx = Infinity;

    const tryPoint = (world: Vec2, pointIndex: number) => {
      const px = this._worldToMousePx(world, mouseS);
      if (px > Defaults.snapPx) return;
      if (px < bestPx) {
        bestPx = px;
        best = { type: SnapType.POINT, world: v(world.x, world.y), segment, pointIndex, t: pointIndex === 0 ? 0 : 1, px };
      }
    };

    tryPoint(segment.a, 0);
    tryPoint(segment.b, 1);
    return best;
  }

  resolveSnapPoint(snap: Snap | null, freePoint: Vec2): Vec2 {
    if (!snap) return v(freePoint.x, freePoint.y);
    if (snap.type === SnapType.POINT || snap.type === SnapType.GUIDE || snap.type === SnapType.GUIDE_POINT) {
      return v(snap.world.x, snap.world.y);
    }
    if (snap.type === SnapType.LINE) {
      if (snap.segment && snap.t != null) {
        const res = this.scene.splitSegmentAtT(snap.segment, snap.t);
        return v(res.point.x, res.point.y);
      }
      if (snap.hatch && snap.edgeIndex != null && snap.t != null) {
        const res = this.scene.insertPointIntoHatchEdge(snap.hatch, snap.edgeIndex, snap.t);
        return v(res.point.x, res.point.y);
      }
      return v(snap.world.x, snap.world.y);
    }
    return v(freePoint.x, freePoint.y);
  }
}
