import {project,extrude,roadRibbon} from './geometry.mjs';
import {insidePolygon,interiorPoint} from './spatial.mjs';
import {isBuildingPart} from './osm.mjs';
import {offsetConvex} from './area.mjs';
import {polygonMesh} from './polygon-mesh.mjs';
import {roadWidth} from './road-network.mjs';
import {environmentKind} from './environment.mjs';
import {associateShopPOIs} from './shop-pois.mjs';
import {furnitureSources} from './street-furniture.mjs';
import {terrainMesh,terrainHeightLocal,prepareGameTerrain} from './terrain.mjs';
import {isCrossingNode} from './crossings.mjs';
export function generate(data) {
  if(data.type!=='FeatureCollection'||!Array.isArray(data.features)) throw new Error('Expected WGS84 GeoJSON FeatureCollection');
  const pairs=[];
  function walk(c){if(Array.isArray(c)&&typeof c[0]==='number'){if(c.length<2||!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>90)throw new Error('Invalid WGS84 coordinates');pairs.push(c);}else if(Array.isArray(c)) c.forEach(walk);}
  data.features.forEach(f=>walk(f.geometry?.coordinates));
  if(!pairs.length&&!data.selectionBounds)throw new Error('No coordinates found');
  const bounds=data.selectionBounds?[...data.selectionBounds]:[Infinity,Infinity,-Infinity,-Infinity];
  if(!data.selectionBounds)pairs.forEach(([x,y])=>{bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);});
  const origin=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
  const lo=project(bounds[0],bounds[1],origin),hi=project(bounds[2],bounds[3],origin);
  if(Math.hypot(hi[0]-lo[0],hi[1]-lo[1])>3000)throw new Error('Prototype supports areas with diagonal <= 3 km');
  const colors=[[0.19,0.20,0.17,1],[0.085,0.09,0.11,1],[0.43,0.39,0.36,1],[0.32,0.36,0.40,1],[.22,.31,.20,1],[.16,.29,.35,1],[.15,.24,.16,1]];
  const materials=colors.map((c,i)=>({name:['Ground','Asphalt','Warm facade','Cool facade','Green area','Water','Woodland'][i],pbrMetallicRoughness:{baseColorFactor:c,metallicFactor:0,roughnessFactor:1}}));
  const gameTerrain=data.terrain?prepareGameTerrain(data.terrain):undefined;
  const crossings=[],signals=[];
  const objects=[gameTerrain?{name:'Terrain_Surface',...terrainMesh(gameTerrain,origin),material:0,extras:{terrainGround:true,sceneModule:'Terrain_Base'}}:{name:'Terrain_Surface',...extrude(data.selectionArea?offsetConvex(data.selectionArea.slice(0,-1).map(c=>project(...c.slice(0,2),origin)),25):[[lo[0]-25,hi[1]-25],[hi[0]+25,hi[1]-25],[hi[0]+25,lo[1]+25],[lo[0]-25,lo[1]+25]],0),material:0,extras:{terrainGround:true,sceneModule:'Terrain_Base'}}];
  const warnings=[...(data.warnings??[])],omissions=[],replacedOutlines=[];let placedParts=0;
  const projectPolygons=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(polygon=>polygon.map(r=>r.map(c=>project(...c.slice(0,2),origin))));
  // One building object per polygon. Sections of a building start at `min` (min_height).
  function addBuilding({id,p,polygons,index,height,heightSource,min=0,outlineId}){
    const osmTags=Object.fromEntries(['building','building:part','building:shape','building:use','building:levels','building:material','building:facade:material','building:colour','man_made','tower:type','roof:shape','roof:height','roof:material','amenity','tourism','railway','public_transport','healthcare','shop','office','leisure','religion','denomination'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
    const parts=polygons.map((rings,part)=>{
      const samples=gameTerrain?rings[0].map(point=>terrainHeightLocal(gameTerrain,origin,...point)):[],gameBaseElevation=samples.length?Math.max(...samples)+.03:0,foundationBottom=samples.length?Math.min(...samples)-.08:0;
      return {name:`Building_${id}${polygons.length>1?'_Part_'+part:''}`,...polygonMesh(rings,height-min,min),material:2+index%2,extras:{sourceId:id,sourceUrl:/^(way|relation)\/\d+$/.test(String(id))?'https://www.openstreetmap.org/'+id:undefined,height,...(min?{minHeight:min}:{}),...(outlineId!==undefined?{outlineId}:{}),osmTags,footprint:rings[0],holes:rings.slice(1),memberIds:p.osm_member_ids,heightSource,gameBaseElevation,foundationBottom,sceneModule:'Buildings'}};
    });
    if(gameTerrain&&!min)for(const part of parts){const h=part.extras.gameBaseElevation-part.extras.foundationBottom;objects.push({name:part.name.replace('Building_','Foundation_'),...polygonMesh([part.extras.footprint,...part.extras.holes],h,part.extras.foundationBottom),material:0,extras:{sourceId:part.extras.sourceId,sceneModule:'Building_Foundations',terrainAbsolute:true}});}
    objects.push(...parts);
  }
  // A section inherits its outline's use and falls back to the outline's height.
  function addPart(record,outlineTags,outlineHeight,index){
    const p=record.feature.properties,inherited=Object.fromEntries(Object.entries(outlineTags??{}).filter(([k])=>!['height','building:levels','min_height','building:min_level','name'].includes(k)));
    if(Number(p.layer||0)<0||['underground','indoor'].includes(p.location)){warnings.push({id:record.id,reason:'Underground or indoor building not supported'});return;}
    const {height,min,source}=partHeight(p,outlineHeight);
    if(!(height-min>=1)){warnings.push({id:record.id,reason:'Building part has no height above its base'});return;}
    addBuilding({id:record.id,p:{...inherited,...p,building:p.building??outlineTags?.building??'yes'},polygons:record.polygons,index,height,heightSource:source,min,outlineId:record.outline});
    placedParts++;
  }
  const partRecords=[];
  for(const [index,f] of data.features.entries()){
    if(!isBuildingPart(f.properties)||!['Polygon','MultiPolygon'].includes(f.geometry?.type))continue;
    try{const polygons=projectPolygons(f.geometry);partRecords.push({id:f.id??index,index,feature:f,polygons,point:interiorPoint(polygons[0][0])});}
    catch(e){warnings.push({id:f.id??index,reason:e.message});}
  }
  // Each section belongs to the smallest building outline around it, so a tower standing inside
  // a larger podium or plaza outline is replaced by its own sections, not claimed by the podium.
  if(partRecords.length){
    const outlines=[];
    for(const [index,f] of data.features.entries()){
      const p=f.properties??{};
      if(isBuildingPart(p)||!p.building||String(p.building).toLowerCase()==='no'||!['Polygon','MultiPolygon'].includes(f.geometry?.type))continue;
      try{const polygons=projectPolygons(f.geometry);outlines.push({id:f.id??index,polygons,area:polygons.reduce((s,poly)=>s+footprintArea(poly[0]),0)});}catch{/* Reported with the building itself. */}
    }
    for(const record of partRecords){
      let owner;
      for(const o of outlines)if((!owner||o.area<owner.area)&&o.polygons.some(poly=>insidePolygon(record.point,poly[0])&&!poly.slice(1).some(h=>insidePolygon(record.point,h))))owner=o;
      record.owner=owner?.id;
    }
  }
  for(const [index,f] of data.features.entries()) {
    const p=f.properties??{},g=f.geometry,id=f.id??index;
    // Sections are placed with their outline below, or on their own after the loop.
    if(isBuildingPart(p))continue;
    try {
      const isBuilding=p.building&&String(p.building).toLowerCase()!=='no';
      // For buildings, layer only orders them against podiums or stations; it is not elevated geometry.
      if(isBuilding?Number(p.layer||0)<0||['underground','indoor'].includes(p.location):p.bridge&&p.bridge!=='no'||p.tunnel&&p.tunnel!=='no'||Number(p.layer||0)!==0)throw new Error(isBuilding?'Underground or indoor building not supported':'Elevated/underground geometry not supported');
      const environment=environmentKind(p);
      if(environment&&['Polygon','MultiPolygon'].includes(g?.type)){
        const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates,material={green:4,water:5,woodland:6}[environment],base={green:.012,water:.008,woodland:.014}[environment];
        polygons.forEach((polygon,part)=>{const rings=polygon.map(r=>r.map(c=>project(...c.slice(0,2),origin))),samples=gameTerrain?rings[0].map(point=>terrainHeightLocal(gameTerrain,origin,...point)):[],waterLevel=environment==='water'&&samples.length?samples.sort((a,b)=>a-b)[Math.floor(samples.length/2)]:undefined;objects.push({name:`Environment_${environment}_${id}${polygons.length>1?'_Part_'+part:''}`,...polygonMesh(rings,0,base),material,extras:{sourceId:id,environment,rings,waterLevel,sceneModule:environment==='water'?'Water':'Vegetation',osmTags:Object.fromEntries(['natural','landuse','leisure','water','waterway','name'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))}});});
      }else if(p.building&&String(p.building).toLowerCase()!=='no') {
        if(['roof','proposed','construction','ruins'].includes(String(p.building).toLowerCase()))throw new Error(`Building type ${p.building} is not a finished enclosed building`);
        if(!['Polygon','MultiPolygon'].includes(g?.type))throw new Error('Building must be Polygon or MultiPolygon');
        const polygons=projectPolygons(g),{height,source}=buildingHeight(p,footprintArea(polygons[0][0]));
        // Mapped building:part sections replace the outline, as in OSM's Simple 3D Buildings.
        const inner=partRecords.filter(r=>!r.outline&&r.owner===id);
        if(inner.length){
          for(const record of inner){record.outline=id;addPart(record,p,height,index);}
          replacedOutlines.push({sourceId:id,parts:inner.map(r=>r.id)});
          continue;
        }
        addBuilding({id,p,polygons,index,height,heightSource:source});
      } else if(g?.type==='Point'&&(isCrossingNode(p)||p.highway==='traffic_signals')) {
        if(gameTerrain){omissions.push({id,reason:'Crossings and signals currently require flat mode'});continue;}
        const point=project(...g.coordinates.slice(0,2),origin);
        if(isCrossingNode(p))crossings.push({id,point,tags:p});
        if(p.highway==='traffic_signals')signals.push({id,point,tags:p});
      } else if(p.highway) {
        if(g?.type!=='LineString')throw new Error('Road must be LineString');
        if(p.highway==='steps'||p.area==='yes'){
          omissions.push({id,reason:`Pedestrian/cycle route not generated by current street preset: ${p.highway}`});continue;
        }
        // Only roads and their pavements are built; other walking routes leave the ground even.
        if(['footway','path','cycleway','pedestrian','bridleway'].includes(p.highway)){
          omissions.push({id,reason:'Walking routes are not drawn; only roads and their pavements are built'});continue;
        }
        const {width,widthSource}=roadWidth(p),path=g.coordinates.map(c=>project(...c.slice(0,2),origin));
        const mesh=roadRibbon(path,width);
        if(mesh.positions.length)objects.push({name:`Road_${id}`,...mesh,material:1,extras:{sourceId:id,width,widthSource,highway:p.highway,lanes:p.lanes,surface:p.surface,oneway:p.oneway,path,sceneModule:'Roads'}});
        else omissions.push({id,reason:'Road has no usable surface geometry'});
      }
    }catch(e){warnings.push({id,reason:e.message});}
  }
  // Sections with no outline around them stand on their own.
  for(const record of partRecords)if(record.outline===undefined){
    try{addPart(record,undefined,undefined,record.index);}catch(e){warnings.push({id:record.id,reason:e.message});}
  }
  const extendedDown=supportRaisedSections(objects);
  const shopPOIs=associateShopPOIs(objects,data.features,origin);
  // Mapped bins, bicycle racks and railings, placed by the concrete preset.
  const furniture=furnitureSources(data.features,origin);
  const terrain=gameTerrain?{...gameTerrain,minElevation:Math.min(...gameTerrain.elevations),maxElevation:Math.max(...gameTerrain.elevations),cacheFile:undefined}:undefined;
  return {objects,materials,furniture,crossings,signals,metadata:{origin,bounds,...(data.selectionArea?{selectionArea:data.selectionArea}:{}),shopPOIs,buildingParts:{parts:placedParts,replacedOutlines,extendedDown},units:'meters',axes:'Y up; X east; -Z north',source:data.source??'User supplied GeoJSON; verify attribution',terrain,terrainError:data.terrainError,warnings,omissions,limitations:[terrain?'Terrain uses a 90m DEM and does not represent curbs or embankments':'Flat terrain fallback','Complex merges and roundabouts are represented by segment geometry','Flat materials only; PS2 texture and lighting pass pending']}};
}

// Raised sections rest on what is under them. Where the data leaves a gap (a podium mapped a
// storey short, or standing outside the selection), a section extends down to the highest roof
// below it, or to the ground. Bridges, canopies and balconies are meant to float.
const FLOATING=['bridge','roof','canopy','balcony'];
function supportRaisedSections(objects){
  const blocks=objects.filter(o=>o.name.startsWith('Building_')),extended=[];
  for(const o of blocks){
    const min=o.extras.minHeight,tags=o.extras.osmTags;
    if(!min||FLOATING.includes(String(tags['building:part']??tags.building).toLowerCase()))continue;
    const point=interiorPoint(o.extras.footprint);let below=0,supported=false;
    for(const b of blocks){
      if(b===o||(b.extras.minHeight??0)>=min||!insidePolygon(point,b.extras.footprint)||b.extras.holes.some(h=>insidePolygon(point,h)))continue;
      if(b.extras.height>=min-.5){supported=true;break;}
      below=Math.max(below,b.extras.height);
    }
    if(supported)continue;
    Object.assign(o,polygonMesh([o.extras.footprint,...o.extras.holes],o.extras.height-below,below));
    if(below)o.extras.minHeight=below;else delete o.extras.minHeight;
    extended.push({sourceId:o.extras.sourceId,from:min,to:below});
  }
  return extended;
}

const numeric=v=>/^\d+(\.\d+)?(\s*m)?$/.test(String(v))?parseFloat(v):NaN;
// height, else building:levels × 3 m, else an estimate from type and footprint.
function buildingHeight(p,area){
  const tagged=numeric(p.height),levels=numeric(p['building:levels']);
  if(tagged>0)return {height:tagged,source:'height'};
  if(levels>0)return {height:levels*3,source:'levels'};
  return untaggedHeight(p.building,area);
}
// A building:part spans min_height (or building:min_level × 3 m) to its own height; a part
// without height or levels takes the outline's.
function partHeight(p,outlineHeight){
  const tagged=numeric(p.height),levels=numeric(p['building:levels']),minTagged=numeric(p.min_height),minLevel=numeric(p['building:min_level']);
  const min=minTagged>=0?minTagged:minLevel>=0?minLevel*3:0;
  if(tagged>0)return {height:tagged,min,source:'height'};
  if(levels>0)return {height:levels*3,min,source:'levels'};
  return {height:outlineHeight??12,min,source:outlineHeight===undefined?'default':'outline'};
}
const footprintArea=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;

// Height for buildings with neither height nor building:levels. Small houses and outbuildings
// are common untagged in villages; a flat 12 m default turned every cottage into four storeys.
const ONE_STOREY=['garage','garages','shed','hut','carport','kiosk','bungalow','cabin','greenhouse','service','toilets','farm_auxiliary','static_caravan','container'];
const TWO_STOREY=['house','detached','semidetached_house','terraced','farm','residential_house'];
export function untaggedHeight(type,area){
  const kind=String(type).toLowerCase();
  if(kind==='barn')return {height:6,source:'type'};
  if(ONE_STOREY.includes(kind))return {height:3.5,source:'type'};
  if(TWO_STOREY.includes(kind))return {height:6.5,source:'type'};
  if(kind==='yes'&&area<200)return {height:6.5,source:'footprint'};
  if(kind==='yes'&&area<400)return {height:9.5,source:'footprint'};
  return {height:12,source:'default'};
}
