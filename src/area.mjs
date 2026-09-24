import {validateBounds} from './osm.mjs';

// A selection area: a convex polygon of lon,lat points (the web page draws four), as an
// alternative to a west,south,east,north box. Downloads still use its bounding box; the
// polygon then filters and clips what was downloaded.

const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);

// Accepts "lon,lat lon,lat ..." (spaces or semicolons between points) or [[lon,lat], ...].
// Returns the points counter-clockwise (in lon,lat), without a closing point.
export function validateArea(input){
  const raw=typeof input==='string'?input.trim().split(/[\s;]+/).map(p=>p.split(',').map(v=>v.trim()===''?NaN:Number(v))):input;
  if(!Array.isArray(raw))throw new Error('Area must be a list of lon,lat points');
  let points=raw.map(p=>Array.isArray(p)?p.slice(0,2).map(Number):[NaN,NaN]);
  if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points=points.slice(0,-1);
  if(points.length<3||points.length>12)throw new Error('Area needs 3 to 12 lon,lat points');
  if(points.some(([lon,lat])=>!Number.isFinite(lon)||!Number.isFinite(lat)||lon< -180||lon>180||lat< -85||lat>85))throw new Error('Area points must be valid lon,lat pairs');
  // Convex and simple: every turn goes the same way and the turns add up to one full circle.
  const turns=points.map((p,i)=>cross(points[(i+points.length-1)%points.length],p,points[(i+1)%points.length]));
  if(turns.some(t=>Math.abs(t)<1e-14)||!(turns.every(t=>t>0)||turns.every(t=>t<0)))throw new Error('Area must be a convex shape with no crossing edges');
  const heading=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
  let total=0;
  for(let i=0;i<points.length;i++){
    let d=heading(points[(i+1)%points.length],points[(i+2)%points.length])-heading(points[i],points[(i+1)%points.length]);
    while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;total+=d;
  }
  if(Math.abs(Math.abs(total)-2*Math.PI)>1e-6)throw new Error('Area must be a convex shape with no crossing edges');
  if(turns[0]<0)points.reverse();
  validateBounds(areaBounds(points));
  return points;
}

export function areaBounds(points){
  const lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
  return [Math.min(...lons),Math.min(...lats),Math.max(...lons),Math.max(...lats)];
}

// Signed distance-like value: >= 0 on the inner side of edge p→q of a counter-clockwise polygon.
const side=(p,q,x)=>(q[0]-p[0])*(x[1]-p[1])-(q[1]-p[1])*(x[0]-p[0]);
const edges=area=>area.map((p,i)=>[p,area[(i+1)%area.length]]);

// Cyrus-Beck clipping of a polyline against a convex area. Like clipLine, it keeps the
// breaks where a road leaves and re-enters the area.
export function clipLineToArea(points,area){
  const result=[];let current=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],c=points[i];let t0=0,t1=1,ok=true;
    for(const [p,q] of edges(area)){
      const fa=side(p,q,a),fc=side(p,q,c),rate=fc-fa;
      if(rate===0){if(fa<0){ok=false;break;}continue;}
      const t=-fa/rate;if(rate>0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
    }
    if(!ok||t0>=t1){if(current.length>1)result.push(current);current=[];continue;}
    const at=t=>[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t],start=at(t0),end=at(t1);
    if(current.length&&Math.hypot(current.at(-1)[0]-start[0],current.at(-1)[1]-start[1])<1e-10)current.push(end);
    else {if(current.length>1)result.push(current);current=[start,end];}
  }
  if(current.length>1)result.push(current);return result;
}

// Sutherland-Hodgman clipping of a closed ring against a convex area; returns a closed
// ring, or [] when nothing is left.
export function clipRingToArea(input,area){
  let points=input.slice(0,-1);
  for(const [p,q] of edges(area)){
    const output=[];
    for(let i=0;i<points.length;i++){
      const a=points[(i+points.length-1)%points.length],c=points[i],fa=side(p,q,a),fc=side(p,q,c);
      const cut=()=>{const t=fa/(fa-fc);return [a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t];};
      if(fc>=0){if(fa<0)output.push(cut());output.push(c);}else if(fa>=0)output.push(cut());
    }
    points=output;if(!points.length)break;
  }
  // A ring edge running through an area corner yields that corner twice; drop the repeats.
  points=points.filter((p,i)=>{const q=points[(i+points.length-1)%points.length];return points.length<2||Math.hypot(p[0]-q[0],p[1]-q[1])>1e-12;});
  if(points.length<3)return [];
  points.push([...points[0]]);return points;
}

// Moves every edge of a convex polygon (plan coordinates) outward by `distance`.
export function offsetConvex(points,distance){
  const orientation=Math.sign(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0));
  const normal=(a,b)=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1]);return [orientation*(b[1]-a[1])/l,-orientation*(b[0]-a[0])/l];};
  return points.map((p,i)=>{
    const n1=normal(points[(i+points.length-1)%points.length],p),n2=normal(p,points[(i+1)%points.length]);
    const k=distance/(1+n1[0]*n2[0]+n1[1]*n2[1]);
    return [p[0]+(n1[0]+n2[0])*k,p[1]+(n1[1]+n2[1])*k];
  });
}
