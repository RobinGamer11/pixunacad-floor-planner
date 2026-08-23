import { it } from "vitest";
import { vectorizeRasterBoundary } from "./rasterVectorize";
function stroke(a:Uint8Array,w:number,h:number,x0:number,y0:number,x1:number,y1:number,r=1){const steps=Math.ceil(Math.hypot(x1-x0,y1-y0))*2;for(let i=0;i<=steps;i++){const t=i/steps;const cx=Math.round(x0+(x1-x0)*t),cy=Math.round(y0+(y1-y0)*t);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=w||y>=h)continue;a[y*w+x]=255;}}}
it("dbg",()=>{const w=260,h=240;const a=new Uint8Array(w*h);
stroke(a,w,h,10,200,250,200);stroke(a,w,h,10,224,160,8);stroke(a,w,h,250,224,100,8);
const r=vectorizeRasterBoundary(a,16,w,h,0,0,100);
console.log("edges",r.edges.length,"ends",r.openEnds.length);
});
