import { describe, expect, it } from "vitest";
import { Scene } from "./Scene";
import { arcFromBulge, bulgedCurvePoints, dist, splitBulgedEdge, v } from "./geometry";
import { WallTopologyGraph } from "./WallTopologyGraph";
import { unionWallSolids } from "./wallUnion";
import { runWallTopologyMaintenance } from "./wallTopologyMaintenance";

describe("curved wall geometry", () => {
  it("keeps exact endpoints and endpoint tangency on a curved reference line", () => {
    const a = v(0, 0);
    const b = v(5, 0);
    const points = bulgedCurvePoints(a, b, 0.25, 48);
    expect(dist(points[0], a)).toBeLessThan(1e-10);
    expect(dist(points[points.length - 1], b)).toBeLessThan(1e-10);
  });

  it("unites a curved and straight wall at a shared endpoint without a gap", () => {
    const scene = new Scene();
    scene.createWall({
      kind: "outer", thicknessM: 0.3, referenceSide: "center",
      corners: [v(0, 0), v(5, 0)], bulges: [0.25],
    });
    scene.createWall({
      kind: "outer", thicknessM: 0.3, referenceSide: "center",
      corners: [v(5, 0), v(10, 1)],
    });

    const result = unionWallSolids(scene.walls, scene.walls, scene.getWallTopology());
    expect(result).toHaveLength(1);
  });

  it("splits a curved wall into two exact, connected arcs", () => {
    const scene = new Scene();
    const wall = scene.createWall({
      kind: "outer", thicknessM: 0.3, referenceSide: "center",
      corners: [v(0, 0), v(10, 0)], bulges: [0.25],
      priority: 275, patternId: "mauerwerk", patternScale: 1.7, patternAlignToWall: true,
    });
    const arc = arcFromBulge(wall.corners[0], wall.corners[1], wall.bulges[0]);
    expect(arc).toBeTruthy();
    if (!arc) return;
    const midAngle = arc.angA + arc.sweep * 0.5;
    const mid = v(
      arc.center.x + Math.cos(midAngle) * arc.radius,
      arc.center.y + Math.sin(midAngle) * arc.radius,
    );
    const split = scene.splitWallAt(wall, mid);
    expect(split).toBeTruthy();
    if (!split) return;
    const [left, right] = split;
    expect(dist(left.corners[left.corners.length - 1], right.corners[0])).toBeLessThan(1e-10);
    expect(left.priority).toBe(275);
    expect(right.patternId).toBe("mauerwerk");
    expect(right.patternScale).toBeCloseTo(1.7);
    expect(left.bulges[0]).not.toBe(0);
    expect(right.bulges[0]).not.toBe(0);

    const originalCut = splitBulgedEdge(v(0, 0), v(10, 0), 0.25, mid);
    expect(left.bulges[0]).toBeCloseTo(originalCut.bulgeA, 10);
    expect(right.bulges[0]).toBeCloseTo(originalCut.bulgeB, 10);
    expect(unionWallSolids(scene.walls, scene.walls, scene.getWallTopology())).toHaveLength(1);
  });

  it("recognizes and preserves a T-junction on the actual curved edge", () => {
    const scene = new Scene();
    const host = scene.createWall({
      kind: "outer", thicknessM: 0.3, referenceSide: "center",
      corners: [v(0, 0), v(10, 0)], bulges: [0.25],
    });
    const curve = bulgedCurvePoints(host.corners[0], host.corners[1], host.bulges[0], 48);
    const hit = curve[Math.floor(curve.length / 2)];
    const branch = scene.createWall({
      kind: "inner", thicknessM: 0.115, referenceSide: "center",
      corners: [v(hit.x, hit.y + 2), v(hit.x, hit.y)],
    });

    const graph = new WallTopologyGraph();
    graph.build(scene.walls);
    const node = graph.getEndNode(branch.id);
    expect(node?.incidents.some(i => i.wallId === host.id && i.kind === "tjunction")).toBe(true);

    runWallTopologyMaintenance(scene, [branch]);
    expect(host.corners).toHaveLength(3);
    expect(host.bulges).toHaveLength(2);
    expect(host.bulges[0]).not.toBe(0);
    expect(host.bulges[1]).not.toBe(0);
  });
});