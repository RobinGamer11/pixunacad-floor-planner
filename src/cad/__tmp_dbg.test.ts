import { describe, it } from "vitest";
import { Wall } from "@/cad/Scene";
import { v, pointInPolygon, polygonAreaAbs, polygonSignedArea } from "@/cad/geometry";
import { WallTopologyGraph } from "@/cad/WallTopologyGraph";
import { buildHealedWallSolidRing } from "@/cad/wallSolid";
function mk(id: string, c: any[], bulges: number[]) {
  return new Wall({ id, kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: c.map((p:any)=>v(p.x,p.y)), labelId: "L1", bulges } as any);
}
describe("dbg", () => { it("ring 0.8", () => {
  const walls = [
    mk("a", [{x:0,y:0},{x:4,y:0}], [0.8]),
    mk("b", [{x:4,y:0},{x:4,y:3}], [0]),
    mk("c", [{x:4,y:3},{x:0,y:3}], [0]),
    mk("d", [{x:0,y:3},{x:0,y:0}], [0]),
  ];
  const g = new WallTopologyGraph(); g.build(walls as any);
  for (const w of walls) {
    const r = buildHealedWallSolidRing(w as any, walls as any, g);
    console.log(w.id, r.length, JSON.stringify(r.slice(0,6).map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)])), "area", polygonAreaAbs(r).toFixed(2));
  }
}); });
