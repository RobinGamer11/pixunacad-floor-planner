import { Defaults, SnapType } from "./constants";
import { Vec2, v, projectPointToSegment } from "./geometry";
import { Scene, Segment } from "./Scene";
import { Camera } from "./Camera";

export interface Snap {
  type: string;
  world: Vec2;
  segment: Segment | null;
  pointIndex: number | null;
  t: number | null;
  px: number;
  lineA?: Vec2;
  lineB?: Vec2;
  guidePoint?: Vec2;
  guideDir?: Vec2;
}

export class TopologyEngine {
  scene: Scene;
  camera: Camera;

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  _worldToMousePx(world: Vec2, mouseS: Vec2): number {
    const sp = this.camera.worldToScreen(world.x, world.y);
    return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
  }

  findBestSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    let best: Snap | null = null;
    let bestScore = Infinity;

    const considerPoint = (world: Vec2, segment: Segment, pointIndex: number) => {
      const px = this._worldToMousePx(world, mouseS);
      if (px > Defaults.snapPx) return;
      if (px < bestScore) {
        bestScore = px;
        best = { type: SnapType.POINT, world: v(world.x, world.y), segment, pointIndex, t: pointIndex === 0 ? 0 : 1, px };
      }
    };

    const considerLine = (a: Vec2, b: Vec2, segment: Segment) => {
      const proj = projectPointToSegment(mouseW, a, b);
      const px = this._worldToMousePx(proj.q, mouseS);
      if (px > Defaults.snapPx) return;
      if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) return;
      const score = 1000 + px;
      if (score < bestScore) {
        bestScore = score;
        best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment, pointIndex: null, t: proj.t, px, lineA: a, lineB: b };
      }
    };

    for (const seg of this.scene.segments) {
      considerPoint(seg.a, seg, 0);
      considerPoint(seg.b, seg, 1);
    }
    for (const seg of this.scene.segments) {
      considerLine(seg.a, seg.b, seg);
    }

    return best;
  }

  findBestSnapExcludingSegment(mouseS: Vec2, mouseW: Vec2, excludedSegmentId: string): Snap | null {
    let best: Snap | null = null;
    let bestScore = Infinity;

    const considerPoint = (world: Vec2, segment: Segment, pointIndex: number) => {
      if (segment.id === excludedSegmentId) return;
      const px = this._worldToMousePx(world, mouseS);
      if (px > Defaults.snapPx) return;
      if (px < bestScore) {
        bestScore = px;
        best = { type: SnapType.POINT, world: v(world.x, world.y), segment, pointIndex, t: pointIndex === 0 ? 0 : 1, px };
      }
    };

    const considerLine = (a: Vec2, b: Vec2, segment: Segment) => {
      if (segment.id === excludedSegmentId) return;
      const proj = projectPointToSegment(mouseW, a, b);
      const px = this._worldToMousePx(proj.q, mouseS);
      if (px > Defaults.snapPx) return;
      if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) return;
      const score = 1000 + px;
      if (score < bestScore) {
        bestScore = score;
        best = { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment, pointIndex: null, t: proj.t, px, lineA: a, lineB: b };
      }
    };

    for (const seg of this.scene.segments) {
      considerPoint(seg.a, seg, 0);
      considerPoint(seg.b, seg, 1);
    }
    for (const seg of this.scene.segments) {
      considerLine(seg.a, seg.b, seg);
    }

    return best;
  }

  findNearestLineSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    let best: Snap | null = null;
    let bestPx = Infinity;

    for (const seg of this.scene.segments) {
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
      const res = this.scene.splitSegmentAtT(snap.segment!, snap.t!);
      return v(res.point.x, res.point.y);
    }
    return v(freePoint.x, freePoint.y);
  }
}
