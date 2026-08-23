import { it } from "vitest";
import { findEnclosingFaceFromEdges, type RawEdge } from "./hatchFill";
import { vectorizeRasterBoundary } from "./rasterVectorize";
const seg=(ax,ay,bx,by)=>({a:{x:ax,y:ay},b:{x:bx,y:by}});
function stroke(a,w,h,x0,y0,x1,y1,r=1){const steps=Math.ceil(Math.hypot(x1-x0,y1-y0))*2;for(let i=0;i<=steps;i++){const t=i/steps;const cx=Math.round(x0+(x1-x0)*t),cy=Math.round(y0+(y1-y0)*t);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=w||y>=h)continue;a[y*w+x]=255;}}}
it("dbg",()=>{const w=300,h=250;const alpha=new Uint8Array(w*h);stroke(alpha,w,h,10,200,290,200);
const {edges}=vectorizeRasterBoundary(alpha,16,w,h,0,0,100);
const all=[...edges,seg(0.1,2.24,1.6,0.08),seg(2.5,2.24,1.0,0.08),seg(0.0,2.35,3.0,2.35)];
const f=findEnclosingFaceFromEdges(all,{x:1.3,y:1.6});
console.log("raster",JSON.stringify(edges));console.log("face",JSON.stringify(f));});
