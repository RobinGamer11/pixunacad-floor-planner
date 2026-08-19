import { describe, it } from "vitest";
import { Wall } from "@/cad/Scene";
import { v, pointInPolygon, polygonAreaAbs } from "@/cad/geometry";
import { WallTopologyGraph } from "@/cad/WallTopologyGraph";
import { __debugFaces } from "@/cad/hatchFill";
function mk(id: string, c: any[], bulges: number[], side="outer") {
  return new Wall({ id, kind: "outer", thicknessM: 0.3, referenceSide: side, corners: c.map((p:any)=>v(p.x,p.y)), labelId: "L1", bulges } as any);
}
describe("dbg", () => { it("faces 0.8", () => {
  const b=0.8, side="outer";
  const walls = [mk("a",[{x:0,y:0},{x:4,y:0}],[b],side),mk("b",[{x:4,y:0},{x:4,y:3}],[0],side),mk("c",[{x:4,y:3},{x:0,y:3}],[0],side),mk("d",[{x:0,y:3},{x:0,y:0}],[0],side)];
  const g = new WallTopologyGraph(); g.build(walls as any);
  const scene: any = { segments: [], walls, hatches: [], freeStrokes: [], getWallTopology: () => g };
  const faces = (__debugFaces as any)(scene, v(2,2.5)) as any[][];
  console.log("nfaces", faces.length, faces.map(f=>polygonAreaAbs(f).toFixed(2)).join(","));
  const big=faces.sort((a,b)=>polygonAreaAbs(b)-polygonAreaAbs(a))[0];
  console.log(JSON.stringify(big.map((q:any)=>[+q.x.toFixed(2),+q.y.toFixed(2)])));
  console.log("containing", faces.filter(f=>pointInPolygon(v(2,2.5),f)).map(f=>polygonAreaAbs(f).toFixed(2)));
}); });
