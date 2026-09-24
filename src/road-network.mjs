import {extrude} from './geometry.mjs';

const classWidths={
  motorway:14,trunk:13,primary:12,secondary:10,tertiary:9,
  motorway_link:8,trunk_link:8,primary_link:8,secondary_link:7,tertiary_link:7,
  unclassified:7,residential:7,living_street:5.5,service:5,track:4
};

function positiveNumber(value){
  const match=String(value??'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?$/i);
  const number=match?Number(match[1]):NaN;
  return Number.isFinite(number)&&number>0?number:NaN;
}

function imperialMeters(value){
  const match=String(value??'').trim().match(/^(\d+)\s*'\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/i);
  if(!match)return NaN;
  const feet=Number(match[1]),inches=Number(match[2]??0);
  return (feet+inches/12)*0.3048;
}

export function roadWidth(tags={}){
  const metric=positiveNumber(tags.width),imperial=imperialMeters(tags.width),explicit=Number.isFinite(metric)?metric:imperial;
  if(Number.isFinite(explicit))return {width:Math.max(2.5,Math.min(30,explicit)),widthSource:'width'};
  const lanes=String(tags.lanes??'').match(/^\s*(\d+(?:\.\d+)?)\s*$/)?.[1];
  if(lanes){
    const count=Number(lanes);
    if(count>0)return {width:Math.max(3.5,Math.min(30,count*3.2)),widthSource:'lanes'};
  }
  return {width:classWidths[String(tags.highway??'').toLowerCase()]??7,widthSource:'class-default'};
}

export function roadSurface(tags={}){
  const surface=String(tags.surface??'').toLowerCase();
  if(['sett','cobblestone','unhewn_cobblestone','paving_stones'].includes(surface))return {kind:'stone',source:surface};
  if(['concrete','concrete:plates','concrete:lanes'].includes(surface))return {kind:'concrete',source:surface};
  if(['gravel','fine_gravel','compacted','ground','dirt','earth','unpaved'].includes(surface))return {kind:'dirt',source:surface};
  return {kind:'asphalt',source:surface||'default'};
}

export function junctionPatches(segments,material=1,tolerance=.35){
  const groups=new Map();
  const add=(point,segment)=>{
    const key=`${Math.round(point[0]/tolerance)},${Math.round(point[1]/tolerance)}`;
    if(!groups.has(key))groups.set(key,{points:[],segments:[]});
    const group=groups.get(key);group.points.push(point);group.segments.push(segment);
  };
  segments.forEach(segment=>{add(segment.a,segment);add(segment.b,segment);});
  const patches=[];
  for(const group of groups.values()){
    const roads=[...new Set(group.segments.map(segment=>segment.road))];
    if(group.segments.length<3||roads.length<2)continue;
    const center=group.points.reduce((sum,p)=>[sum[0]+p[0]/group.points.length,sum[1]+p[1]/group.points.length],[0,0]);
    if(group.points.some(p=>Math.hypot(p[0]-center[0],p[1]-center[1])>tolerance))continue;
    const candidates=[];
    for(const segment of group.segments){
      const distanceA=Math.hypot(segment.a[0]-center[0],segment.a[1]-center[1]),far=distanceA<tolerance?segment.b:segment.a;
      const dx=far[0]-center[0],dz=far[1]-center[1],length=Math.hypot(dx,dz);if(length<.01)continue;
      const ux=dx/length,uz=dz/length,px=-uz,pz=ux,half=segment.width/2,extension=Math.min(1.25,Math.max(.55,half*.18));
      candidates.push([center[0]+ux*extension+px*half,center[1]+uz*extension+pz*half],[center[0]+ux*extension-px*half,center[1]+uz*extension-pz*half]);
    }
    const sorted=[...candidates].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];
    for(const point of sorted){while(lower.length>=2&&turn(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
    for(const point of sorted.toReversed()){while(upper.length>=2&&turn(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}
    const ring=[...lower.slice(0,-1),...upper.slice(0,-1)];if(ring.length<3)continue;
    const radius=Math.max(...ring.map(point=>Math.hypot(point[0]-center[0],point[1]-center[1])));
    patches.push({name:`Junction_${patches.length}`,...extrude(ring,0,.03),material,extras:{kind:'junction-patch',center,radius,incidentRoads:roads}});
  }
  return patches;
}

export function inferredCrosswalks(junctions,segments,material){
  const objects=[];
  for(const junction of junctions){
    const {center,radius}=junction.extras;
    const approaches=segments.filter(s=>Math.min(Math.hypot(s.a[0]-center[0],s.a[1]-center[1]),Math.hypot(s.b[0]-center[0],s.b[1]-center[1]))<.6);
    for(const segment of approaches){
      if(/motorway|trunk/.test(segment.highway??''))continue;
      const da=Math.hypot(segment.a[0]-center[0],segment.a[1]-center[1]),far=da<.6?segment.b:segment.a;
      const dx=far[0]-center[0],dz=far[1]-center[1],length=Math.hypot(dx,dz);if(length<radius+2)continue;
      const ux=dx/length,uz=dz/length,px=-uz,pz=ux,meshes=[];
      for(let stripe=-2;stripe<=2;stripe++){
        const d=radius+1.6+stripe*.62,c=[center[0]+ux*d,center[1]+uz*d],half=segment.width*.38;
        const mesh=extrude([[c[0]-px*half-ux*.17,c[1]-pz*half-uz*.17],[c[0]+px*half-ux*.17,c[1]+pz*half-uz*.17],[c[0]+px*half+ux*.17,c[1]+pz*half+uz*.17],[c[0]-px*half+ux*.17,c[1]-pz*half+uz*.17]],0,.045);
        meshes.push(mesh);
      }
      objects.push({name:`Crosswalk_${objects.length}`,positions:meshes.flatMap(m=>m.positions),normals:meshes.flatMap(m=>m.normals),material,extras:{kind:'inferred-crosswalk',junction:junction.name,road:segment.road}});
    }
  }
  return objects;
}
