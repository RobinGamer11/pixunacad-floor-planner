import { expect, it } from "vitest";
import { applyGenericTilt } from "./geometryDerivation";
import { boundaryRings } from "./tiltBoundary";
import { frameForEdge, genericVertex, resolveGenericTilt } from "./tiltGeometry";
import { spatialFeatures } from "./manipulationSnap";
import type { Derived3D } from "./geometryDerivation";
it("marked lifted wall edge has the actual sloping mesh endpoints, including on a different selected edge",()=>{
  const points=[{x:0,y:0},{x:5,y:0},{x:5,y:.3},{x:0,y:.3}];
  const flat:Derived3D[]=[{type:"prism",source:"wall",sourceId:"w",sheetId:"s",footprint:points,holes:[],z0:2,z1:5,color:"#ffffff"}];
  const tilt={edgeIndex:1,a:points[1],b:points[2],count:4,angleDeg:25,mode:"lift" as const};
  const f=resolveGenericTilt(tilt,points,2)?.frame;if(!f)throw new Error("frame");
  const ring=boundaryRings(flat,points,p=>genericVertex(p.x,p.y,p.z,f,tilt,3));
  const derived=spatialFeatures(applyGenericTilt({tilt3D:tilt},flat,2));
  expect(ring).toBeDefined();if(!ring)return;
  expect(Math.abs(ring.top[0].z-ring.top[1].z)).toBeGreaterThan(1);
  for(const p of ring.top)expect(derived.points.some(q=>Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)<1e-5)).toBe(true);
  expect(frameForEdge({points},0,0,2)?.frame?.edgeIndex).toBe(0);
});