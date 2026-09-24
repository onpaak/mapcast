// Local metric approximation for small blocks, glTF Y-up coordinates.
export function project(lon, lat, origin) {
  const r = Math.PI / 180;
  return [(lon-origin[0])*r*6371008.8*Math.cos(origin[1]*r), -(lat-origin[1])*r*6371008.8];
}
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function triangulate(ring) {
  const p = ring.map(v => [...v]);
  if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p.pop();
  if(p.length < 3) throw new Error('Polygon has fewer than three vertices');
  const area = p.reduce((s,a,i) => { const b=p[(i+1)%p.length]; return s+a[0]*b[1]-b[0]*a[1]; },0);
  if(Math.abs(area)<1e-8) throw new Error('Degenerate polygon');
  if(area<0) p.reverse();
  const pending=p.map((_,i)=>i), triangles=[];
  while(pending.length>3) {
    let found=false;
    for(let k=0;k<pending.length;k++) {
      const a=pending[(k+pending.length-1)%pending.length], b=pending[k], c=pending[(k+1)%pending.length];
      if(cross(p[a],p[b],p[c])<=1e-8) continue;
      const inside=pending.some(i=>i!==a&&i!==b&&i!==c&&cross(p[a],p[b],p[i])>=-1e-8&&cross(p[b],p[c],p[i])>=-1e-8&&cross(p[c],p[a],p[i])>=-1e-8);
      if(inside) continue;
      triangles.push([a,c,b]); pending.splice(k,1); found=true; break;
    }
    if(!found) throw new Error('Unsupported or self-intersecting polygon');
  }
  triangles.push([pending[0],pending[2],pending[1]]);
  return {points:p,triangles};
}
export function extrude(ring,height,base=0) {
  const {points,triangles}=triangulate(ring), positions=[], normals=[];
  function tri(a,b,c) {
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const l=Math.hypot(...n); if(l<1e-8)return;
    positions.push(...a,...b,...c); for(let i=0;i<3;i++) normals.push(...n.map(x=>x/l));
  }
  const at=(i,y)=>[points[i][0],y,points[i][1]];
  for(const [a,b,c] of triangles) {tri(at(a,base+height),at(b,base+height),at(c,base+height)); if(height>0)tri(at(c,base),at(b,base),at(a,base));}
  if(height>0) for(let i=0;i<points.length;i++) {
    const j=(i+1)%points.length;
    tri(at(i,base),at(j,base+height),at(j,base)); tri(at(i,base),at(i,base+height),at(j,base+height));
  }
  return {positions,normals};
}
export function roadSegments(points,width) {
  const meshes=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<0.01)continue;
    const x=-dz/len*width/2,z=dx/len*width/2;
    meshes.push(extrude([[a[0]+x,a[1]+z],[b[0]+x,b[1]+z],[b[0]-x,b[1]-z],[a[0]-x,a[1]-z]],0,0.025));
  }
  return {positions:meshes.flatMap(m=>m.positions),normals:meshes.flatMap(m=>m.normals)};
}

// One joined strip per OSM way. Adjacent sections share the same edge, so bends
// do not stack several independent rectangles on top of each other.
export function roadRibbon(points,width,base=.025) {
  const clean=[];
  for(const point of points)if(!clean.length||Math.hypot(point[0]-clean.at(-1)[0],point[1]-clean.at(-1)[1])>.01)clean.push(point);
  if(clean.length<2)return {positions:[],normals:[]};
  const half=width/2,normals=clean.slice(1).map((point,index)=>{
    const previous=clean[index],dx=point[0]-previous[0],dz=point[1]-previous[1],length=Math.hypot(dx,dz);
    return [-dz/length,dx/length];
  });
  const offsets=clean.map((_,index)=>{
    if(index===0)return normals[0].map(value=>value*half);
    if(index===clean.length-1)return normals.at(-1).map(value=>value*half);
    const before=normals[index-1],after=normals[index],mx=before[0]+after[0],mz=before[1]+after[1],length=Math.hypot(mx,mz);
    if(length<.01)return after.map(value=>value*half);
    const unit=[mx/length,mz/length],denominator=unit[0]*after[0]+unit[1]*after[1];
    if(denominator<.25)return after.map(value=>value*half);
    const scale=Math.min(half*2,half/denominator);
    return unit.map(value=>value*scale);
  });
  const meshes=[];
  for(let index=1;index<clean.length;index++){
    const a=clean[index-1],b=clean[index],oa=offsets[index-1],ob=offsets[index];
    meshes.push(extrude([[a[0]+oa[0],a[1]+oa[1]],[b[0]+ob[0],b[1]+ob[1]],[b[0]-ob[0],b[1]-ob[1]],[a[0]-oa[0],a[1]-oa[1]]],0,base));
  }
  return {positions:meshes.flatMap(mesh=>mesh.positions),normals:meshes.flatMap(mesh=>mesh.normals)};
}
