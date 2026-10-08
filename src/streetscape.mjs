import {extrude,roadRibbon} from './geometry.mjs';
import {strip,polygonsOverlap,insidePolygon,distanceToSegment} from './spatial.mjs';
import {facadeDetails} from './facade-details.mjs';
import {polygonObstacles,obstacle,clipPavement,roadFaceRings} from './pavement-clip.mjs';
function merge(meshes){return {positions:meshes.flatMap(m=>m.positions),normals:meshes.flatMap(m=>m.normals)};}
function pyramid(center,base,y,height){
  const [x,z]=center,h=base/2,p=[[x-h,y,z-h],[x+h,y,z-h],[x+h,y,z+h],[x-h,y,z+h]],tip=[x,y+height,z],positions=[],normals=[];
  const tri=(a,b,c)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);positions.push(...a,...b,...c);for(let i=0;i<3;i++)normals.push(...n.map(q=>q/l));};
  tri(p[0],p[1],tip);tri(p[1],p[2],tip);tri(p[2],p[3],tip);tri(p[3],p[0],tip);return {positions,normals};
}
export function sidewalks(segments,footprints,material,roadFaces=[]){
  const objects=[],pads=[];
  // Pavement starts right at the carriageway edge: road strips and the resolved road surfaces
  // (junctions, bends) clip it exactly, so no strip of bare ground shows along the kerb.
  const roads=segments.map(s=>strip(s.a,s.b,s.width));
  const obstacles=[...polygonObstacles(footprints),...roads.filter(Boolean).map(r=>obstacle(r)),...roadFaces.map(r=>obstacle(r))];
  const occupied=[];
  for(const [index,s] of segments.entries()){
    const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=Math.hypot(dx,dz);if(len<1)continue;
    const ux=dx/len,uz=dz/len,meshes=[];
    for(const side of [-1,1]){
      // Clip the whole straight run, avoiding artificial two-metre slab seams.
      {
        const d=0,end=len,offset=side*(s.width/2+1);
        const a=[s.a[0]+ux*d-uz*offset,s.a[1]+uz*d+ux*offset],b=[s.a[0]+ux*end-uz*offset,s.a[1]+uz*end+ux*offset];
        const ring=strip(a,b,2);
        const pieces=clipPavement(ring,[...obstacles,...occupied]);
        for(const piece of pieces){meshes.push(extrude(piece,.15,.025));pads.push(piece);occupied.push(obstacle(piece,0));}
      }
    }
    if(meshes.length)objects.push({name:`Sidewalk_${index}`,...merge(meshes),material,extras:{width:2,height:.15}});
  }
  // Join only two-arm bends. Multi-arm intersections need separate curb geometry.
  const endpoints=new Map();
  for(const s of segments)for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){
    const key=p.map(v=>v.toFixed(4)).join(',');if(!endpoints.has(key))endpoints.set(key,[]);
    endpoints.get(key).push({p,q,width:s.width});
  }
  for(const arms of endpoints.values()){
    if(arms.length!==2)continue;
    const center=arms[0].p,dirs=arms.map(a=>{const length=Math.hypot(a.q[0]-center[0],a.q[1]-center[1]);return {length,u:[(a.q[0]-center[0])/length,(a.q[1]-center[1])/length]};});
    if(dirs.some(d=>d.length<1))continue;
    const dot=dirs[0].u[0]*dirs[1].u[0]+dirs[0].u[1]*dirs[1].u[1];
    const widthChange=Math.abs(arms[0].width-arms[1].width)>.01;
    if(widthChange){
      // A short shoulder on the narrow approach joins the offset sidewalks.
      // Restrict this to straight, modest width changes; no guessed intersection pads.
      if(dot>-.9999||Math.abs(arms[0].width-arms[1].width)>4)continue;
      const index=arms[0].width<arms[1].width?0:1,d=dirs[index],length=Math.min(2,d.length),end=d.u.map((v,i)=>center[i]+v*length);
      const ring=strip(center,end,Math.max(...arms.map(a=>a.width))+4),meshes=[];
      for(const piece of clipPavement(ring,[...obstacles,...occupied])){meshes.push(extrude(piece,.15,.025));pads.push(piece);occupied.push(obstacle(piece,0));}
      if(meshes.length)objects.push({name:`Sidewalk_Transition_${objects.length}`,...merge(meshes),material,extras:{kind:'sidewalk-width-transition',height:.15}});
      continue;
    }
    if(dot<-.9999||dot>.5)continue;
    const ends=dirs.map(d=>d.u.map((v,i)=>center[i]+v*Math.min(4,d.length)));
    const candidates=roadFaceRings([roadRibbon([ends[0],center,ends[1]],arms[0].width+4)]),meshes=[];
    for(const ring of candidates)for(const piece of clipPavement(ring,[...obstacles,...occupied])){
      meshes.push(extrude(piece,.15,.025));pads.push(piece);occupied.push(obstacle(piece,0));
    }
    if(meshes.length)objects.push({name:`Sidewalk_Bend_${objects.length}`,...merge(meshes),material,extras:{width:2,height:.15,kind:'connected-sidewalk-bend'}});
  }
  return {objects,pads};
}
export function sidewalkCorners(junctions,segments,footprints,material){
  const objects=[],pads=[],roadRings=segments.map(s=>strip(s.a,s.b,s.width+.25)).filter(Boolean);
  for(const junction of junctions){
    const {center,radius}=junction.extras,meshes=[];
    for(let i=0;i<8;i++){
      const angle=Math.PI/4*i+Math.PI/8,distance=radius+2.8,c=[center[0]+Math.cos(angle)*distance,center[1]+Math.sin(angle)*distance],size=1.55;
      const ring=[[c[0]-size/2,c[1]-size/2],[c[0]+size/2,c[1]-size/2],[c[0]+size/2,c[1]+size/2],[c[0]-size/2,c[1]+size/2]];
      if(footprints.some(f=>polygonsOverlap(ring,f))||roadRings.some(r=>polygonsOverlap(ring,r)))continue;
      meshes.push(extrude(ring,.15,.025));pads.push(ring);
    }
    if(meshes.length)objects.push({name:`SidewalkCorner_${junction.name}`,...merge(meshes),material,extras:{kind:'inferred-sidewalk-corner',junction:junction.name}});
  }
  return {objects,pads};
}
// Vertical panel lies just outside an edge; its winding faces away from the footprint.
function panel(a,b,out,height){
  const points=[[a[0]+out[0]*.025,.18,a[1]+out[1]*.025],[b[0]+out[0]*.025,.18,b[1]+out[1]*.025],[b[0]+out[0]*.025,height,b[1]+out[1]*.025],[a[0]+out[0]*.025,height,a[1]+out[1]*.025]];
  const positions=[],normals=[],texcoords=[],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const uvs=[[0,1],[length/6,1],[length/6,0],[0,0]];
  const u=[b[0]-a[0],0,b[1]-a[1]],n=[-u[2],0,u[0]];
  const tris=n[0]*out[0]+n[2]*out[1]>0?[[0,1,2],[0,2,3]]:[[0,2,1],[0,3,2]];
  for(const ids of tris)for(const i of ids){positions.push(...points[i]);normals.push(out[0],0,out[1]);texcoords.push(...uvs[i]);}
  return {positions,normals,texcoords};
}
function facadeRectangle(a,b,out,from,to,bottom,top,depth=.04){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
  const left=[a[0]+ux*from+out[0]*depth,a[1]+uz*from+out[1]*depth],right=[a[0]+ux*to+out[0]*depth,a[1]+uz*to+out[1]*depth];
  const points=[[left[0],bottom,left[1]],[right[0],bottom,right[1]],[right[0],top,right[1]],[left[0],top,left[1]]],positions=[],normals=[];
  const edge=[right[0]-left[0],0,right[1]-left[1]],normal=[-edge[2],0,edge[0]],tris=normal[0]*out[0]+normal[2]*out[1]>0?[[0,1,2],[0,2,3]]:[[0,2,1],[0,3,2]];
  for(const ids of tris)for(const index of ids){positions.push(...points[index]);normals.push(out[0],0,out[1]);}
  return {positions,normals};
}
function entranceDoor(building,a,b,out,profile,materials){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),width=Math.min(1.55,length-1),height=Math.min(2.75,Math.max(2.25,(profile.floorHeight??3)-.2));
  const range=Math.max(0,length-width-1),center=.5+width/2+(range?((profile.seed>>>12)%100)/100*range:0),from=center-width/2,to=center+width/2,frame=.11;
  const extras={sourceId:building.extras.sourceId,appearanceSource:'procedural-interpretation',detail:'MainEntrance',entranceType:'single-door'};
  return [
    {name:building.name+'_DoorSlab',...facadeRectangle(a,b,out,from,to,.12,height,.045),material:materials.door,extras},
    {name:building.name+'_DoorGlass',...facadeRectangle(a,b,out,from+.18,to-.18,height*.56,height-.18,.052),material:materials.glass,extras},
    {name:building.name+'_DoorFrameLeft',...facadeRectangle(a,b,out,from-frame,from,.08,height+.12,.058),material:materials.frame,extras},
    {name:building.name+'_DoorFrameRight',...facadeRectangle(a,b,out,to,to+frame,.08,height+.12,.058),material:materials.frame,extras},
    {name:building.name+'_DoorFrameTop',...facadeRectangle(a,b,out,from-frame,to+frame,height,height+.12,.058),material:materials.frame,extras},
    {name:building.name+'_DoorThreshold',...facadeRectangle(a,b,out,from-frame,to+frame,.06,.15,.06),material:materials.frame,extras},
    {name:building.name+'_DoorHandle',...facadeRectangle(a,b,out,to-.27,to-.20,1.02,1.20,.064),material:materials.handle,extras}
  ];
}
export function buildingDetails(buildings,segments,{shop,trim,roofEquipment,buildingMaterials,entranceMaterials}){
  const objects=[];
  for(const building of buildings){
    const ring=building.extras.footprint,height=building.extras.height;if(!ring||height<3.5||building.extras.minHeight>0)continue;
    const appearance=buildingMaterials?.get(building.name),profile=appearance?.profile;
    let frontage=-1,best=Infinity;
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],b=ring[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<4)continue;
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];let out=[-(b[1]-a[1])/len,(b[0]-a[0])/len];if(insidePolygon([mid[0]+out[0]*.05,mid[1]+out[1]*.05],ring))out=out.map(v=>-v);
      for(const s of segments){const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],q=dx*dx+dz*dz;if(q<1e-8)continue;const t=Math.max(0,Math.min(1,((mid[0]-s.a[0])*dx+(mid[1]-s.a[1])*dz)/q)),v=[s.a[0]+t*dx-mid[0],s.a[1]+t*dz-mid[1]],d=Math.hypot(...v);if(v[0]*out[0]+v[1]*out[1]>.1&&d<s.width/2+22&&d<best){best=d;frontage=i;}}
    }
    let edge=0;
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],b=ring[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1)continue;
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];let out=[-(b[1]-a[1])/len,(b[0]-a[0])/len];
      if(insidePolygon([mid[0]+out[0]*.05,mid[1]+out[1]*.05],ring))out=out.map(v=>-v);
      const parapet=strip(a,b,.22),copingHeight=profile?.roofDetail==='low-coping'?.15:.25+(profile?.variant??1)*.06;objects.push({name:building.name+`_Parapet_${edge}`,...extrude(parapet,copingHeight,height),material:trim});
      if(i===frontage&&len>4){
        if(profile?.ground==='entrance'&&entranceMaterials)objects.push(...entranceDoor(building,a,b,out,profile,entranceMaterials));
        else objects.push({name:building.name+`_${profile&&profile.ground!=='shop'?'Entrance':'Shop'}_${edge}`,...panel(a,b,out,Math.min(3.1,profile?.floorHeight??3.1)),material:appearance?.ground??shop});
        if(profile)objects.push(...facadeDetails(building,a,b,out,profile,buildings,segments,trim));
      }
      edge++;
    }
    const center=ring.slice(0,-1).reduce((p,v)=>[p[0]+v[0]/(ring.length-1),p[1]+v[1]/(ring.length-1)],[0,0]);
    const equipment=[[center[0]-1.2,center[1]-.8],[center[0]+1.2,center[1]-.8],[center[0]+1.2,center[1]+.8],[center[0]-1.2,center[1]+.8]];
    if((!profile||profile.roofDetail==='equipment')&&equipment.every(p=>insidePolygon(p,ring))&&!(building.extras.holes??[]).some(h=>polygonsOverlap(equipment,h))&&ring.every((p,i)=>distanceToSegment(center,p,ring[(i+1)%ring.length])>1.6))objects.push({name:building.name+'_RoofUnit',...extrude(equipment,.8,height),material:roofEquipment});
    if(profile?.roofDetail==='spire'&&equipment.every(p=>insidePolygon(p,ring))&&!(building.extras.holes??[]).some(h=>polygonsOverlap(equipment,h)))objects.push({name:building.name+'_Spire',...pyramid(center,2.4,height,Math.min(5,Math.max(2.5,height*.35))),material:roofEquipment,extras:{sourceId:building.extras.sourceId,appearanceSource:'procedural-interpretation',detail:'Spire'}});
  }
  return objects;
}
