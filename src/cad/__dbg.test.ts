import { it } from "vitest";
import { vectorizeRasterBoundary, skeletonize, traceSkeleton } from "./rasterVectorize";
function stroke(a:Uint8Array,w:number,h:number,x0:number,y0:number,x1:number,y1:number,r=1){const steps=Math.ceil(Math.hypot(x1-x0,y1-y0))*2;for(let i=0;i<=steps;i++){const t=i/steps;const cx=Math.round(x0+(x1-x0)*t),cy=Math.round(y0+(y1-y0)*t);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=w||y>=h)continue;a[y*w+x]=255;}}}
it("dbg",()=>{const w=260,h=240;const a=new Uint8Array(w*h);
stroke(a,w,h,10,200,250,200);stroke(a,w,h,10,224,160,8);stroke(a,w,h,250,224,100,8);
const r=vectorizeRasterBoundary(a,16,w,h,0,0,100);
console.log("edges",r.edges.length,"ends",r.openEnds.length);
const bin=new Uint8Array(w*h); for(let i=0;i<bin.length;i++) bin[i]=a[i]>=16?1:0;
const sk=skeletonize(bin,w,h); let cnt=0; for(const x of sk) cnt+=x;
const paths=traceSkeleton(sk,w,h);
const N8=[[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]];
const skm=skeletonize((()=>{const b=new Uint8Array(w*h);for(let i=0;i<b.length;i++)b[i]=a[i]>=16?1:0;return b;})(),w,h);
const onf=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&!!skm[y*w+x];
let nodes=0,tot=0,hist={};
for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!skm[y*w+x])continue;tot++;const p=N8.map(([dx,dy])=>onf(x+dx,y+dy)?1:0);const d=p.reduce((s,v)=>s+v,0);let t=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])t++;const key=d+"/"+t;hist[key]=(hist[key]||0)+1;if(d<=1||t>=3)nodes++;}
console.log("nodes",nodes,"tot",tot,hist);
console.log("skpx",cnt,"paths",paths.length,"lens",paths.map(p=>p.length).slice(0,20));
});
