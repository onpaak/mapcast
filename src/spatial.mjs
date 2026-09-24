import {triangulate} from './geometry.mjs';

export function distanceToSegment(p,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],q=dx*dx+dz*dz;
  if(q<1e-12)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/q));
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);
}
export function insidePolygon(p,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];if(distanceToSegment(p,a,b)<1e-7)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersects(a,b,c,d){
  if([distanceToSegment(a,c,d),distanceToSegment(b,c,d),distanceToSegment(c,a,b),distanceToSegment(d,a,b)].some(v=>v<1e-7))return true;
  return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
}
export function polygonsOverlap(a,b){
  if(a.some(p=>insidePolygon(p,b))||b.some(p=>insidePolygon(p,a)))return true;
  return a.some((p,i)=>b.some((q,j)=>intersects(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));
}
export function strip(a,b,width){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-8)return null;
  const x=-(b[1]-a[1])/len*width/2,z=(b[0]-a[0])/len*width/2;
  return [[a[0]+x,a[1]+z],[b[0]+x,b[1]+z],[b[0]-x,b[1]-z],[a[0]-x,a[1]-z]];
}
export function blocked(p,rings,clearance=0){
  return rings.some(r=>insidePolygon(p,r)||r.some((a,i)=>distanceToSegment(p,a,r[(i+1)%r.length])<clearance));
}
// A point inside the polygon: its centroid, or the centre of its largest triangle when concave.
export function interiorPoint(ring){
  const points=ring.slice(0,-1),c=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  if(insidePolygon(c,ring))return c;
  const {points:p,triangles}=triangulate(ring),area=([a,b,d])=>Math.abs((p[b][0]-p[a][0])*(p[d][1]-p[a][1])-(p[d][0]-p[a][0])*(p[b][1]-p[a][1]));
  const t=triangles.reduce((best,tri)=>area(tri)>area(best)?tri:best);
  return [(p[t[0]][0]+p[t[1]][0]+p[t[2]][0])/3,(p[t[0]][1]+p[t[1]][1]+p[t[2]][1])/3];
}
