import {extrude} from './geometry.mjs';
import {polygonsOverlap} from './spatial.mjs';

const bounds=ring=>[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
export const canopyObstacles=rings=>rings.map(ring=>({ring,bounds:bounds(ring)}));

export function shopCanopy(a,b,out,from,to,base,obstacles){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(!Number.isFinite(base)||base<2.4||to-from<1||length<1e-6)return null;
 const along=[(b[0]-a[0])/length,(b[1]-a[1])/length],point=(x,d)=>[a[0]+along[0]*x+out[0]*d,a[1]+along[1]*x+out[1]*d];
 for(const depth of [.85,.60]){
   const footprint=[point(from,.035),point(to,.035),point(to,depth),point(from,depth)],box=bounds(footprint);
   if(obstacles.some(o=>box[0]<=o.bounds[2]&&box[2]>=o.bounds[0]&&box[1]<=o.bounds[3]&&box[3]>=o.bounds[1]&&polygonsOverlap(footprint,o.ring)))continue;
   return {footprint,depth,mesh:extrude(footprint,.12,base)};
 }
 return null;
}
