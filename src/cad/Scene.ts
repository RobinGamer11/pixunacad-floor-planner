import { Defaults } from "./constants";
import { Vec2, v, clamp, lerp } from "./geometry";

export class Segment {
  id: string;
  a: Vec2;
  b: Vec2;
  color: string;
  thicknessM: number;

  constructor({ id, a, b, color, thicknessM }: { id: string; a: Vec2; b: Vec2; color?: string; thicknessM?: number }) {
    this.id = id;
    this.a = v(a.x, a.y);
    this.b = v(b.x, b.y);
    this.color = color || Defaults.lineColor;
    this.thicknessM = (typeof thicknessM === "number" && thicknessM > 0) ? thicknessM : Defaults.lineThicknessM;
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

  createSegment(a: Vec2, b: Vec2, style: { color?: string; thicknessM?: number } = {}) {
    const seg = new Segment({ id: this._makeId(), a, b, color: style.color, thicknessM: style.thicknessM });
    this.segments.push(seg);
    this._rebuildIdMap();
    return seg;
  }

  getSegmentById(id: string): Segment | null {
    return this._idMap.get(id) || null;
  }

  removeSegment(seg: Segment) {
    this.segments = this.segments.filter(s => s !== seg);
    this._rebuildIdMap();
  }

  splitSegmentAtT(seg: Segment, t: number) {
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT || t >= 1 - Defaults.splitEpsT) {
      return { didSplit: false, point: (t < 0.5 ? seg.a : seg.b), newSegments: [seg] };
    }
    const p = lerp(seg.a, seg.b, t);
    const style = { color: seg.color, thicknessM: seg.thicknessM };
    this.removeSegment(seg);
    const s1 = this.createSegment(seg.a, p, style);
    const s2 = this.createSegment(p, seg.b, style);
    return { didSplit: true, point: p, newSegments: [s1, s2] };
  }
}
