/**
 * Schreibgeschützte Fanggeometrie sichtbarer CAD-Ausschnitte (Transparenzpause im Export).
 *
 * Grundsatz: Diese Geometrie ist rein temporär. Sie wird nie in eine Scene kopiert,
 * nie serialisiert, nie gedruckt und erzeugt keinen Verlaufsschritt. Sie liefert
 * ausschließlich Fangpunkte und Fanglinien in Plan-Weltmetern.
 */
import type { Scene } from "./Scene";
import { Vec2, v } from "./geometry";
import { boxCornersWorld } from "./textGeometry";
import {
  documentCornersWorld,
  documentEdgeMidpointsWorld,
  documentCenterWorld,
  documentAnchorsWorld,
} from "./documentGeometry";
import { getDimensionGeometry } from "./dimensionGeometry";
import { doorGeometry } from "./doorGeom";
import type { ProjectionLayout } from "./PlanProjections";

export interface TracingSnapGeometry {
  points: Vec2[];
  lines: [Vec2, Vec2][];
}

export function emptyTracingSnapGeometry(): TracingSnapGeometry {
  return { points: [], lines: [] };
}

/**
 * Sammelt alle Fangpunkte/-linien einer Scene in deren eigenem Weltsystem.
 * Deckt dieselben Objektarten ab, für die die TopologyEngine im normalen CAD
 * bereits Fangpunkte kennt.
 */
export function collectSceneSnapGeometry(
  scene: Scene,
  isVisible: (labelId: string) => boolean,
  librarySnapScenes: Scene[] = [],
): TracingSnapGeometry {
  const out = emptyTracingSnapGeometry();
  const p = (pt: { x: number; y: number } | null | undefined) => {
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) out.points.push(v(pt.x, pt.y));
  };
  const ln = (a?: { x: number; y: number } | null, b?: { x: number; y: number } | null) => {
    if (!a || !b) return;
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
    out.lines.push([v(a.x, a.y), v(b.x, b.y)]);
  };
  const mid = (a: Vec2, b: Vec2) => v((a.x + b.x) / 2, (a.y + b.y) / 2);

  const collect = (scn: Scene, checkVisible: boolean) => {
    const vis = (labelId: string) => (checkVisible ? isVisible(labelId) : true);

    for (const seg of scn.segments) {
      if (!vis(seg.labelId)) continue;
      p(seg.a); p(seg.b);
      if ((seg as any).midpointSnap) p(mid(seg.a, seg.b));
      ln(seg.a, seg.b);
    }

    for (const hatch of scn.hatches) {
      if (!vis(hatch.labelId)) continue;
      for (const pt of hatch.points || []) p(pt);
      for (const loop of hatch.holes || []) {
        if (!loop || loop.length < 2) continue;
        for (let i = 0; i < loop.length; i++) {
          p(loop[i]);
          ln(loop[i], loop[(i + 1) % loop.length]);
        }
      }
    }
    for (const edge of scn.getHatchEdges()) {
      if (!vis(edge.hatch.labelId)) continue;
      ln(edge.a, edge.b);
    }

    for (const wall of scn.walls) {
      if (!vis(wall.labelId)) continue;
      const ref = wall.corners || [];
      for (let i = 0; i < ref.length; i++) {
        p(ref[i]);
        if (i < ref.length - 1) ln(ref[i], ref[i + 1]);
      }
    }

    // Türen/Fenster: Öffnungsenden und Mitte wie im normalen CAD.
    for (const door of scn.doors || []) {
      if (!vis(door.labelId)) continue;
      const wall = scn.getWallById(door.wallId);
      if (!wall) continue;
      try {
        const g = doorGeometry(wall, door);
        if (!g) continue;
        p(g.leftEnd); p(g.rightEnd); p(g.center);
      } catch { /* defensiv */ }
    }

    // Textobjekte und Tabellen nutzen dieselbe Eckpunkt-Infrastruktur.
    for (const box of [...scn.textBoxes, ...(((scn as any).tables as any[]) || [])] as any[]) {
      if (!vis(box.labelId)) continue;
      for (const c of boxCornersWorld(box)) p(c);
    }

    for (const dim of scn.dimensions) {
      if (!vis(dim.labelId)) continue;
      p(dim.p1); p(dim.p2);
      if ((dim as any).p3) p((dim as any).p3);
      try {
        const g = getDimensionGeometry(dim);
        p(g.d1); p(g.d2); p(g.mid);
        ln(g.d1, g.d2);
      } catch { /* defensiv */ }
    }

    for (const doc of scn.documents) {
      if (!vis(doc.labelId)) continue;
      for (const c of documentCornersWorld(doc)) p(c);
      for (const m of documentEdgeMidpointsWorld(doc)) p(m);
      p(documentCenterWorld(doc));
      for (const a of documentAnchorsWorld(doc)) p(a);
    }

    for (const st of scn.freeStrokes) {
      if (!vis(st.labelId)) continue;
      const pts = st.points || [];
      if (pts.length < 2) continue;
      p(pts[0]); p(pts[pts.length - 1]);
    }
  };

  collect(scene, true);
  // Bibliotheksinstanzen liegen bereits als aufgelöste Weltszenen vor.
  for (const ls of librarySnapScenes) collect(ls, false);
  return out;
}

/** Liang–Barsky: Strecke auf ein achsparalleles Rechteck zuschneiden. */
function clipSegment(
  a: Vec2,
  b: Vec2,
  r: { left: number; right: number; top: number; bottom: number },
): [Vec2, Vec2] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const tests: [number, number][] = [
    [-dx, a.x - r.left],
    [dx, r.right - a.x],
    [-dy, a.y - r.top],
    [dy, r.bottom - a.y],
  ];
  for (const [pp, qq] of tests) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [
    v(a.x + dx * t0, a.y + dy * t0),
    v(a.x + dx * t1, a.y + dy * t1),
  ];
}

/**
 * Überführt Fanggeometrie eines Quellblatts (Blatt-Weltmeter) in Plan-Weltmeter
 * — mit Maßstab, Position, Rotation und Ausschnitt-Clip der Projektion.
 * Weggeschnittene Teile entfallen vollständig.
 */
export function transformSnapGeometryToPlan(
  geo: TracingSnapGeometry,
  layout: ProjectionLayout,
  rotationRad: number,
): TracingSnapGeometry {
  const out = emptyTracingSnapGeometry();
  const cos = Math.cos(rotationRad || 0);
  const sin = Math.sin(rotationRad || 0);
  const f = layout.factor;
  const offX = layout.itemOriginOffsetPlanM.x;
  const offY = layout.itemOriginOffsetPlanM.y;
  // Clip-Rechteck in lokalen Metern (vor Rotation).
  const clip = {
    left: layout.clipLocalMm.left / 1000,
    right: layout.clipLocalMm.right / 1000,
    top: layout.clipLocalMm.top / 1000,
    bottom: layout.clipLocalMm.bottom / 1000,
  };
  if (!(clip.right > clip.left) || !(clip.bottom > clip.top)) return out;

  const toLocal = (pt: Vec2) => v(offX + pt.x * f, offY + pt.y * f);
  const toPlan = (pt: Vec2) => v(
    layout.centerPlanM.x + pt.x * cos - pt.y * sin,
    layout.centerPlanM.y + pt.x * sin + pt.y * cos,
  );
  const inside = (pt: Vec2) =>
    pt.x >= clip.left && pt.x <= clip.right && pt.y >= clip.top && pt.y <= clip.bottom;

  for (const pt of geo.points) {
    const l = toLocal(pt);
    if (!inside(l)) continue;
    out.points.push(toPlan(l));
  }
  for (const [a, b] of geo.lines) {
    const seg = clipSegment(toLocal(a), toLocal(b), clip);
    if (!seg) continue;
    out.lines.push([toPlan(seg[0]), toPlan(seg[1])]);
  }
  return out;
}
