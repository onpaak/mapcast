import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {project} from './geometry.mjs';
import {relationPolygons} from './relations.mjs';
import {polygonsOverlap,insidePolygon,interiorPoint} from './spatial.mjs';
import {environmentKind} from './environment.mjs';
import {isShopPOI} from './shop-pois.mjs';
import {isCrossingNode} from './crossings.mjs';
import {isBusStopNode} from './bus-stops.mjs';
import {furnitureKind} from './street-furniture.mjs';
import {validateArea,areaBounds,clipLineToArea,clipRingToArea} from './area.mjs';

export const OSM_SOURCE={name:'OpenStreetMap',attribution:'© OpenStreetMap contributors',copyrightUrl:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/'};
const isBuilding=value=>value!==undefined&&String(value).toLowerCase()!=='no';
// building:part describes one section of a building (a podium, a setback, a spire).
export const isBuildingPart=tags=>isBuilding(tags?.['building:part']);
export function validateBounds(input) {
  const b=typeof input==='string'?input.split(',').map(x=>x.trim()===''?NaN:Number(x)):input;
  if(!Array.isArray(b)||b.length!==4||b.some(x=>!Number.isFinite(x)))throw new Error('Bounds must be west,south,east,north');
  const [w,s,e,n]=b;
  if(w>=e||s>=n||w< -180||e>180||s< -85||n>85)throw new Error('Invalid bounds; dateline crossings and polar areas are unsupported');
  if(Math.hypot(...project(e,n,[w,s]))>3000)throw new Error('Selected area diagonal must be <= 3 km');
  return b;
}
export function expandBounds(input,requestedMeters=100){
  const b=validateBounds(input),diagonal=Math.hypot(...project(b[2],b[3],[b[0],b[1]]));
  const meters=Math.max(0,Math.min(requestedMeters,(3000-diagonal)/(2*Math.SQRT2)));
  const middle=(b[1]+b[3])/2,lat=meters/111195,lon=meters/(111195*Math.max(.05,Math.cos(middle*Math.PI/180)));
  return [Math.max(-180,b[0]-lon),Math.max(-85,b[1]-lat),Math.min(180,b[2]+lon),Math.min(85,b[3]+lat)];
}
export function buildQuery(bounds) {
  const [w,s,e,n]=validateBounds(bounds),box=`${s},${w},${n},${e}`;
  return `[out:json][timeout:25];(node["shop"](${box});node["amenity"~"^(cafe|restaurant|bar|fast_food|waste_basket|bicycle_parking)$"](${box});node["barrier"~"^(gate|entrance|lift_gate|swing_gate|opening|kissing_gate)$"](${box});node["highway"="bus_stop"](${box});node["public_transport"="platform"]["bus"="yes"](${box});way["barrier"~"^(fence|railing|guard_rail|handrail)$"](${box});way["amenity"="bicycle_parking"](${box});way["building"](${box});way["building:part"](${box});way["highway"](${box});relation["building"](${box});relation["building:part"](${box});way["natural"~"^(water|wood)$"](${box});way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|orchard)$"](${box});way["leisure"~"^(park|garden|nature_reserve)$"](${box});way["waterway"="riverbank"](${box});relation["natural"~"^(water|wood)$"](${box});relation["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|orchard)$"](${box});relation["leisure"~"^(park|garden|nature_reserve)$"](${box}););(._;>;);out body geom;`;
}
// Liang-Barsky clipping preserves breaks when roads leave the selection.
export function clipLine(points,b) {
  const result=[];let current=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],c=points[i],dx=c[0]-a[0],dy=c[1]-a[1];let t0=0,t1=1,ok=true;
    const p=[-dx,dx,-dy,dy],q=[a[0]-b[0],b[2]-a[0],a[1]-b[1],b[3]-a[1]];
    for(let k=0;k<4;k++) {
      if(p[k]===0){if(q[k]<0)ok=false;continue;}
      const t=q[k]/p[k];if(p[k]<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
    }
    if(!ok||t0>=t1){if(current.length>1)result.push(current);current=[];continue;}
    const start=[a[0]+dx*t0,a[1]+dy*t0],end=[a[0]+dx*t1,a[1]+dy*t1];
    if(current.length&&Math.hypot(current.at(-1)[0]-start[0],current.at(-1)[1]-start[1])<1e-10)current.push(end);
    else {if(current.length>1)result.push(current);current=[start,end];}
  }
  if(current.length>1)result.push(current);return result;
}
export function clipPolygonRing(input,b){
  let points=input.slice(0,-1),edges=[{axis:0,value:b[0],keep:v=>v>=b[0]},{axis:0,value:b[2],keep:v=>v<=b[2]},{axis:1,value:b[1],keep:v=>v>=b[1]},{axis:1,value:b[3],keep:v=>v<=b[3]}];
  for(const edge of edges){
    const output=[];for(let i=0;i<points.length;i++){
      const a=points[(i+points.length-1)%points.length],c=points[i],ain=edge.keep(a[edge.axis]),cin=edge.keep(c[edge.axis]);
      const intersection=()=>{const t=(edge.value-a[edge.axis])/(c[edge.axis]-a[edge.axis]);return [a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t];};
      if(cin){if(!ain)output.push(intersection());output.push(c);}else if(ain)output.push(intersection());
    }points=output;if(!points.length)break;
  }
  if(points.length<3)return [];
  points.push([...points[0]]);return points;
}
// `bounds` (west,south,east,north) or `area` (a convex lon,lat polygon, see area.mjs) limits
// the result; with an area, bounds default to its bounding box.
export function fromOverpass(raw,{bounds,area,provenance={}}={}) {
  if(raw.remark)throw new Error(`Overpass returned incomplete/error data: ${raw.remark}`);
  if(!Array.isArray(raw.elements))throw new Error('Expected Overpass JSON with elements');
  if(area){area=validateArea(area);bounds=bounds?validateBounds(bounds):areaBounds(area);}
  else if(bounds)bounds=validateBounds(bounds);
  const nodes=new Map(raw.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
  const ways=new Map(raw.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const warnings=[],features=[],buildingMembers=new Set(),partMembers=new Set(),environmentMembers=new Set();
  // Sections outside the selection, kept later if their building is (see below).
  const outsideParts=[];
  const diagnostics={receivedBuildings:0,outsideBuildings:0,invalidBuildings:0,boundaryBuildings:0,receivedParts:0,invalidParts:0,receivedEnvironment:0,generatedEnvironment:0,outsideEnvironment:0,invalidEnvironment:0};
  const selection=area??(bounds?[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]]:null);
  const intersects=polygon=>!selection||(polygonsOverlap(polygon[0],selection)&&!polygon.slice(1).some(h=>selection.every(p=>insidePolygon(p,h))));
  const inside=([x,y])=>!bounds||(area?insidePolygon([x,y],area):x>=bounds[0]&&x<=bounds[2]&&y>=bounds[1]&&y<=bounds[3]);
  const clipRing=ring=>area?clipRingToArea(ring,area):clipPolygonRing(ring,bounds);
  for(const e of raw.elements)if(e.type==='relation'&&(isBuilding(e.tags?.building)||isBuildingPart(e.tags)||environmentKind(e.tags))) {
    const environment=environmentKind(e.tags),part=!environment&&isBuildingPart(e.tags),building=!environment&&!part&&isBuilding(e.tags?.building);
    if(part)diagnostics.receivedParts++;else if(building)diagnostics.receivedBuildings++;else diagnostics.receivedEnvironment++;
    for(const m of e.members??[])if(m.type==='way')(part?partMembers:building?buildingMembers:environmentMembers).add(m.ref);
    try {
      const all=relationPolygons(e,ways,nodes),polygons=all.filter(intersects);
      if(!polygons.length&&part&&all.length){outsideParts.push({type:'Feature',id:`relation/${e.id}`,properties:{...e.tags,osm_member_ids:(e.members??[]).map(m=>`way/${m.ref}`)},geometry:all.length===1?{type:'Polygon',coordinates:all[0]}:{type:'MultiPolygon',coordinates:all}});continue;}
      if(!polygons.length){if(part)continue;if(building)diagnostics.outsideBuildings++;else diagnostics.outsideEnvironment++;continue;}
      if(building){if(!polygons.every(p=>p.every(r=>r.every(inside))))diagnostics.boundaryBuildings++;}
      const selected=environment&&bounds?polygons.filter(p=>!p.slice(1).some(h=>selection.every(point=>insidePolygon(point,h)))).map(p=>p.map(clipRing).filter(r=>r.length>=4)).filter(p=>p[0]?.length>=4):polygons;
      if(!selected.length){if(environment)diagnostics.outsideEnvironment++;continue;}
      if(environment)diagnostics.generatedEnvironment++;
      features.push({type:'Feature',id:`relation/${e.id}`,properties:{...e.tags,osm_member_ids:(e.members??[]).map(m=>`way/${m.ref}`)},geometry:selected.length===1?{type:'Polygon',coordinates:selected[0]}:{type:'MultiPolygon',coordinates:selected}});
    }catch(error){if(part)diagnostics.invalidParts++;else if(building)diagnostics.invalidBuildings++;else diagnostics.invalidEnvironment++;warnings.push({id:`relation/${e.id}`,reason:error.message});}
  }
  for(const e of raw.elements) {
    if(e.type!=='way')continue;
    // Railings and bicycle-parking areas for the street furniture layer.
    const furnitureLine=!e.tags?.building&&!e.tags?.highway&&furnitureKind(e.tags,'LineString'),furnitureArea=!e.tags?.building&&furnitureKind(e.tags,'Polygon');
    if(furnitureLine||furnitureArea){
      const coords=(e.geometry??e.nodes?.map(n=>nodes.get(n)))?.map(c=>c&&[c.lon,c.lat]);
      if(!coords||coords.length<2||coords.some(c=>!c||!Number.isFinite(c[0])||!Number.isFinite(c[1]))){warnings.push({id:`way/${e.id}`,reason:'Missing geometry or unresolved node references'});continue;}
      const closed=coords.length>=4&&coords[0][0]===coords.at(-1)[0]&&coords[0][1]===coords.at(-1)[1];
      if(furnitureArea&&closed){if(intersects([coords]))features.push({type:'Feature',id:`way/${e.id}`,properties:e.tags,geometry:{type:'Polygon',coordinates:[coords]}});}
      else if(furnitureLine){const parts=area?clipLineToArea(coords,area):bounds?clipLine(coords,bounds):[coords];parts.forEach((line,i)=>{if(line.length>1)features.push({type:'Feature',id:`way/${e.id}/${i}`,properties:{...e.tags,osm_id:`way/${e.id}`},geometry:{type:'LineString',coordinates:line}});});}
      continue;
    }
    if(!e.tags?.building&&!isBuildingPart(e.tags)&&!e.tags?.highway&&!environmentKind(e.tags))continue;
    const id=`way/${e.id}`,p=e.tags,environment=environmentKind(p);
    // A way tagged both building and building:part is a section of a larger building.
    const partFeature=isBuildingPart(p),buildingFeature=!partFeature&&isBuilding(p.building);
    if(partFeature){
      if(partMembers.has(e.id))continue;
      diagnostics.receivedParts++;
      const coords=(e.geometry??e.nodes?.map(n=>nodes.get(n)))?.map(c=>c&&[c.lon,c.lat]);
      if(!coords||coords.length<4||coords.some(c=>!c||!Number.isFinite(c[0])||!Number.isFinite(c[1]))||coords[0][0]!==coords.at(-1)[0]||coords[0][1]!==coords.at(-1)[1]){diagnostics.invalidParts++;warnings.push({id,reason:'Building part is not a closed ring'});continue;}
      (intersects([coords])?features:outsideParts).push({type:'Feature',id,properties:p,geometry:{type:'Polygon',coordinates:[coords]}});
      continue;
    }
    // A shared boundary is not the same feature: park membership must not erase
    // buildings or roads, and building membership must not erase a tagged road.
    if(buildingFeature?buildingMembers.has(e.id):!p.highway&&environment&&environmentMembers.has(e.id))continue;
    if(buildingFeature)diagnostics.receivedBuildings++;
    const geometry=e.geometry??e.nodes?.map(n=>nodes.get(n));
    if(!geometry||geometry.some(c=>!c||!Number.isFinite(c.lon)||!Number.isFinite(c.lat))){if(buildingFeature)diagnostics.invalidBuildings++;warnings.push({id,reason:'Missing geometry or unresolved node references'});continue;}
    const coords=geometry.map(c=>[c.lon,c.lat]);
    if(buildingFeature) {
      if(coords.length<4||coords[0][0]!==coords.at(-1)[0]||coords[0][1]!==coords.at(-1)[1]){diagnostics.invalidBuildings++;warnings.push({id,reason:'Building is not a closed ring'});continue;}
      if(!intersects([coords])){diagnostics.outsideBuildings++;continue;}
      if(!coords.every(inside))diagnostics.boundaryBuildings++;
      features.push({type:'Feature',id,properties:p,geometry:{type:'Polygon',coordinates:[coords]}});
    }else if(p.highway) {
      const parts=area?clipLineToArea(coords,area):bounds?clipLine(coords,bounds):[coords];
      parts.forEach((line,i)=>{if(line.length>1)features.push({type:'Feature',id:`${id}/${i}`,properties:{...p,osm_id:id},geometry:{type:'LineString',coordinates:line}});});
    }else if(environment){
      diagnostics.receivedEnvironment++;
      if(coords.length<4||coords[0][0]!==coords.at(-1)[0]||coords[0][1]!==coords.at(-1)[1]){diagnostics.invalidEnvironment++;warnings.push({id,reason:'Environment area is not a closed ring'});continue;}
      if(!intersects([coords])){diagnostics.outsideEnvironment++;continue;}
      const ring=bounds?clipRing(coords):coords;if(ring.length<4){diagnostics.outsideEnvironment++;continue;}
      diagnostics.generatedEnvironment++;features.push({type:'Feature',id,properties:p,geometry:{type:'Polygon',coordinates:[ring]}});
    }
  }
  // A building that crosses the edge keeps its whole outline, so it keeps all its sections too:
  // otherwise a tower inside the selection could float over a podium section left outside it.
  const outlines=features.filter(f=>f.properties.building&&!isBuildingPart(f.properties)&&f.geometry.type!=='LineString').flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates);
  for(const f of outsideParts){
    const ring=f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];
    // Scaled to roughly metres so triangulation tolerances hold; a broken ring is left out.
    let point;try{point=interiorPoint(ring.map(([x,y])=>[x*1e5,y*1e5])).map(v=>v/1e5);}catch{continue;}
    if(outlines.some(poly=>insidePolygon(point,poly[0])&&!poly.slice(1).some(h=>insidePolygon(point,h))))features.push(f);
  }
  for(const node of nodes.values())if(!isShopPOI(node.tags)&&furnitureKind(node.tags,'Point')&&Number.isFinite(node.lon)&&Number.isFinite(node.lat)&&inside([node.lon,node.lat]))features.push({type:'Feature',id:`node/${node.id}`,properties:{...node.tags},geometry:{type:'Point',coordinates:[node.lon,node.lat]}});
  // Crossing, signal and bus stop nodes, for painted zebra crossings, signal poles and shelters.
  for(const node of nodes.values())if((isCrossingNode(node.tags)||node.tags?.highway==='traffic_signals'||isBusStopNode(node.tags))&&!isShopPOI(node.tags)&&Number.isFinite(node.lon)&&Number.isFinite(node.lat)&&inside([node.lon,node.lat]))features.push({type:'Feature',id:`node/${node.id}`,properties:{...node.tags},geometry:{type:'Point',coordinates:[node.lon,node.lat]}});
  for(const node of nodes.values())if(isShopPOI(node.tags)&&Number.isFinite(node.lon)&&Number.isFinite(node.lat)&&inside([node.lon,node.lat]))features.push({type:'Feature',id:`node/${node.id}`,properties:{...node.tags},geometry:{type:'Point',coordinates:[node.lon,node.lat]}});
  return {type:'FeatureCollection',features,selectionBounds:bounds,...(area?{selectionArea:[...area,area[0]]}:{}),diagnostics,source:{...OSM_SOURCE,...provenance,dataTimestamp:raw.osm3s?.timestamp_osm_base},warnings};
}
export async function downloadArea(bounds,{cacheDir='cache',refresh=false,offline=false,endpoint='https://overpass-api.de/api/interpreter',fetchImpl=fetch}={}) {
  if(offline&&refresh)throw new Error('Offline mode cannot be combined with refresh');
  bounds=validateBounds(bounds);const retrievalBounds=expandBounds(bounds),query=buildQuery(retrievalBounds);
  const key=createHash('sha256').update(endpoint+'\n'+query).digest('hex').slice(0,20),file=join(cacheDir,`${key}.json`);
  if(!refresh) {
    try {const cached=JSON.parse(await readFile(file,'utf8'));fromOverpass(cached.raw,{bounds});return {...cached,cacheHit:true,cacheFile:file};}
    catch(e){if(e.code!=='ENOENT')throw new Error(`Invalid cache ${file}: ${e.message}; use --refresh to download again`);}
  }
  if(offline)throw new Error('No cached data for this area; turn off offline mode to download it, or use a local map file');
  let response;try{response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mapcast/0.1'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(45000)});}
  catch(error){throw new Error(`Cannot reach Overpass (${error.cause?.code??error.name??'network error'}); check the network connection or switch data source and try again`,{cause:error});}
  if(!response.ok)throw new Error(response.status===429?'Overpass rate limit reached (HTTP 429); try again later or use cached data':`Overpass HTTP ${response.status}`);
  const raw=await response.json();fromOverpass(raw,{bounds});
  const record={raw,provenance:{endpoint,query,retrievalBounds,downloadedAt:new Date().toISOString()},bounds,retrievalBounds};
  await mkdir(cacheDir,{recursive:true});await writeFile(file,JSON.stringify(record,null,2));
  return {...record,cacheHit:false,cacheFile:file};
}
