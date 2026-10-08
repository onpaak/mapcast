import {extrude,project} from './geometry.mjs';
import {insidePolygon,distanceToSegment} from './spatial.mjs';
import {canopyObstacles} from './shop-canopy.mjs';
import {surfaceUV} from './concrete-materials.mjs';

// Mapped street furniture: litter bins, bicycle racks and metal railings. Positions and lines
// come from OpenStreetMap; the look is the reviewed kit of cast concrete and painted steel. Nothing is added
// where the map has nothing, and anything that would stand on a road, in a building, across
// the kerb or on another prop is left out and recorded.

const GATES=['gate','entrance','lift_gate','swing_gate','opening','kissing_gate'];
const RAILINGS=['fence','railing','guard_rail','handrail'];
// Walls, hedges and kerbs are not modelled (no solid walls, no plants), and neither are bollards.
export function furnitureKind(tags={},geometry='Point'){
  if(geometry==='Point'){
    if(tags.amenity==='waste_basket')return 'litter-bin';
    if(tags.amenity==='bicycle_parking')return 'bicycle-rack';
    if(GATES.includes(tags.barrier))return 'gate';
    return null;
  }
  if(geometry==='LineString'){
    if(RAILINGS.includes(tags.barrier))return 'railing';
    return null;
  }
  if(geometry==='Polygon'&&tags.amenity==='bicycle_parking')return 'bicycle-parking';
  return null;
}

// Furniture features projected to scene metres (x east, z south), for placeStreetFurniture.
export function furnitureSources(features,origin){
  const sources=[],p=c=>project(c[0],c[1],origin);
  for(const f of features){
    const g=f.geometry,kind=furnitureKind(f.properties,g?.type);if(!kind)continue;
    const tags=f.properties,id=String(f.id);
    if(g.type==='Point')sources.push({id,kind,tags,point:p(g.coordinates)});
    else if(g.type==='LineString')sources.push({id,kind,tags,line:g.coordinates.map(p)});
    else sources.push({id,kind,tags,ring:g.coordinates[0].map(p)});
  }
  return sources;
}

// ---- Low-poly models, built in local metres: x across, y up, front towards +z. ----

// Collects triangles per material; placed instances are rotated by yaw (front → (sin, cos)).
function meshSet(){
  const meshes=new Map();
  const add=(material,tris)=>{if(!meshes.has(material))meshes.set(material,{positions:[],normals:[]});const m=meshes.get(material);for(const t of tris){m.positions.push(...t.p.flat());m.normals.push(...t.n.flat());}};
  return {meshes,add};
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
// Two triangles for a quad, wound so they face `normal`.
function quad(corners,normal){
  const [a,b,c,d]=corners,facing=cross(sub(b,a),sub(c,a)).reduce((s,v,i)=>s+v*normal[i],0)>0;
  const order=facing?[[a,b,c],[a,c,d]]:[[a,c,b],[a,d,c]];
  return order.map(p=>({p,n:[normal,normal,normal]}));
}
// Box centred at c with size s, optionally tilted about its local x axis.
function box([cx,cy,cz],[w,h,d],tilt=0){
  const ct=Math.cos(tilt),st=Math.sin(tilt),r=([x,y,z])=>[x,y*ct-z*st,y*st+z*ct];
  const v=(x,y,z)=>{const q=r([x*w/2,y*h/2,z*d/2]);return [cx+q[0],cy+q[1],cz+q[2]];};
  const faces=[[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],
    [[0,1,0],[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],
    [[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]]];
  return faces.flatMap(([n,cs])=>quad(cs.map(c=>v(...c)),r(n)));
}
// Six-sided tube along a polyline in the x-y plane (bicycle rack hoops).
function tube(points,radius){
  const rings=points.map((p,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],t=sub(b,a),len=Math.hypot(...t),tan=t.map(v=>v/len);
    const side=cross(tan,[0,0,1]);
    return Array.from({length:6},(_,j)=>{const ang=Math.PI*j/3,n=[side[0]*Math.cos(ang),side[1]*Math.cos(ang),Math.sin(ang)];return {p:p.map((v,k)=>v+n[k]*radius),n};});
  });
  const tris=[];
  for(let i=1;i<rings.length;i++)for(let j=0;j<6;j++){
    const a=rings[i-1][j],b=rings[i-1][(j+1)%6],c=rings[i][(j+1)%6],d=rings[i][j],mid=[a,b,c,d].reduce((s,q)=>s.map((v,k)=>v+q.n[k]/4),[0,0,0]);
    for(const t of [[a,b,c],[a,c,d]]){const f=cross(sub(t[1].p,t[0].p),sub(t[2].p,t[0].p)).reduce((s,v,k)=>s+v*mid[k],0)>0?t:[t[0],t[2],t[1]];tris.push({p:f.map(q=>q.p),n:f.map(q=>q.n)});}
  }
  return tris;
}

// Each model: parts as [materialKey, triangles]; footprint as local [x0,z0,x1,z1].
const MODELS={
  'litter-bin':()=>({parts:[
    ['teal',box([0,.415,0],[.416,.67,.396])],
    ...[-.25,.25].map(x=>['concrete',box([x,.43,0],[.08,.86,.45])]),
    ['damp',box([0,.065,-.015],[.56,.13,.46])],['steel',box([0,.042,0],[.41,.084,.39])],
    ...[-.205,.205].map(x=>['teal',box([x,.82,0],[.032,.19,.39])]),
    ['steel',box([0,.785,.16],[.37,.03,.035])],['teal',box([0,.81,-.18],[.39,.16,.026])],
    ['concrete',box([0,.945,0],[.58,.07,.49])],['steel',box([0,.918,.18],[.4,.021,.04])],
    ['indicator',box([.14,.69,.205],[.065,.016,.008])]
  ],footprint:[-.3,-.26,.3,.26]}),
  'bicycle-rack':()=>{
    const points=[[-.4,.02,0],[-.4,.66,0]];
    for(let i=1;i<=4;i++){const a=Math.PI-i*Math.PI/8;points.push([-.25+.15*Math.cos(a),.66+.15*Math.sin(a),0]);}
    points.push([.25,.81,0]);
    for(let i=1;i<=4;i++){const a=Math.PI/2-i*Math.PI/8;points.push([.25+.15*Math.cos(a),.66+.15*Math.sin(a),0]);}
    points.push([.4,.02,0]);
    return {parts:[['zinc',tube(points,.027)],...[-.4,.4].map(x=>['zinc',box([x,.012,0],[.12,.024,.13])]),['rust',box([-.4,.18,0],[.057,.09,.055])],['teal',box([.4,.56,0],[.057,.1,.055])]],footprint:[-.47,-.08,.47,.08]};
  }
};

// Local → world: rotate by yaw about y (front +z → (sin yaw, cos yaw)), lift to base, move to p.
function placeParts(set,parts,[x,z],base,yaw){
  const c=Math.cos(yaw),s=Math.sin(yaw),tp=([px,py,pz])=>[px*c+pz*s+x,py+base,-px*s+pz*c+z],tn=([nx,ny,nz])=>[nx*c+nz*s,ny,-nx*s+nz*c];
  for(const [material,tris] of parts)set.add(material,tris.map(t=>({p:t.p.map(tp),n:t.n.map(tn)})));
}
const footprintAt=([x0,z0,x1,z1],[x,z],yaw)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([px,pz])=>[px*c+pz*s+x,-px*s+pz*c+z]);};

// Front direction: the mapped `direction` (degrees from north) or, failing that, towards the
// nearest mapped road or path, square to it.
function facing(point,tags,paths){
  const deg=Number(tags.direction);
  if(tags.direction!==undefined&&Number.isFinite(deg))return {yaw:Math.atan2(Math.sin(deg*Math.PI/180),-Math.cos(deg*Math.PI/180)),source:'OSM direction'};
  let best=null;
  for(const path of paths)for(let i=1;i<path.length;i++){const d=distanceToSegment(point,path[i-1],path[i]);if(!best||d<best.d)best={d,a:path[i-1],b:path[i]};}
  if(!best)return {yaw:0,source:'default'};
  const t=sub(best.b,best.a),len=Math.hypot(...t),n=[-t[1]/len,t[0]/len],side=(point[0]-best.a[0])*n[0]+(point[1]-best.a[1])*n[1];
  const front=side>0?n.map(v=>-v):n;
  return {yaw:Math.atan2(front[0],front[1]),source:'inferred from nearest mapped path'};
}

// Places every mapped piece; returns scene objects grouped by kind and material, plus records.
export function placeStreetFurniture(sources,{street,materials,paths}){
  const records=[],sets=new Map(),setOf=kind=>{if(!sets.has(kind))sets.set(kind,{...meshSet(),ids:new Set()});return sets.get(kind);};
  // A footprint must sit fully on the pavement or fully off it, clear of roads, buildings and props.
  const fit=(footprint)=>{const base=street.baseAt(footprint);if(base===undefined)return {reason:'crosses the kerb'};if(!street.fits(footprint))return {reason:'overlaps a road, building or another prop'};return {base};};
  const claim=footprint=>street.propBlocks.push(...canopyObstacles([footprint]));
  const skipped=(source,reason)=>records.push({sourceId:source.id,kind:source.kind,status:'skipped',reason});

  function placeOne(source,kind,point,yaw,orientationSource,extra={}){
    const model=MODELS[kind](),footprint=footprintAt(model.footprint,point,yaw);
    const {base,reason}=extra.inside&&!footprint.every(q=>insidePolygon(q,extra.inside))?{reason:'outside the mapped parking area'}:fit(footprint);
    if(reason)return {reason};
    const set=setOf(kind);placeParts(set,model.parts,point,base,yaw);set.ids.add(source.id);claim(footprint);
    return {record:{position:point,base,yaw,orientationSource}};
  }

  for(const source of sources){
    const {kind,tags}=source;
    if(kind==='gate'||kind==='railing')continue;
    if(tags.indoor==='yes'||tags.location==='underground'||Number(tags.level??0)!==0){skipped(source,'indoor or not at ground level');continue;}
    if(['litter-bin','bicycle-rack'].includes(kind)){
      const {yaw,source:orientationSource}=facing(source.point,tags,paths),placed=placeOne(source,kind,source.point,yaw,orientationSource);
      if(placed.reason)skipped(source,placed.reason);else records.push({sourceId:source.id,kind,status:'generated',...placed.record});
    }else if(kind==='bicycle-parking'){
      // Stands in a row along the area's longest side: capacity / 2 (default 2), at least 0.9 m apart.
      const ring=source.ring,corners=ring.slice(0,-1),center=corners.reduce((s,p)=>[s[0]+p[0]/corners.length,s[1]+p[1]/corners.length],[0,0]);
      const edge=ring.slice(1).map((b,i)=>({a:ring[i],b,len:Math.hypot(b[0]-ring[i][0],b[1]-ring[i][1])})).sort((x,y)=>y.len-x.len)[0];
      const u=[(edge.b[0]-edge.a[0])/edge.len,(edge.b[1]-edge.a[1])/edge.len],spans=corners.map(p=>(p[0]-center[0])*u[0]+(p[1]-center[1])*u[1]);
      const low=Math.min(...spans)+.6,high=Math.max(...spans)-.6,count=Math.max(1,Math.min(Math.floor((Number(tags.capacity)||2)/2),Math.floor(Math.max(0,high-low)/.9)+1));
      let placed=0;
      for(let j=0;j<count;j++){const s=count===1?(low+high)/2:low+(high-low)*j/(count-1),r=placeOne(source,'bicycle-rack',[center[0]+u[0]*s,center[1]+u[1]*s],Math.atan2(-u[0],-u[1]),'square to the parking area',{inside:ring});if(!r.reason)placed++;}
      if(placed)records.push({sourceId:source.id,kind,status:'generated',racks:placed,quantityPolicy:'capacity / 2 stands, limited by the area and 0.9 m spacing'});else skipped(source,'no rack fits inside the area clear of roads and buildings');
    }
  }
  const railings=placeRailings(sources,street,records);
  const objects=[];
  for(const [kind,set] of sets)for(const [key,mesh] of set.meshes)objects.push({name:`StreetFurniture_${kind}_${key}`,...surfaceUV(mesh,[0,0],1.7),material:materials[key],extras:{sceneModule:'StreetFurniture',sourceIds:[...set.ids],appearanceSource:'procedural-interpretation'}});
  for(const o of railings.objects(materials))objects.push(o);
  return {objects,records};
}

// Metal railings on a low concrete plinth along mapped fence, railing and guard-rail lines.
// Mapped gates leave a clear opening; stretches over a carriageway are left out.
function placeRailings(sources,street,records){
  const gates=sources.filter(s=>s.kind==='gate'),frame=meshSet(),bars={positions:[],normals:[],texcoords:[]},ids=new Set(),usedGates=new Set();
  for(const source of sources.filter(s=>s.kind==='railing')){
    const {tags,line}=source;
    if(tags.indoor==='yes'||Number(tags.level??0)!==0){records.push({sourceId:source.id,kind:'railing',status:'skipped',reason:'indoor or not at ground level'});continue;}
    const tagged=Number.parseFloat(tags.height),height=Number.isFinite(tagged)&&tagged>.4&&tagged<4?tagged:tags.barrier==='fence'?1.47:tags.barrier==='guard_rail'?.8:1.05;
    // Arc length along the line, then the stretches to build: minus gates and roadway.
    const arcs=[0];for(let i=1;i<line.length;i++)arcs.push(arcs[i-1]+Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]));
    const total=arcs.at(-1);if(total<.5)continue;
    const at=s=>{let i=1;while(i<line.length-1&&arcs[i]<s)i++;const t=(s-arcs[i-1])/((arcs[i]-arcs[i-1])||1);return [line[i-1][0]+(line[i][0]-line[i-1][0])*t,line[i-1][1]+(line[i][1]-line[i-1][1])*t];};
    const cuts=[];let openings=0;
    for(const gate of gates){let best={d:Infinity,s:0};for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],len=arcs[i]-arcs[i-1];if(!len)continue;const t=Math.max(0,Math.min(1,((gate.point[0]-a[0])*(b[0]-a[0])+(gate.point[1]-a[1])*(b[1]-a[1]))/(len*len))),d=Math.hypot(a[0]+(b[0]-a[0])*t-gate.point[0],a[1]+(b[1]-a[1])*t-gate.point[1]);if(d<best.d)best={d,s:arcs[i-1]+t*len};}
      if(best.d<=.25){const w=Number.parseFloat(gate.tags.width)||1.2;cuts.push([best.s-w/2,best.s+w/2]);openings++;usedGates.add(gate);}}
    for(let s=0;s<total;s+=.5)if(street.onCarriageway(at(Math.min(s+.25,total))))cuts.push([s,s+.5]);
    cuts.sort((x,y)=>x[0]-y[0]);const runs=[];let cursor=0;
    for(const [a,b] of cuts){if(a>cursor+.3)runs.push([cursor,a]);cursor=Math.max(cursor,b);}
    if(total>cursor+.3)runs.push([cursor,total]);
    let built=0;
    for(const [start,end] of runs){
      const ps=[at(start),...line.filter((_,i)=>arcs[i]>start+1e-6&&arcs[i]<end-1e-6),at(end)];
      railing(frame,bars,ps,height);built+=end-start;
    }
    if(built>0){ids.add(source.id);records.push({sourceId:source.id,kind:'railing',status:'generated',barrier:tags.barrier,length:+built.toFixed(1),height,heightSource:Number.isFinite(tagged)?'OSM height':'default for '+tags.barrier,openings,leftOut:+(total-built).toFixed(1)});}
    else records.push({sourceId:source.id,kind:'railing',status:'skipped',reason:'the whole line runs over a carriageway or through gates'});
  }
  // Gates only open a railing; their leaves are not modelled.
  for(const gate of gates)records.push(usedGates.has(gate)?{sourceId:gate.id,kind:'gate',status:'generated',representation:'clear opening in the railing; gate leaf not modelled'}:{sourceId:gate.id,kind:'gate',status:'skipped',reason:'not on a mapped railing; gate leaves are not modelled'});
  return {objects:materials=>{
    const out=[];
    for(const [key,mesh] of frame.meshes)out.push({name:`StreetFurniture_railing_${key}`,...surfaceUV(mesh,[0,0],1.7),material:materials[key],extras:{sceneModule:'StreetFurniture',sourceIds:[...ids],appearanceSource:'procedural-interpretation'}});
    if(bars.positions.length)out.push({name:'StreetFurniture_railing_bars',...bars,material:materials.bars,extras:{sceneModule:'StreetFurniture',sourceIds:[...ids],appearanceSource:'procedural-interpretation'}});
    return out;
  }};
}

// One railing polyline: mitred plinth and cap, posts at most 2.6 m apart, two rails and an
// alpha-cut panel of bars (a bar every 0.155 m) between them.
function railing(frame,bars,ps,height){
  const normals=ps.slice(1).map((b,i)=>{const a=ps[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return [-(b[1]-a[1])/len,(b[0]-a[0])/len];});
  const sides=width=>ps.map((p,i)=>{const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)],sum=[a[0]+b[0],a[1]+b[1]],len=Math.hypot(...sum)||1,n=sum.map(v=>v/len),d=Math.max(.35,n[0]*b[0]+n[1]*b[1]),m=Math.min(width/2/d,width*1.5);return [[p[0]+n[0]*m,p[1]+n[1]*m],[p[0]-n[0]*m,p[1]-n[1]*m]];});
  const ribbon=(width,bottom,h,material)=>{const e=sides(width);for(let i=1;i<ps.length;i++){const mesh=extrude([e[i-1][0],e[i][0],e[i][1],e[i-1][1]],h,bottom),tris=[];for(let k=0;k<mesh.positions.length;k+=9)tris.push({p:[0,3,6].map(o=>mesh.positions.slice(k+o,k+o+3)),n:[0,3,6].map(o=>mesh.normals.slice(k+o,k+o+3))});frame.add(material,tris);}};
  ribbon(.32,0,.22,'damp');ribbon(.34,.22,.055,'concrete');
  const posts=new Set();
  for(let i=1;i<ps.length;i++){
    const a=ps[i-1],b=ps[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    // Rails run along local z, so the yaw points local +z down the segment.
    for(const y of [.46,height-.18])placeParts(frame,[['steel',box([0,y,0],[.034,.044,len])]],mid,0,yaw);
    const sections=Math.max(1,Math.ceil(len/2.6));
    for(let j=0;j<=sections;j++){const t=j/sections,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],key=p.map(v=>v.toFixed(2)).join();if(posts.has(key))continue;posts.add(key);placeParts(frame,[['steel',box([0,(.275+height)/2,0],[.055,height-.275,.055])]],p,0,yaw);}
    // Bars: one double-sided quad on the centre line, the texture repeating every 0.155 m.
    const lo=.31,hi=height-.09,n=normals[i-1],u=len/.155,corners=[[a[0],lo,a[1]],[b[0],lo,b[1]],[b[0],hi,b[1]],[a[0],hi,a[1]]],uvs=[[0,1],[u,1],[u,0],[0,0]];
    const facingN=[n[0],0,n[1]],order=cross(sub(corners[1],corners[0]),sub(corners[2],corners[0])).reduce((s,v,k)=>s+v*facingN[k],0)>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
    for(const k of order){bars.positions.push(...corners[k]);bars.normals.push(...facingN);bars.texcoords.push(...uvs[k]);}
  }
}
