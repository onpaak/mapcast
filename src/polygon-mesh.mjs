import earcut,{deviation} from 'earcut';
export function polygonMesh(rings,height,base=0){
  const normalized=rings.map((ring,index)=>{
    const p=ring.map(v=>[...v]);if(p.length>1&&p[0][0]===p.at(-1)[0]&&p[0][1]===p.at(-1)[1])p.pop();
    if(p.length<3)throw new Error('Invalid polygon ring');
    const area=p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0);
    if(Math.abs(area)<1e-8)throw new Error('Degenerate polygon ring');
    if((index===0&&area<0)||(index>0&&area>0))p.reverse();return p;
  });
  const vertices=[],holes=[];normalized.forEach((p,i)=>{if(i)holes.push(vertices.length/2);vertices.push(...p.flat());});
  const indices=earcut(vertices,holes,2);
  if(!indices.length||deviation(vertices,holes,2,indices)>1e-7)throw new Error('Polygon triangulation area mismatch');
  const positions=[],normals=[];
  function tri(a,b,c){
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);if(len<1e-9)return;
    positions.push(...a,...b,...c);for(let i=0;i<3;i++)normals.push(...n.map(x=>x/len));
  }
  const at=(i,y)=>[vertices[i*2],y,vertices[i*2+1]];
  for(let i=0;i<indices.length;i+=3){
    let [a,b,c]=indices.slice(i,i+3);const p=at(a,0),q=at(b,0),r=at(c,0);
    if((q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0])>0)[b,c]=[c,b];
    tri(at(a,base+height),at(b,base+height),at(c,base+height));if(height>0)tri(at(c,base),at(b,base),at(a,base));
  }
  if(height>0)for(const ring of normalized)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],p=[a[0],base,a[1]],q=[b[0],base,b[1]],r=[b[0],base+height,b[1]],s=[a[0],base+height,a[1]];
    tri(p,r,q);tri(p,s,r);
  }
  return {positions,normals};
}
