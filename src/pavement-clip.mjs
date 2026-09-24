import earcut from 'earcut';

export const area=ring=>Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
const bounds=r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];
export const obstacle=(ring,clearance=1e-5)=>({ring,bounds:bounds(ring),clearance});
export function polygonObstacles(rings){
 return rings.flatMap(r=>{const ids=earcut(r.flat());return Array.from({length:ids.length/3},(_,i)=>obstacle(ids.slice(i*3,i*3+3).map(j=>r[j])));});
}
// Partition a convex pad into disjoint convex pieces outside a convex obstacle.
export function subtract(pad,clip,clearance=1e-5){
 const sign=clip.reduce((s,p,i)=>{const q=clip[(i+1)%clip.length];return s+p[0]*q[1]-q[0]*p[1];},0)>0?1:-1;
 let remaining=pad;const result=[];
 for(let i=0;i<clip.length&&remaining.length>=3;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-9)continue;
  const distance=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/length+clearance;
  const split=inside=>{const output=[];for(let j=0;j<remaining.length;j++){const p=remaining[j],q=remaining[(j+1)%remaining.length],dp=distance(p),dq=distance(q),ip=inside?dp>=0:dp<=0,iq=inside?dq>=0:dq<=0;if(ip)output.push(p);if(ip!==iq){const t=dp/(dp-dq);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}return output;};
  const outside=split(false),inside=split(true);if(outside.length>=3&&area(outside)>1e-6)result.push(outside);remaining=inside;
 }
 return result;
}
export function clipPavement(pad,obstacles,minArea=.01){
 const box=bounds(pad);let pieces=[pad];
 for(const o of obstacles){const b=o.bounds,c=o.clearance;if(box[0]>=b[2]+c||box[2]<=b[0]-c||box[1]>=b[3]+c||box[3]<=b[1]-c)continue;
  pieces=pieces.flatMap(p=>{const box=bounds(p);if(box[0]>=b[2]+c||box[2]<=b[0]-c||box[1]>=b[3]+c||box[3]<=b[1]-c)return [p];return subtract(p,o.ring,c);});if(!pieces.length)break;
 }
 return pieces.map(clean).filter(p=>p.length>=3&&area(p)>minArea);
}
function clean(ring){
 const p=[...ring];let changed=true;
 while(changed&&p.length>=3){changed=false;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<1e-7||Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-8){p.splice(i,1);changed=true;break;}}}
 return p;
}
export function roadFaceRings(objects){
 const rings=[];for(const o of objects)for(let i=0;i<o.positions.length;i+=9){const p=o.positions,r=[[p[i],p[i+2]],[p[i+3],p[i+5]],[p[i+6],p[i+8]]];if(area(r)>1e-8)rings.push(r);}return rings;
}
