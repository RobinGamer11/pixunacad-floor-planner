import { describe, it } from "vitest";
import { Wall } from "@/cad/Scene";
import { v, pointInPolygon } from "@/cad/geometry";
import { findEnclosingFace } from "@/cad/hatchFill";
import { unionWallSolids } from "@/cad/wallUnion";
import { WallTopologyGraph } from "@/cad/WallTopologyGraph";

function mk(id: string, c: any[], bulges: number[]) {
  return new Wall({ id, kind: "outer", thicknessM: 0.3, referenceSide: (globalThis as any).__side, corners: c.map((p:any)=>v(p.x,p.y)), labelId: "L1", bulges } as any);
}
describe("fill vs wall", () => {
  for (const side of ["outer","center","inner"] as any[]) for (const b of [-0.2,-0.4, -0.8, 0.2, 0.4, 0.8]) it(`side ${side} bulge ${b}`, () => {
    (globalThis as any).__side = side;
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
    // Grid-Flood vom Raumzentrum über Nicht-Wand-Zellen
    const S=0.05, X0=-3, Y0=-4, NX=Math.round(10/S), NY=Math.round(10/S);
    const key=(i:number,j:number)=>i*10000+j;
    const seen=new Set<number>(); const stack=[[Math.round((2-X0)/S), Math.round((2.0-Y0)/S)]];
    const holes:any[]=[];
    while(stack.length){ const [i,j]=stack.pop()!; if(i<0||j<0||i>NX||j>NY) continue; const k=key(i,j); if(seen.has(k))continue; seen.add(k);
      const p=v(X0+i*S, Y0+j*S); if(inWall(p)) continue;
      if(face && !pointInPolygon(p, face)) { holes.push([+p.x.toFixed(2),+p.y.toFixed(2)]); continue; }
      stack.push([i+1,j],[i-1,j],[i,j+1],[i,j-1]);
    }
    console.log(side, "bulge", b, "face?", !!face, "hole cells", holes.length, holes.slice(0,10));
  });
});
