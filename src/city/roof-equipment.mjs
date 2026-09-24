import {insidePolygon,polygonsOverlap,distanceToSegment} from '../spatial.mjs';
import {stableSeed} from '../architecture.mjs';
import {BIN} from './materials.mjs';

// Rooftop clutter for the skyline: water tanks, plant rooms, condenser pairs and antennas.
// A few low boxes and prisms per roof, no bottom faces, only existing material bins.

// Closed-top prism over a convex plan polygon: side walls plus a fan-triangulated top.
function prism(points,bottom,top){
  const positions=[],normals=[],c=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  const tri=(a,b,d,outward)=>{
    const u=b.map((v,i)=>v-a[i]),v=d.map((v,i)=>v-a[i]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(n[0]*outward[0]+n[1]*outward[1]+n[2]*outward[2]<0){[b,d]=[d,b];n=n.map(x=>-x);}
    const l=Math.hypot(...n);if(l<1e-8)return;
    positions.push(...a,...b,...d);for(let i=0;i<3;i++)normals.push(...n.map(x=>x/l));
  };
  points.forEach((p,i)=>{
    const q=points[(i+1)%points.length],out=[(p[0]+q[0])/2-c[0],0,(p[1]+q[1])/2-c[1]];
    tri([p[0],bottom,p[1]],[q[0],bottom,q[1]],[q[0],top,q[1]],out);
    tri([p[0],bottom,p[1]],[q[0],top,q[1]],[p[0],top,p[1]],out);
  });
  for(let i=1;i<points.length-1;i++)tri([points[0][0],top,points[0][1]],[points[i][0],top,points[i][1]],[points[i+1][0],top,points[i+1][1]],[0,1,0]);
  return {positions,normals};
}

// Plan helpers in a frame at `at`, rotated to the roof's main direction u (v is its normal).
const frame=(at,u)=>(x,z)=>[at[0]+u[0]*x-u[1]*z,at[1]+u[1]*x+u[0]*z];
const rect=(to,x0,z0,x1,z1)=>[to(x0,z0),to(x1,z0),to(x1,z1),to(x0,z1)];
const polygon=(to,r,sides)=>Array.from({length:sides},(_,i)=>to(r*Math.cos((i+.5)*2*Math.PI/sides),r*Math.sin((i+.5)*2*Math.PI/sides)));

// Each kind: plan size (for placement) and a builder emitting its parts. `roof` is the roof level.
const KINDS={
  'water-tank':{size:[2.4,2.4],build:(to,roof,emit)=>{
    emit(prism(rect(to,-1.2,-1.2,1.2,1.2),roof,roof+.35),BIN.base);
    emit(prism(polygon(to,1.05,8),roof+.35,roof+2.35),BIN.metal);
  }},
  'plant-room':{size:[3.2,2.2],build:(to,roof,emit,seed)=>{
    const h=1.7+(seed%3)*.25;
    emit(prism(rect(to,-1.6,-1.1,1.6,1.1),roof,roof+h),BIN.wall);
    emit(prism(rect(to,-.9,1.1,.9,1.14),roof+.3,roof+h-.4),BIN.metal);
  }},
  condensers:{size:[2.6,1.1],build:(to,roof,emit)=>{
    for(const x of [-.65,.65])emit(prism(rect(to,x-.55,-.45,x+.55,.45),roof,roof+.85),BIN.metal);
  }},
  // Vertical elements only: a cabinet, a mast with a thinner whip on top, and a shorter
  // second mast. No crossbars, which read as a cross against the sky.
  antenna:{size:[1.2,1],build:(to,roof,emit,seed)=>{
    const h=3.5+(seed%4)*1.2;
    emit(prism(rect(to,-.3,-.25,.3,.25),roof,roof+.55),BIN.metal);
    emit(prism(rect(to,-.07,-.07,.07,.07),roof+.55,roof+h),BIN.metal);
    emit(prism(rect(to,-.03,-.03,.03,.03),roof+h,roof+h+1.4),BIN.metal);
    emit(prism(rect(to,.4,-.05,.5,.05),roof,roof+h*.5),BIN.metal);
  }}
};

// Places 0-6 items on a flat roof of at least three storeys. Items stay clear of the
// parapet, courtyards, the stair core, rooftop signs and billboards, and each other.
export function placeRoofEquipment(city,building,out,core){
  const {id,ring,holes,height,lengths}=building;
  // Special shapes (churches, tanks, towers) keep a clean silhouette.
  if(building.family==='simple-mass'||height<9)return;
  const points=ring.slice(0,-1),area=Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  // Roughly one item per 80 m² of roof, from 60 m² up to six.
  const count=area<60?0:Math.min(6,Math.max(1,Math.floor(area/80)));if(!count)return;

  // Align with the longest facade so boxes sit square to the building.
  const edge=lengths.indexOf(Math.max(...lengths)),a=ring[edge],b=ring[edge+1],u=[(b[0]-a[0])/lengths[edge],(b[1]-a[1])/lengths[edge]];
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),min=[Math.min(...xs),Math.min(...zs)],max=[Math.max(...xs),Math.max(...zs)];
  const grow=(shape,m)=>{const c=shape.reduce((s,p)=>[s[0]+p[0]/shape.length,s[1]+p[1]/shape.length],[0,0]);return shape.map(p=>{const d=Math.hypot(p[0]-c[0],p[1]-c[1])||1;return [p[0]+(p[0]-c[0])/d*m,p[1]+(p[1]-c[1])/d*m];});};
  const blocks=[
    ...(core?[grow(core,.6)]:[]),
    ...city.state.billboards.filter(s=>s.sourceId===id).map(s=>grow(s.footprint,.8)),
    ...city.state.rooftopSigns.filter(s=>s.sourceId===id).map(s=>grow(s.footprint,.8))
  ];
  const clear=p=>insidePolygon(p,ring)&&!holes.some(h=>insidePolygon(p,h))&&ring.slice(1).every((q,i)=>distanceToSegment(p,ring[i],q)>.7)&&holes.every(h=>h.slice(1).every((q,i)=>distanceToSegment(p,h[i],q)>.7));

  const corners=[...points,...holes.flatMap(h=>h.slice(0,-1))];
  const kinds=height>=20?['water-tank','plant-room','condensers','antenna']:['water-tank','plant-room','condensers'];
  for(let item=0;item<count;item++){
    const seed=stableSeed(`${id}:roof-kit:${item}`),kind=kinds[seed%kinds.length],[w,d]=KINDS[kind].size;
    // A few seeded tries across the roof's bounding box.
    for(let attempt=0;attempt<10;attempt++){
      const r=stableSeed(`${id}:roof-kit:${item}:${attempt}`);
      const at=[min[0]+(max[0]-min[0])*((r%1000)/1000),min[1]+(max[1]-min[1])*((Math.floor(r/1000)%1000)/1000)];
      const to=frame(at,u),footprint=rect(to,-w/2,-d/2,w/2,d/2);
      // Corners clear of the parapet, and no roof or courtyard corner poking into the box.
      if(!footprint.every(clear)||corners.some(p=>insidePolygon(p,footprint))||blocks.some(block=>polygonsOverlap(footprint,block)))continue;
      KINDS[kind].build(to,height,out.emit,seed);
      blocks.push(grow(footprint,.6));
      city.state.rooftopEquipment.push({sourceId:id,kind,footprint});
      break;
    }
  }
}
