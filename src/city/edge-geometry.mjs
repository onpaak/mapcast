import {extrude} from '../geometry.mjs';
import {edgeOutward} from '../entrance-access.mjs';
import {BIN} from './materials.mjs';

// Geometry helpers for one facade edge, in edge-local coordinates: x along the edge from a,
// y up, depth d outward along n (negative is into the wall). Everything goes to emit(mesh, bin).
export function edgeGeometry({ring,lengths,edge,a,u,n,emit}){
  const len=lengths[edge];
  const at=(x,y,d)=>[a[0]+u[0]*x+n[0]*d,y,a[1]+u[1]*x+n[1]*d];

  // Closed box from l..r along the edge, between depths inner and outer. At the building
  // corners the ends are mitred so neighbouring edges meet without gaps.
  const box=(l,r,bottom,top,outer=0,inner=-.24,bin=BIN.wall)=>{
    if(r-l<.001||top-bottom<.001)return;
    const plan=(x,d)=>{
      let shift=0;
      if(Math.abs(x)<1e-8||Math.abs(x-len)<1e-8){
        const adjacent=edgeOutward(ring,Math.abs(x)<1e-8?(edge+lengths.length-1)%lengths.length:(edge+1)%lengths.length),den=u[0]*adjacent[0]+u[1]*adjacent[1];
        if(Math.abs(den)>1e-5){const t=d*(1-n[0]*adjacent[0]-n[1]*adjacent[1])/den;if(Math.abs(t)<=Math.abs(d)*4)shift=t;}
      }
      return [a[0]+u[0]*(x+shift)+n[0]*d,a[1]+u[1]*(x+shift)+n[1]*d];
    };
    emit(extrude([plan(l,inner),plan(r,inner),plan(r,outer),plan(l,outer)],top-bottom,bottom),bin);
  };

  // Single outward-facing face at depth d: flush walls, trim and opaque glass.
  const panel=(l,r,bottom,top,depth,bin)=>{
    if(r-l<.001||top-bottom<.001)return;
    const points=[at(l,bottom,depth),at(r,bottom,depth),at(r,top,depth),at(l,top,depth)];
    const order=(-u[1]*n[0]+u[0]*n[1])>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
    emit({positions:order.flatMap(i=>points[i]),normals:order.flatMap(()=>[n[0],0,n[1]])},bin);
  };

  // Quad from four (x, y, d) corners; winding follows the given normal.
  const quad=(corners,normal,bin)=>{
    const p=corners.map(([x,y,d])=>at(x,y,d)),e1=p[1].map((v,i)=>v-p[0][i]),e2=p[2].map((v,i)=>v-p[0][i]);
    const facing=(e1[1]*e2[2]-e1[2]*e2[1])*normal[0]+(e1[2]*e2[0]-e1[0]*e2[2])*normal[1]+(e1[0]*e2[1]-e1[1]*e2[0])*normal[2];
    const order=facing>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
    emit({positions:order.flatMap(i=>p[i]),normals:order.flatMap(()=>normal)},bin);
  };
  const sillFace=(l,r,y,depth,normalY=1,bin=BIN.wall)=>{if(r-l>.001)quad([[l,y,0],[r,y,0],[r,y,depth],[l,y,depth]],[0,normalY,0],bin);};
  // Walls are flush faces; an opening only needs its four reveal faces back to the glass.
  // bin colours the sides and head; sillBin the sill.
  const reveal=(l,r,bottom,top,depth,{sill=true,bin=BIN.wall,sillBin=BIN.wall}={})=>{
    if(r-l<.001||top-bottom<.001)return;
    quad([[l,bottom,0],[l,bottom,depth],[l,top,depth],[l,top,0]],[u[0],0,u[1]],bin);
    quad([[r,bottom,0],[r,bottom,depth],[r,top,depth],[r,top,0]],[-u[0],0,-u[1]],bin);
    if(sill)sillFace(l,r,bottom,depth,1,sillBin);
    sillFace(l,r,top,depth,-1,bin);
  };
  return {box,panel,quad,sillFace,reveal};
}
