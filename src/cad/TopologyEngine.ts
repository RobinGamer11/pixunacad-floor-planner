import { Defaults, SnapType } from "./constants";
import { Vec2, v, projectPointToSegment, projectPointToCurvedEdge } from "./geometry";
import { Scene, Segment, Hatch } from "./Scene";
import { Camera } from "./Camera";
import { LabelManager } from "./LabelManager";
import { boxCornersWorld } from "./textGeometry";
import { documentCornersWorld, documentEdgeMidpointsWorld, documentCenterWorld, documentAnchorsWorld } from "./documentGeometry";
import { computeWallLines } from "./wallGeom";
import { computeHealedWallLines } from "./wallHeal";
import { doorGeometry } from "./doorGeom";
import { getDimensionGeometry } from "./dimensionGeometry";

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
  /** Wenn der Snap auf einem Tür-/Fenster-Eckpunkt liegt: Tür-ID. */
  doorId?: string | null;
  /** Welcher Tür-Endpunkt: "left" | "right" | "center". */
  doorEndpoint?: "left" | "right" | "center" | null;
}

export interface SnapExclusions {
  segmentIds?: ReadonlySet<string>;
  segmentPoint?: { segmentId: string; pointIndex: 0 | 1 };
  segmentLineIds?: ReadonlySet<string>;
  hatchIds?: ReadonlySet<string>;
  hatchPoint?: { hatchId: string; pointIndex: number; holeIndex?: number | null };
  hatchEdgeIds?: ReadonlySet<string>;
  textBoxIds?: ReadonlySet<string>;
  textBoxCorner?: { textBoxId: string; cornerIndex: number };
  dimensionIds?: ReadonlySet<string>;
  documentIds?: ReadonlySet<string>;
  freeStrokeIds?: ReadonlySet<string>;
  wallIds?: ReadonlySet<string>;
  doorIds?: ReadonlySet<string>;
}


export class TopologyEngine {
  scene: Scene;
  camera: Camera;
  labels: LabelManager;
  /** Read-only Snap-Quellen aus anderen Blättern (Transparentpause). */
  overlayScenes: Scene[] = [];
  /** Papierrahmen im Plan-(Druck-)Modus in Metern. Ecken, Kantenmitten,
   * Mittelpunkt und Kanten des Blattrands werden zusätzlich gefangen. */
  planFrame: { widthM: number; heightM: number } | null = null;
  /** Globale Hilfslinien (Rechtsklick-Anker), werkzeugübergreifend. */
  guides: import("./globalGuides").GlobalGuides | null = null;
  /** Wand-ID mit Snap-Vorrang (z. B. aktuell selektierte Wand) — deren Eckpunkte gewinnen Ties. */
  priorityWallId: string | null = null;
  /** Wenn true, werden zusätzlich Sub-Linien-Eckpunkte/-Kanten anderer Wände
   * (gegenüberliegende Wandkante) als Snap-Kandidaten berücksichtigt. */
  includeWallOffsetSnaps = true;


  /** Cache für gehealte Wandlinien während des Snap-Vorgangs. Wird über
   * einen Hash der sichtbaren Wände invalidiert (gleiche Strategie wie der
   * Wand-Topologie-Hash in Scene). Reduziert die `computeHealedWallLines`-
   * Aufrufe von O(walls × mouseMoves) auf O(walls), solange sich die
   * Wandgeometrie zwischen mouseMoves nicht ändert. */
  private _healCache = new Map<string, ReturnType<typeof computeHealedWallLines>>();
  private _healCacheHash = "";

  private _ensureHealCache(visibleWalls: import("./Scene").Wall[]): void {
    let h = "" + visibleWalls.length;
    for (const w of visibleWalls) {
      h += "|" + w.id + ":" + w.kind + ":" + w.thicknessM + ":" + w.referenceSide + ":" + w.corners.length;
      for (const c of w.corners) h += "," + c.x.toFixed(3) + "," + c.y.toFixed(3);
      if (Array.isArray((w as any).bulges)) h += "#" + (w as any).bulges.map((b: number) => (b || 0).toFixed(3)).join(",");
    }
    if (h !== this._healCacheHash) {
      this._healCache.clear();
      this._healCacheHash = h;
    }
  }

  private _getHealed(wall: import("./Scene").Wall, others: import("./Scene").Wall[]) {
    let cached = this._healCache.get(wall.id);
    if (!cached) {
      cached = computeHealedWallLines(wall, others, this.scene.getWallTopology());
      this._healCache.set(wall.id, cached);
    }
    return cached;
  }

  private _isHiddenWallCorner(wall: import("./Scene").Wall, pointIndex: number): boolean {
    return !!wall.hiddenCornerIndices?.includes(pointIndex);
  }


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

  /**
   * Fügt Wand-Snap-Kandidaten (Bezugslinien-Eckpunkte/-Kanten + optional
   * gehealte Sub-/Main-Linien) zu einer bestehenden Snap-Suche hinzu.
   * Wird sowohl von findBestSnap als auch von findBestSnapExcluding*
   * verwendet, damit Wände beim Nachbearbeiten von Objekten ebenso
   * gefangen werden wie beim Neuzeichnen.
   */
  private _addWallSnapsTo(
    mouseS: Vec2,
    mouseW: Vec2,
    register: (candidate: Snap, score: number) => void,
    excludedWallIds?: ReadonlySet<string>,
  ): void {
    const allVisibleWalls = this.scene.walls.filter((wall) => this.labels.isVisible(wall.labelId));
    const candidateWalls = allVisibleWalls.filter((wall) => !excludedWallIds?.has(wall.id));
    if (this.includeWallOffsetSnaps) this._ensureHealCache(allVisibleWalls);
    for (const wall of candidateWalls) {
      const ref = wall.corners;
      if (ref.length < 2) continue;
      const isPriority = !!(this.priorityWallId && wall.id === this.priorityWallId);
      const MAIN_PEN = 0;
      const SUB_PEN = 200;
      const prioBias = isPriority ? -10000 : 0;

      for (let pi = 0; pi < ref.length; pi++) {
        if (this._isHiddenWallCorner(wall, pi)) continue;
        const p = ref[pi];
        const px = this._worldToMousePx(p, mouseS);
        if (px > Defaults.wallSnapPx) continue;
        register(
          { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: -1, edgeIndex: null, t: null, px, wallId: wall.id, wallLine: "main" },
          prioBias + px + MAIN_PEN,
        );
      }
      for (let i = 0; i < ref.length - 1; i++) {
        const a = ref[i], b = ref[i + 1];
        const proj = projectPointToCurvedEdge(mouseW, a, b, (wall as any).bulges?.[i] || 0);
        const px = this._worldToMousePx(proj.q, mouseS);
        if (px > Defaults.wallSnapPx) continue;
        if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
        register(
          { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment: null, hatch: null, pointIndex: null, edgeIndex: i, t: proj.t, px, lineA: a, lineB: b, wallId: wall.id, wallLine: "main" },
          prioBias + 1000 + px + MAIN_PEN,
        );
      }

      if (this.includeWallOffsetSnaps) {
        // Ausgeschlossene Wände bleiben Teil des Heilungs-Kontexts, damit die
        // Fanggeometrie der übrigen Wände exakt der sichtbaren Darstellung folgt.
        const otherVisibleWalls = allVisibleWalls.filter(w => w !== wall && w.corners.length >= 2);
        const healed = this._getHealed(wall, otherVisibleWalls);

        const mainPts = healed.mainCorners;
        for (let pi = 0; pi < mainPts.length; pi++) {
          if (this._isHiddenWallCorner(wall, pi)) continue;
          const p = mainPts[pi];
          const px = this._worldToMousePx(p, mouseS);
          if (px > Defaults.wallSnapPx) continue;
          register(
            { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: -1, edgeIndex: null, t: null, px, wallId: wall.id, wallLine: "main" },
            prioBias + px + MAIN_PEN,
          );
        }
        for (let i = 0; i < mainPts.length - 1; i++) {
          const a = mainPts[i], b = mainPts[i + 1];
          const proj = projectPointToSegment(mouseW, a, b);
          const px = this._worldToMousePx(proj.q, mouseS);
          if (px > Defaults.wallSnapPx) continue;
          if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
          register(
            { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment: null, hatch: null, pointIndex: null, edgeIndex: null, t: proj.t, px, lineA: a, lineB: b, wallId: wall.id, wallLine: "main" },
            prioBias + 1000 + px + MAIN_PEN,
          );
        }

        const subPts = healed.subCorners;
        for (let pi = 0; pi < subPts.length; pi++) {
          if (this._isHiddenWallCorner(wall, pi)) continue;
          const p = subPts[pi];
          const px = this._worldToMousePx(p, mouseS);
          if (px > Defaults.wallSnapPx) continue;
          register(
            { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: pi, edgeIndex: null, t: null, px, wallId: wall.id, wallLine: "sub" },
            prioBias + px + SUB_PEN,
          );
        }
        for (let i = 0; i < subPts.length - 1; i++) {
          const a = subPts[i], b = subPts[i + 1];
          const proj = projectPointToSegment(mouseW, a, b);
          const px = this._worldToMousePx(proj.q, mouseS);
          if (px > Defaults.wallSnapPx) continue;
          if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
          register(
            { type: SnapType.LINE, world: v(proj.q.x, proj.q.y), segment: null, hatch: null, pointIndex: null, edgeIndex: i, t: proj.t, px, lineA: a, lineB: b, wallId: wall.id, wallLine: "sub" },
            prioBias + 1000 + px + SUB_PEN,
          );
        }
      }
    }
  }

  /**
   * Dezente Fangpunkt-Vorschau während Transformationen: sammelt sichtbare
   * Eckpunkte in einem Bildschirm-Radius um die Maus. Bewusst schlank
   * (keine Linien-Projektionen, keine Neuberechnung der Topologie) und
   * per Frame gecacht.
   */
  private _nearbyCache: { key: string; pts: Vec2[] } | null = null;
  nearbySnapPoints(mouseS: Vec2, radiusPx = 140, max = 60): Vec2[] {
    const key = `${Math.round(mouseS.x / 8)}_${Math.round(mouseS.y / 8)}_${radiusPx}`;
    if (this._nearbyCache?.key === key) return this._nearbyCache.pts;
    const pts: Vec2[] = [];
    const push = (p: Vec2 | undefined | null) => {
      if (!p || pts.length >= max) return;
      if (this._worldToMousePx(p, mouseS) > radiusPx) return;
      pts.push(v(p.x, p.y));
    };
    for (const seg of this._segmentsFrontToBack()) { push(seg.a); push(seg.b); }
    for (const hatch of this._hatchesFrontToBack()) for (const p of hatch.points) push(p);
    for (const box of [...this.scene.textBoxes, ...(((this.scene as any).tables as any[]) || [])] as any[]) {
      if (!this.labels.isVisible(box.labelId)) continue;
      for (const c of boxCornersWorld(box)) push(c);
    }
    for (const dim of this.scene.dimensions) {
      if (!this.labels.isVisible(dim.labelId)) continue;
      push(dim.p1); push(dim.p2);
    }
    this._nearbyCache = { key, pts };
    return pts;
  }


  findBestSnap(mouseS: Vec2, mouseW: Vec2, exclusions?: SnapExclusions): Snap | null {
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

    const considerLine = (a: Vec2, b: Vec2, segment: Segment | null, hatch: Hatch | null, edgeIndex?: number | null, bulge?: number) => {
      const proj = projectPointToCurvedEdge(mouseW, a, b, bulge || 0);
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
    const segs = this._segmentsFrontToBack().filter((seg) => !exclusions?.segmentIds?.has(seg.id));
    for (const seg of segs) {
      const movingPoint = exclusions?.segmentPoint?.segmentId === seg.id
        ? exclusions.segmentPoint.pointIndex
        : null;
      if (movingPoint !== 0) considerPoint(seg.a, seg, null, 0);
      if (movingPoint !== 1) considerPoint(seg.b, seg, null, 1);
      if (movingPoint != null) continue;
      // Mittelpunkt-/Teilungs-Snap-Punkte (vom User pro Linie aktivierbar).
      // pointIndex = -1 markiert sie als "interne" Snap-Punkte ohne Vertex-Index,
      // damit sie nicht als echte Endpunkte (für Hub/Auswahl) interpretiert werden.
      const divN = (typeof seg.divisionSnap === "number" && seg.divisionSnap >= 2) ? Math.floor(seg.divisionSnap) : 0;
      if (seg.midpointSnap) {
        considerPoint({ x: (seg.a.x + seg.b.x) * 0.5, y: (seg.a.y + seg.b.y) * 0.5 }, seg, null, -1);
      }
      if (divN >= 2) {
        for (let k = 1; k < divN; k++) {
          const t = k / divN;
          considerPoint({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t }, seg, null, -1);
        }
      }
    }

    // Hatch points (outer + holes)
    const hatches = this._hatchesFrontToBack().filter((hatch) => !exclusions?.hatchIds?.has(hatch.id));
    for (const hatch of hatches) {
      for (let i = 0; i < hatch.points.length; i++) {
        const excludedPoint = exclusions?.hatchPoint;
        if (excludedPoint?.hatchId === hatch.id && excludedPoint.holeIndex == null
            && excludedPoint.pointIndex === i) continue;
        considerPoint(hatch.points[i], null, hatch, i);
      }
      if (hatch.holes) {
        for (let holeIndex = 0; holeIndex < hatch.holes.length; holeIndex++) {
          const loop = hatch.holes[holeIndex];
          if (!loop) continue;
          for (let pointIndex = 0; pointIndex < loop.length; pointIndex++) {
            const excludedPoint = exclusions?.hatchPoint;
            if (excludedPoint?.hatchId === hatch.id && excludedPoint.holeIndex === holeIndex
                && excludedPoint.pointIndex === pointIndex) continue;
            considerPoint(loop[pointIndex], null, null, -1);
          }
        }
      }
    }
    // TextBox- und Tabellen-Ecken (identische Fangpunkt-Infrastruktur)
    for (const box of [...this.scene.textBoxes, ...(((this.scene as any).tables as any[]) || [])] as any[]) {
      if (exclusions?.textBoxIds?.has(box.id)) continue;
      if (!this.labels.isVisible(box.labelId)) continue;
      const corners = boxCornersWorld(box);
      for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
        if (exclusions?.textBoxCorner?.textBoxId === box.id
            && exclusions.textBoxCorner.cornerIndex === cornerIndex) continue;
        considerPoint(corners[cornerIndex], null, null, -1);
      }
    }
    // Dimension endpoints + placement-line endpoints/mid (zum Ausrichten
    // mehrerer Maßketten nebeneinander). Die Maßlinie selbst (d1↔d2) wird
    // weiter unten als Snap-Linie ergänzt.
    for (const dim of this.scene.dimensions) {
      if (exclusions?.dimensionIds?.has(dim.id)) continue;
      if (!this.labels.isVisible(dim.labelId)) continue;
      considerPoint(dim.p1, null, null, -1);
      considerPoint(dim.p2, null, null, -1);
      if ((dim as any).p3) considerPoint((dim as any).p3, null, null, -1);
      try {
        const g = getDimensionGeometry(dim);

        considerPoint(g.d1, null, null, -1);
        considerPoint(g.d2, null, null, -1);
        considerPoint(g.mid, null, null, -1);
      } catch { /* defensive: ungültige Geometrie überspringen */ }
    }
    // Document corners + edge midpoints
    for (const doc of this.scene.documents) {
      if (exclusions?.documentIds?.has(doc.id)) continue;
      if (!this.labels.isVisible(doc.labelId)) continue;
      for (const c of documentCornersWorld(doc)) considerPoint(c, null, null, -1);
      for (const m of documentEdgeMidpointsWorld(doc)) considerPoint(m, null, null, -1);
      considerPoint(documentCenterWorld(doc), null, null, -1);
      for (const a of documentAnchorsWorld(doc)) considerPoint(a, null, null, -1);
    }
    // Freihand-Stroke Endpunkte (nur erster + letzter Punkt)
    for (const s of this.scene.freeStrokes) {
      if (exclusions?.freeStrokeIds?.has(s.id)) continue;
      if (!this.labels.isVisible(s.labelId)) continue;
      if (!s.points || s.points.length < 2) continue;
      considerPoint(s.points[0], null, null, -1);
      considerPoint(s.points[s.points.length - 1], null, null, -1);
    }
    // Segment lines
    for (const seg of segs) {
      if (exclusions?.segmentLineIds?.has(seg.id)) continue;
      considerLine(seg.a, seg.b, seg, null, null, (seg as any).bulge || 0);
    }
    // Dimension placement-line (Maßlinie d1↔d2) als Snap-Linie, damit neue
    // oder verschobene Maßketten exakt auf bestehende Maßlinien gelegt werden
    // können ("nebeneinandersetzen").
    for (const dim of this.scene.dimensions) {
      if (exclusions?.dimensionIds?.has(dim.id)) continue;
      if (!this.labels.isVisible(dim.labelId)) continue;
      try {
        const g = getDimensionGeometry(dim);
        considerLine(g.d1, g.d2, null, null);
      } catch { /* ignore */ }
    }
    this._addWallSnapsTo(mouseS, mouseW, (cand, score) => {
      if (score < bestScore) { bestScore = score; best = cand; }
    }, exclusions?.wallIds);

    // Door / Window endpoints (leftEnd, rightEnd, center) — als freie Snap-Punkte
    // mit doorId-Referenz, damit MeasureTool sie der jeweiligen Tür zuordnen kann.
    for (const door of this.scene.doors) {
      if (exclusions?.doorIds?.has(door.id) || exclusions?.wallIds?.has(door.wallId)) continue;
      if (!this.labels.isVisible(door.labelId)) continue;
      const wall = this.scene.getWallById(door.wallId);
      if (!wall) continue;
      const g = doorGeometry(wall, door);
      if (!g) continue;
      const candidates: Array<{ p: Vec2; ep: "left" | "right" | "center" }> = [
        { p: g.leftEnd, ep: "left" },
        { p: g.rightEnd, ep: "right" },
        { p: g.center, ep: "center" },
      ];
      for (const c of candidates) {
        const px = this._worldToMousePx(c.p, mouseS);
        if (px > Defaults.snapPx) continue;
        if (px < bestScore) {
          bestScore = px;
          best = {
            type: SnapType.POINT, world: v(c.p.x, c.p.y),
            segment: null, hatch: null, pointIndex: -1, edgeIndex: null, t: null, px,
            doorId: door.id, doorEndpoint: c.ep,
          };
        }
      }
    }



    // Hatch edges
    for (const edge of this.scene.getHatchEdges()) {
      if (exclusions?.hatchIds?.has(edge.hatch.id) || exclusions?.hatchEdgeIds?.has(edge.hatch.id)) continue;
      if (!this.labels.isVisible(edge.hatch.labelId)) continue;
      considerLine(edge.a, edge.b, null, edge.hatch, edge.edgeIndex, (edge as any).bulge || 0);
    }
    // Hole edges (Snap-Linien — kein insert-on-snap, da Loops keine "edgeIndex" im Scene-Modell haben)
    for (const hatch of hatches) {
      if (exclusions?.hatchEdgeIds?.has(hatch.id)) continue;
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
        for (const a of documentAnchorsWorld(doc)) considerPoint(a, null, null, -1);
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

    // Papierrahmen (Plandruck) — Blattrand fangbar machen.
    if (this.planFrame) {
      const hw = this.planFrame.widthM / 2;
      const hh = this.planFrame.heightM / 2;
      const corners: Vec2[] = [v(-hw, -hh), v(hw, -hh), v(hw, hh), v(-hw, hh)];
      for (const c of corners) considerPoint(c, null, null, -1);
      considerPoint(v(0, 0), null, null, -1);
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        considerPoint(v((a.x + b.x) / 2, (a.y + b.y) / 2), null, null, -1);
        considerLine(a, b, null, null);
      }
    }

    return this._withGuides(best, mouseS, mouseW);
  }

  /** Globale Hilfslinien (Rechtsklick-Anker) in das Snap-Ergebnis einmischen. */
  _withGuides(best: Snap | null, mouseS: Vec2, mouseW: Vec2): Snap | null {
    const g: any = this.guides ? this.guides.findSnap(mouseS, mouseW, this.camera) : null;
    if (!g) return best;
    if (!best) return g as Snap;
    const rank = (s: any) => s.type === SnapType.GUIDE_POINT ? 0 : s.type === SnapType.POINT ? 1 : s.type === SnapType.GUIDE ? 2 : 3;
    const rb = rank(best), rg = rank(g);
    if (rg < rb) return g as Snap;
    if (rb < rg) return best;
    return (((best as any).px ?? Infinity) <= (g.px ?? Infinity)) ? best : (g as Snap);
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

    const considerLine = (a: Vec2, b: Vec2, segment: Segment | null, hatch: Hatch | null, _edgeIndex?: number | null, bulge?: number) => {
      if (segment && segment.id === excludedSegmentId) return;
      const proj = projectPointToCurvedEdge(mouseW, a, b, bulge || 0);
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
      considerLine(seg.a, seg.b, seg, null, null, (seg as any).bulge || 0);
    }
    for (const edge of this.scene.getHatchEdges()) {
      considerLine(edge.a, edge.b, null, edge.hatch, edge.edgeIndex, (edge as any).bulge || 0);
    }

    this._addWallSnapsTo(mouseS, mouseW, (cand, score) => {
      if (score < bestScore) { bestScore = score; best = cand; }
    });

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

    const considerLine = (a: Vec2, b: Vec2, segment: Segment | null, hatch: Hatch | null, edgeIndex?: number, bulge?: number) => {
      if (hatch && hatch.id === excludedHatchId) return;
      const proj = projectPointToCurvedEdge(mouseW, a, b, bulge || 0);
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
      considerLine(seg.a, seg.b, seg, null, null, (seg as any).bulge || 0);
    }
    for (const edge of this.scene.getHatchEdges()) {
      if (edge.hatch.id === excludedHatchId) continue;
      considerLine(edge.a, edge.b, null, edge.hatch, edge.edgeIndex, (edge as any).bulge || 0);
    }

    this._addWallSnapsTo(mouseS, mouseW, (cand, score) => {
      if (score < bestScore) { bestScore = score; best = cand; }
    });

    return best;
  }

  findNearestLineSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    let best: Snap | null = null;
    let bestPx = Infinity;

    for (const seg of this._segmentsFrontToBack()) {
      const proj = projectPointToCurvedEdge(mouseW, seg.a, seg.b, (seg as any).bulge || 0);
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
      // Linien werden beim Verbinden NICHT mehr automatisch geteilt — neue Linien
      // dürfen sich an bestehende Linien anschließen, ohne diese aufzubrechen.
      // Hatch-Kanten benötigen weiterhin einen echten Polygon-Punkt zum Verbinden.
      if (snap.hatch && snap.edgeIndex != null && snap.t != null) {
        const res = this.scene.insertPointIntoHatchEdge(snap.hatch, snap.edgeIndex, snap.t);
        return v(res.point.x, res.point.y);
      }
      return v(snap.world.x, snap.world.y);
    }
    return v(freePoint.x, freePoint.y);
  }
}
