import { describe, it, expect } from "vitest";
import { Wall } from "@/cad/Scene";
import { v, pointInPolygon, polygonAreaAbs } from "@/cad/geometry";
import { findEnclosingFace, __debugFaces } from "@/cad/hatchFill";
import { unionWallSolids } from "@/cad/wallUnion";
import { WallTopologyGraph } from "@/cad/WallTopologyGraph";

function mk(id: string, c: any[], bulges: number[]) {
  return new Wall({ id, kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: c.map((p:any)=>v(p.x,p.y)), labelId: "L1", bulges } as any);
}

describe("fill curved", () => {
  it("region follows curve", () => {
    // Raum 4x3, untere Wand nach unten gewölbt (bulge 0.4)
    const walls = [
      mk("a", [{x:0,y:0},{x:4,y:0}], [0.4]),
      mk("b", [{x:4,y:0},{x:4,y:3}], [0]),
      mk("c", [{x:4,y:3},{x:0,y:3}], [0]),
      mk("d", [{x:0,y:3},{x:0,y:0}], [0]),
    ];
    const g = new WallTopologyGraph(); g.build(walls as any);
    const scene: any = { segments: [], walls, hatches: [], freeStrokes: [], getWallTopology: () => g };
    const dbg = (__debugFaces as any)(scene, v(2, 1.5));
    console.log(dbg);
    const face = findEnclosingFace(scene, v(2, 1.5));
    expect(face).toBeTruthy();
    console.log("area", polygonAreaAbs(face!), "pts", face!.length);
    // Testpunkt tief in der Wölbung, sollte NICHT im Wandkörper liegen und gefüllt sein
    const probe = v(2, -0.3);
    const multi = unionWallSolids(walls as any, walls as any, g);
    let inWall = false;
    for (const poly of multi as any) {
      const rings = poly.map((r: any) => r.map(([x,y]: any) => v(x,y)));
      if (rings[0] && pointInPolygon(probe, rings[0])) inWall = true;
    }
    console.log("probe inWall", inWall, "inFace", pointInPolygon(probe, face!));
  });
});
