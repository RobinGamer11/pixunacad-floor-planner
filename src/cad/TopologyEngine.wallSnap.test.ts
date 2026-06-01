import { describe, it, expect, beforeEach } from "vitest";
import { Scene } from "./Scene";
import { Camera } from "./Camera";
import { LabelManager } from "./LabelManager";
import { TopologyEngine } from "./TopologyEngine";
import { v } from "./geometry";
import { computeWallLines } from "./wallGeom";
import { runWallTopologyMaintenance } from "./wallTopologyMaintenance";

/**
 * Snap-Prioritätstests für die kontextabhängige Sub-/Bezugslinien-Wahl beim
 * Wand-Zeichnen. Außerdem ein Cache-Sanity-Check.
 *
 *  - Innenwand zeichnen ↔ Außenwand vorhanden  → Sub (Innenkante) bevorzugt
 *  - Innenwand zeichnen ↔ Innenwand vorhanden  → Bezugslinie bevorzugt
 *  - Außenwand zeichnen ↔ Außenwand vorhanden  → Bezugslinie bevorzugt
 */

function setup() {
  const scene = new Scene();
  const camera = new Camera();
  camera.scale = 100; // 1 m = 100 px
  camera.offsetX = 500;
  camera.offsetY = 500;
  const labels = new LabelManager();
  const topo = new TopologyEngine(scene, camera, labels);
  topo.includeWallOffsetSnaps = true;
  return { scene, camera, labels, topo };
}

/** Hilfsfunktion: Welt-Koordinaten → Bildschirm-Koordinaten via Camera. */
function ws(camera: Camera, p: { x: number; y: number }) {
  return camera.worldToScreen(p.x, p.y);
}

describe("TopologyEngine wall snap priority", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => { env = setup(); });

  it("wall drawing prefers reference line (main) of other walls regardless of kind", () => {
    const { scene, camera, topo } = env;
    const outer = scene.createWall({
      kind: "outer", thicknessM: 0.05, referenceSide: "outer",
      corners: [v(0, 0), v(5, 0)],
    });
    const lines = computeWallLines(outer.corners, outer.thicknessM, outer.referenceSide);
    const refMid = { x: 2.5, y: lines.mainCorners[0].y };
    const subMid = { x: 2.5, y: lines.subCorners[0].y };

    const mouseW = { x: 2.5, y: (refMid.y + subMid.y) / 2 };
    const mouseS = ws(camera, mouseW);
    const snap = topo.findBestSnap(mouseS, mouseW)!;

    expect(snap).toBeTruthy();
    expect(snap.wallId).toBe(outer.id);
    expect(snap.wallLine).toBe("main");
  });

  it("inner wall drawing prefers reference line of other inner walls", () => {
    const { scene, camera, topo } = env;
    const inner = scene.createWall({
      kind: "inner", thicknessM: 0.05, referenceSide: "center",
      corners: [v(0, 0), v(5, 0)],
    });
    const lines = computeWallLines(inner.corners, inner.thicknessM, inner.referenceSide);
    const refMid = { x: 2.5, y: lines.mainCorners[0].y };
    const subMid = { x: 2.5, y: lines.subCorners[0].y };

    const mouseW = { x: 2.5, y: (refMid.y + subMid.y) / 2 };
    const mouseS = ws(camera, mouseW);
    const snap = topo.findBestSnap(mouseS, mouseW)!;

    expect(snap).toBeTruthy();
    expect(snap.wallId).toBe(inner.id);
    expect(snap.wallLine).toBe("main");
  });

  it("outer wall drawing prefers reference line of other outer walls", () => {
    const { scene, camera, topo } = env;
    const outer = scene.createWall({
      kind: "outer", thicknessM: 0.05, referenceSide: "outer",
      corners: [v(0, 0), v(5, 0)],
    });
    const lines = computeWallLines(outer.corners, outer.thicknessM, outer.referenceSide);
    const refMid = { x: 2.5, y: lines.mainCorners[0].y };
    const subMid = { x: 2.5, y: lines.subCorners[0].y };

    const mouseW = { x: 2.5, y: (refMid.y + subMid.y) / 2 };
    const mouseS = ws(camera, mouseW);
    const snap = topo.findBestSnap(mouseS, mouseW)!;

    expect(snap).toBeTruthy();
    expect(snap.wallId).toBe(outer.id);
    expect(snap.wallLine).toBe("main");
  });

  it("heal cache is reused across snap calls and invalidated on wall mutation", () => {
    const { scene, camera, topo } = env;
    scene.createWall({
      kind: "outer", thicknessM: 0.05, referenceSide: "outer",
      corners: [v(0, 0), v(5, 0)],
    });

    const mouseW = { x: 2.5, y: 0.15 };
    const mouseS = ws(camera, mouseW);
    topo.findBestSnap(mouseS, mouseW);
    // @ts-expect-error privater Zugriff für Test
    const hashA = topo._healCacheHash;
    // @ts-expect-error privater Zugriff für Test
    const sizeA = topo._healCache.size;
    expect(sizeA).toBeGreaterThan(0);

    // Zweiter Snap-Call ohne Mutation → Hash bleibt identisch.
    topo.findBestSnap(mouseS, mouseW);
    // @ts-expect-error privater Zugriff für Test
    expect(topo._healCacheHash).toBe(hashA);

    // Wand mutieren → Cache wird beim nächsten Call invalidiert.
    scene.walls[0].corners[1].x = 6;
    topo.findBestSnap(mouseS, mouseW);
    // @ts-expect-error privater Zugriff für Test
    expect(topo._healCacheHash).not.toBe(hashA);
  });

  it("auto-created T-junction host point is hidden and not returned as wall point snap", () => {
    const { scene, camera, topo } = env;
    const host = scene.createWall({
      kind: "outer", thicknessM: 0.3, referenceSide: "outer",
      corners: [v(0, 0), v(5, 0)],
    });
    const branch = scene.createWall({
      kind: "inner", thicknessM: 0.115, referenceSide: "center",
      corners: [v(2.5, 2), v(2.5, 0)],
    });

    runWallTopologyMaintenance(scene, [branch]);
    expect(host.corners.length).toBe(3);
    expect(host.hiddenCornerIndices).toContain(1);

    const mouseW = { x: 2.5, y: 0 };
    const mouseS = ws(camera, mouseW);
    const snap = topo.findBestSnap(mouseS, mouseW)!;

    expect(snap).toBeTruthy();
    expect(snap.wallId).toBe(branch.id);
    expect(snap.wallLine).toBe("main");
  });

  it("sub-line docking stays geometrically fixed when the host wall is moved", () => {
    const { scene } = env;
    const host = scene.createWall({
      kind: "outer", thicknessM: 0.3, referenceSide: "outer",
      corners: [v(0, 0), v(5, 0)],
    });
    const hostLines = computeWallLines(host.corners, host.thicknessM, host.referenceSide);
    const fixedDockPoint = v(2.5, hostLines.subCorners[0].y);
    const docked = scene.createWall({
      kind: "inner", thicknessM: 0.115, referenceSide: "center",
      corners: [v(2.5, 2), fixedDockPoint],
      cornerAnchors: [null, { kind: "subEdge", hostWallId: host.id, hostEdgeIndex: 0, t: 0.5 }],
    });

    host.corners = [v(1, 1), v(6, 1)];
    runWallTopologyMaintenance(scene, [host]);

    expect(docked.corners[1].x).toBeCloseTo(fixedDockPoint.x);
    expect(docked.corners[1].y).toBeCloseTo(fixedDockPoint.y);
  });
});
