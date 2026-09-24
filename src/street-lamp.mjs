// Curved-arm street light of 1970s concrete estates: concrete foot, tapered octagonal steel pole,
// an arm bending out over the carriageway and a flat "cobra head" luminaire.
// Built in a local frame (origin at the pole base, +x toward the road, y up) and
// placed per instance by translation plus a yaw about y.
const SIDES=8;
export const lampLightOffset=[1.8,7.3,0];

function frustum(mesh,a,b,ra,rb,{capTop=false}={}){
 const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d),dir=d.map(v=>v/len);
 // The pole and arm lie in the x-y plane, so z is always perpendicular to the axis.
 const p1=[0,0,1],p2=[dir[1]*p1[2]-dir[2]*p1[1],dir[2]*p1[0]-dir[0]*p1[2],dir[0]*p1[1]-dir[1]*p1[0]];
 const ring=(c,r,k)=>{const t=k/SIDES*Math.PI*2;return c.map((v,i)=>v+r*(Math.cos(t)*p1[i]+Math.sin(t)*p2[i]));};
 const tri=(p,q,s)=>{const e1=q.map((v,i)=>v-p[i]),e2=s.map((v,i)=>v-p[i]),n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],l=Math.hypot(...n);if(l<1e-9)return;mesh.positions.push(...p,...q,...s);for(let i=0;i<3;i++)mesh.normals.push(...n.map(v=>v/l));};
 for(let k=0;k<SIDES;k++){const a0=ring(a,ra,k),a1=ring(a,ra,k+1),b0=ring(b,rb,k),b1=ring(b,rb,k+1);tri(a0,b0,b1);tri(a0,b1,a1);}
 if(capTop)for(let k=0;k<SIDES;k++)tri(b,ring(b,rb,k+1),ring(b,rb,k));
}

// Quad from four corners with the given outward normal; winding follows the normal.
function quad(mesh,corners,normal){
 const [p,q,s]=corners,e1=q.map((v,i)=>v-p[i]),e2=s.map((v,i)=>v-p[i]);
 const facing=(e1[1]*e2[2]-e1[2]*e2[1])*normal[0]+(e1[2]*e2[0]-e1[0]*e2[2])*normal[1]+(e1[0]*e2[1]-e1[1]*e2[0])*normal[2];
 for(const i of facing>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]){mesh.positions.push(...corners[i]);mesh.normals.push(...normal);}
}

export function streetLampMeshes(){
 const body={positions:[],normals:[]},lens={positions:[],normals:[]};
 frustum(body,[0,0,0],[0,.45,0],.2,.18,{capTop:true});
 frustum(body,[0,.45,0],[0,6.9,0],.1,.055);
 // Arm: quarter bend of radius .6, then a slightly rising straight run to the head.
 const bend=[180,150,120,90].map(deg=>{const t=deg*Math.PI/180;return [.6+.6*Math.cos(t),6.9+.6*Math.sin(t),0];});
 for(let i=0;i<bend.length-1;i++)frustum(body,bend[i],bend[i+1],.045,.045);
 frustum(body,bend.at(-1),[1.55,7.56,0],.045,.04);
 // Cobra head: tapered housing, open underside filled by the glowing lens.
 const back={x:1.45,y0:7.46,y1:7.63,z:.12},front={x:2.15,y0:7.44,y1:7.53,z:.19};
 const v=(end,y,side)=>[end.x,y,end.z*side];
 quad(body,[v(back,back.y1,-1),v(front,front.y1,-1),v(front,front.y1,1),v(back,back.y1,1)],[0,1,0]);
 quad(body,[v(back,back.y0,-1),v(back,back.y0,1),v(back,back.y1,1),v(back,back.y1,-1)],[-1,0,0]);
 quad(body,[v(front,front.y0,-1),v(front,front.y0,1),v(front,front.y1,1),v(front,front.y1,-1)],[1,0,0]);
 for(const side of [-1,1])quad(body,[v(back,back.y0,side),v(front,front.y0,side),v(front,front.y1,side),v(back,back.y1,side)],[0,0,side]);
 quad(lens,[[1.52,7.44,-.13],[2.1,7.43,-.17],[2.1,7.43,.17],[1.52,7.44,.13]],[0,-1,0]);
 return {body,lens};
}

// World-space copy of a local mesh for one instance.
export function placeLamp(mesh,origin,yaw){
 const c=Math.cos(yaw),s=Math.sin(yaw),out={positions:[],normals:[]};
 for(let i=0;i<mesh.positions.length;i+=3){
  const [x,y,z]=mesh.positions.slice(i,i+3),[nx,ny,nz]=mesh.normals.slice(i,i+3);
  out.positions.push(origin[0]+x*c+z*s,origin[1]+y,origin[2]-x*s+z*c);
  out.normals.push(nx*c+nz*s,ny,-nx*s+nz*c);
 }
 return out;
}
// Yaw that turns local +x toward the given plan direction.
export const lampYaw=([tx,tz])=>Math.atan2(-tz,tx);
