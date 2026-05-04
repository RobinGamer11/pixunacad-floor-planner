import { Defaults, SnapType } from "./constants";
import { Vec2, v, projectPointToSegment } from "./geometry";
import { Scene, Segment, Hatch } from "./Scene";
import { Camera } from "./Camera";
import { LabelManager } from "./LabelManager";
import { boxCornersWorld } from "./textGeometry";
import { documentCornersWorld, documentEdgeMidpointsWorld } from "./documentGeometry";

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
}

export class TopologyEngine {
  scene: Scene;
  camera: Camera;
  labels: LabelManager;
  /** Read-only Snap-Quellen aus anderen Blättern (Transparentpause). */
  overlayScenes: Scene[] = [];

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
    // Hatch edges
    for (const edge of this.scene.getHatchEdges()) {
      if (!this.labels.isVisible(edge.hatch.labelId)) continue;
      considerLine(edge.a, edge.b, null, edge.hatch, edge.edgeIndex);
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

  findBestSnapExcludingHatch(mouseS: Vec2, mouseW: Vec2, excludedHatchId: string, excludedPointIndex?: number): Snap | null {
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
