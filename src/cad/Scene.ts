import { Defaults } from "./constants";
import { Vec2, v, clamp, lerp } from "./geometry";

export class Segment {
  id: string;
  a: Vec2;
  b: Vec2;
  color: string;
  thicknessM: number;
  labelId: string;

  constructor({ id, a, b, color, thicknessM, labelId }: { id: string; a: Vec2; b: Vec2; color?: string; thicknessM?: number; labelId?: string }) {
    this.id = id;
    this.a = v(a.x, a.y);
    this.b = v(b.x, b.y);
    this.color = color || Defaults.lineColor;
    this.thicknessM = (typeof thicknessM === "number" && thicknessM > 0) ? thicknessM : Defaults.lineThicknessM;
    this.labelId = labelId || Defaults.defaultLabelId;
  }
}

export class Scene {
  segments: Segment[] = [];
  private _idMap = new Map<string, Segment>();

  private _makeId(): string {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  private _rebuildIdMap() {
    this._idMap.clear();
    for (const s of this.segments) this._idMap.set(s.id, s);
  }

  createSegment(a: Vec2, b: Vec2, style: { color?: string; thicknessM?: number; labelId?: string } = {}) {
    const seg = new Segment({ id: this._makeId(), a, b, color: style.color, thicknessM: style.thicknessM, labelId: style.labelId });
    this.segments.push(seg);
    this._rebuildIdMap();
    return seg;
  }

  getSegmentById(id: string): Segment | null {
    return this._idMap.get(id) || null;
  }

  getSegmentsByLabelId(labelId: string): Segment[] {
    return this.segments.filter(s => s.labelId === labelId);
  }

  removeSegment(seg: Segment) {
    this.segments = this.segments.filter(s => s !== seg);
    this._rebuildIdMap();
  }

  removeSegmentsByIds(ids: string[]) {
    const set = new Set(ids);
    this.segments = this.segments.filter(s => !set.has(s.id));
    this._rebuildIdMap();
  }

  removeSegmentsByLabelId(labelId: string) {
    this.segments = this.segments.filter(s => s.labelId !== labelId);
    this._rebuildIdMap();
  }

  reassignSegmentsLabel(oldId: string, newId: string) {
    for (const seg of this.segments) {
      if (seg.labelId === oldId) seg.labelId = newId;
    }
  }

  assignSegmentsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const seg of this.segments) {
      if (set.has(seg.id)) seg.labelId = newId;
    }
  }

  splitSegmentAtT(seg: Segment, t: number) {
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT || t >= 1 - Defaults.splitEpsT) {
      return { didSplit: false, point: (t < 0.5 ? seg.a : seg.b), newSegments: [seg] };
    }
    const p = lerp(seg.a, seg.b, t);
    const style = { color: seg.color, thicknessM: seg.thicknessM, labelId: seg.labelId };
    this.removeSegment(seg);
    const s1 = this.createSegment(seg.a, p, style);
    const s2 = this.createSegment(p, seg.b, style);
    return { didSplit: true, point: p, newSegments: [s1, s2] };
  }
}
