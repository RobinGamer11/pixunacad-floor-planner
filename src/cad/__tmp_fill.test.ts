import { describe, it } from "vitest";
import { Wall } from "@/cad/Scene";
import { v, polygonAreaAbs, pointInPolygon } from "@/cad/geometry";
import { __debugFaces } from "@/cad/hatchFill";
import { WallTopologyGraph } from "@/cad/WallTopologyGraph";

function mk(id: string, c: any[], bulges: number[]) {
  return new Wall({ id, kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: c.map((p:any)=>v(p.x,p.y)), labelId: "L1", bulges } as any);
}
describe("fill curved", () => {
  for (const b of [0, 0.4, -0.4]) it("bulge " + b, () => {
    const walls = [
      mk("a", [{x:0,y:0},{x:4,y:0}], [b]),
      mk("b", [{x:4,y:0},{x:4,y:3}], [0]),
      mk("c", [{x:4,y:3},{x:0,y:3}], [0]),
      mk("d", [{x:0,y:3},{x:0,y:0}], [0]),
    ];
    const g = new WallTopologyGraph(); g.build(walls as any);
    const scene: any = { segments: [], walls, hatches: [], freeStrokes: [], getWallTopology: () => g };
    const click = v(2, 2.0);
    const faces = (__debugFaces as any)(scene, click) as any[][];
    const hit = faces.filter(l => pointInPolygon(click, l)).sort((a,b)=>polygonAreaAbs(a)-polygonAreaAbs(b));
    console.log("bulge", b, "hits", hit.map(l=>polygonAreaAbs(l).toFixed(3)));
    const best = hit[0];
    if (best) {
      const minY = Math.min(...best.map(p=>p.y));
      console.log(" minY", minY.toFixed(3), "pts", best.length);
    }
  });
});
