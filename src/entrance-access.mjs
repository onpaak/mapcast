import {extrude} from './geometry.mjs';
import {insidePolygon,polygonsOverlap,strip} from './spatial.mjs';

const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
// Sidewalk pads are convex quads. Merge their exact line coverage, including seams.
export function sidewalkCovers(a,b,pads){
 const v=[b[0]-a[0],b[1]-a[1]],square=v[0]*v[0]+v[1]*v[1],intervals=[];
 if(square<1e-12)return pads.some(p=>insidePolygon(a,p));
 for(const pad of pads){
   const cuts=[];if(insidePolygon(a,pad))cuts.push(0);if(insidePolygon(b,pad))cuts.push(1);
   for(let i=0;i<pad.length;i++){
     const p=pad[i],q=pad[(i+1)%pad.length],w=[q[0]-p[0],q[1]-p[1]],d=[p[0]-a[0],p[1]-a[1]],den=cross(v,w);
     if(Math.abs(den)<1e-10){if(Math.abs(cross(d,v))<1e-9)for(const point of [p,q]){const t=((point[0]-a[0])*v[0]+(point[1]-a[1])*v[1])/square;if(t>=0&&t<=1)cuts.push(t);}continue;}
     const t=cross(d,w)/den,s=cross(d,v)/den;if(t>=0&&t<=1&&s>=0&&s<=1)cuts.push(t);
   }
   if(cuts.length>=2)intervals.push([Math.min(...cuts),Math.max(...cuts)]);
 }
 intervals.sort((a,b)=>a[0]-b[0]);let covered=0;
 for(const [lo,hi] of intervals){if(lo>covered+1e-8)return false;covered=Math.max(covered,hi);if(covered>=1-1e-8)return true;}
 return false;
}

const boundsCache=new WeakMap();
function bounds(ring){if(!boundsCache.has(ring))boundsCache.set(ring,[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))]);return boundsCache.get(ring);}
function overlaps(a,b){const x=bounds(a),y=bounds(b);return x[0]<=y[2]&&x[2]>=y[0]&&x[1]<=y[3]&&x[3]>=y[1]&&polygonsOverlap(a,b);}

export function edgeOutward(ring,edge){
 const a=ring[edge],b=ring[edge+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/length,(b[1]-a[1])/length];let n=[-u[1],u[0]];
 if(insidePolygon([(a[0]+b[0])/2+n[0]*.05,(a[1]+b[1])/2+n[1]*.05],ring))n=n.map(v=>-v);
 return n;
}

// Short straight connectors only. Existing sidewalks own their entire surface.
export function entranceAccess(ring,edge,range,pads,obstacles,roadRings){
 const a=ring[edge],b=ring[edge+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/length,(b[1]-a[1])/length],n=edgeOutward(ring,edge),center=(range[0]+range[1])/2;
 const start=[a[0]+u[0]*center+n[0]*.035,a[1]+u[1]*center+n[1]*.035],width=Math.min(1.35,range[1]-range[0]);
 const across=(t,side)=>[start[0]+n[0]*t+u[0]*side*width/2,start[1]+n[1]*t+u[1]*side*width/2];
 const localPads=pads.filter(p=>{const b=bounds(p);return b[0]<=start[0]+10&&b[2]>=start[0]-10&&b[1]<=start[1]+10&&b[3]>=start[1]-10;});
 if(sidewalkCovers(across(0,-1),across(0,1),localPads))return {reason:'already-on-sidewalk'};
 const hits=[];let reason='no-sidewalk-ahead';
 for(const pad of pads)for(let i=0;i<pad.length;i++){
   const p=pad[i],q=pad[(i+1)%pad.length],v=[q[0]-p[0],q[1]-p[1]],delta=[p[0]-start[0],p[1]-start[1]],cross=(x,y)=>x[0]*y[1]-x[1]*y[0],den=cross(n,v);
   if(Math.abs(den)<1e-8)continue;
   const t=cross(delta,v)/den,s=cross(delta,n)/den;
   if(t>0&&s>=0&&s<=1){if(t<.8)reason='gap-too-short-for-ramp';else if(t>8&&reason==='no-sidewalk-ahead')reason='sidewalk-too-far';else if(t<=8)hits.push({t,pad});}
 }
 hits.sort((a,b)=>a.t-b.t);
 let firstFailure;
 for(const {t} of hits){
   if(!sidewalkCovers(across(t+.03,-1),across(t+.03,1),localPads)){firstFailure??='landing-not-fully-paved';continue;}
   const end=[start[0]+n[0]*(t-.015),start[1]+n[1]*(t-.015)],footprint=strip(start,end,width);
   if(obstacles.some(p=>overlaps(footprint,p))){firstFailure??='blocked-by-building-or-access';continue;}
   if(roadRings.some(p=>overlaps(footprint,p))){firstFailure??='would-cross-carriageway';continue;}
   if(localPads.some(p=>overlaps(footprint,p))){firstFailure??='would-overlap-sidewalk';continue;}
   const mesh=extrude(footprint,0,.02);
   for(let i=0;i<mesh.positions.length;i+=3){const d=(mesh.positions[i]-start[0])*n[0]+(mesh.positions[i+2]-start[1])*n[1];mesh.positions[i+1]=.02+.155*d/(t-.015);}
   const slope=.155/(t-.015),norm=[-n[0]*slope,1,-n[1]*slope],size=Math.hypot(...norm);mesh.normals=mesh.normals.map((_,i)=>norm[i%3]/size);
   return {mesh,footprint,length:t,width,reason:'connected'};
 }
 return {reason:firstFailure??reason};
}
