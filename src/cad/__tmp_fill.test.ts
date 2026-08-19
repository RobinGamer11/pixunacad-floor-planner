import { describe, it } from "vitest";
import { Wall } from "@/cad/Scene";
import { v, pointInPolygon } from "@/cad/geometry";
import { findEnclosingFace } from "@/cad/hatchFill";
import { unionWallSolids } from "@/cad/wallUnion";
import { WallTopologyGraph } from "@/cad/WallTopologyGraph";

function mk(id: string, c: any[], bulges: number[]) {
  return new Wall({ id, kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: c.map((p:any)=>v(p.x,p.y)), labelId: "L1", bulges } as any);
}
describe("fill vs wall", () => {
  for (const b of [-0.4, -0.8, 0.4]) it("bulge " + b, () => {
    const walls = [
      mk("a", [{x:0,y:0},{x:4,y:0}], [b]),
      mk("b", [{x:4,y:0},{x:4,y:3}], [0]),
      mk("c", [{x:4,y:3},{x:0,y:3}], [0]),
      mk("d", [{x:0,y:3},{x:0,y:0}], [0]),
    ];
    const g = new WallTopologyGraph(); g.build(walls as any);
    const scene: any = { segments: [], walls, hatches: [], freeStrokes: [], getWallTopology: () => g };
    const face = findEnclosingFace(scene, v(2, 2.0));
    const multi = unionWallSolids(walls as any, walls as any, g) as any;
    const inWall = (p:any) => multi.some((poly:any) => {
      const rings = poly.map((r:any)=>r.map(([x,y]:any)=>v(x,y)));
      if (!rings[0] || !pointInPolygon(p, rings[0])) return false;
      return !rings.slice(1).some((r:any)=>pointInPolygon(p,r));
    });
    let holes:any[] = [], over:any[] = [];
    for (let x=-2; x<=6; x+=0.1) for (let y=-3; y<=4; y+=0.1) {
      const p = v(+x.toFixed(2), +y.toFixed(2));
      const inFace = face ? pointInPolygon(p, face) : false;
      if (inFace && inWall(p)) over.push([p.x,p.y]);
    }
    console.log("bulge", b, "face?", !!face, "fillInsideWall pts", over.length, over.slice(0,8));
  });
});
