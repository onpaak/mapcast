import {project} from './geometry.mjs';
import {roadSurface} from './road-network.mjs';
import {environmentKind} from './environment.mjs';
import {isBuildingPart} from './osm.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function sourceReport(data,scene){
  const generated=new Map();
  // An outline replaced by its building:part sections counts as generated through them.
  for(const o of scene.objects)for(const id of [o.extras?.sourceId,o.extras?.outlineId]){if(id===undefined)continue;const key=String(id);if(!generated.has(key))generated.set(key,[]);generated.get(key).push(o);}
  const entries=data.features.map(f=>{
    const id=String(f.id),objects=generated.get(id)??[],osmId=id.match(/^(node|way|relation)\/\d+/)?.[0];
    const surface=objects[0]?.extras.path?roadSurface(objects[0].extras):undefined;
    const kind=isBuildingPart(f.properties)?'building-part':f.properties?.building&&String(f.properties.building).toLowerCase()!=='no'?'building':f.properties?.highway?'road':environmentKind(f.properties)?'environment':'excluded';
    return {featureId:id,osmUrl:osmId?'https://www.openstreetmap.org/'+osmId:undefined,name:f.properties?.name,kind,environment:environmentKind(f.properties),generated:objects.length>0,skipReasons:objects.length?[]:[...(scene.metadata.warnings??[]),...(scene.metadata.omissions??[])].filter(w=>String(w.id)===id).map(w=>w.reason),objectNames:objects.map(o=>o.name),height:objects[0]?.extras.height,heightSource:objects[0]?.extras.heightSource,width:objects[0]?.extras.width,widthSource:objects[0]?.extras.widthSource,highway:objects[0]?.extras.highway,surface:f.properties?.surface,surfaceKind:surface?.kind,holeCount:objects.reduce((n,o)=>n+(o.extras.holes?.length??0),0),memberIds:f.properties?.osm_member_ids};
  });
  const buildings=entries.filter(e=>e.kind==='building'&&e.generated),roads=entries.filter(e=>e.kind==='road'&&e.generated),environment=entries.filter(e=>e.kind==='environment'&&e.generated);
  const summary={source:scene.metadata.source,bounds:scene.metadata.bounds,buildings:buildings.length,roads:roads.length,environment:environment.reduce((counts,e)=>(counts[e.environment]=(counts[e.environment]??0)+1,counts),{}),courtyardBuildings:buildings.filter(e=>e.holeCount>0).length,heightSources:buildings.reduce((a,e)=>(a[e.heightSource]=(a[e.heightSource]??0)+1,a),{}),excludedFeatures:entries.filter(e=>!e.generated).length};
  const parsed=entries.filter(e=>e.kind==='building').length;
  summary.buildingParts=entries.filter(e=>e.kind==='building-part'&&e.generated).length;
  if(scene.metadata.selectionArea)summary.area=scene.metadata.selectionArea;
  summary.buildingDiagnostics={...data.diagnostics,parsedBuildings:parsed,generatedBuildings:buildings.length,generationSkipped:parsed-buildings.length,skippedBuildings:(data.diagnostics?.invalidBuildings??0)+parsed-buildings.length};
  const width=1000,height=850,margin=60,[w,s,e,n]=scene.metadata.bounds;
  const lo=project(w,s,scene.metadata.origin),hi=project(e,n,scene.metadata.origin),scale=Math.min((width-margin*2)/(hi[0]-lo[0]),(height-180)/(lo[1]-hi[1]));
  const point=c=>{const p=project(c[0],c[1],scene.metadata.origin);return [margin+(p[0]-lo[0])*scale,100+(p[1]-hi[1])*scale];};
  const path=ring=>ring.map((c,i)=>`${i?'L':'M'}${point(c).map(v=>v.toFixed(2)).join(',')}`).join(' ');
  const shapes=[];
  for(const f of data.features){const entry=entries.find(e=>e.featureId===String(f.id)),g=f.geometry;if(!g)continue;
    const color=entry.generated?(entry.kind==='building'?'#6ba9bd':entry.kind==='road'?'#ebc679':entry.environment==='water'?'#528da0':'#668b63'):'#536170';let shape='';
    if(g.type==='Polygon'||g.type==='MultiPolygon'){const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;shape=polygons.map(p=>`<path d="${p.map(r=>path(r)+' Z').join(' ')}" fill="${color}" fill-rule="evenodd" stroke="#16232e" stroke-width="0.7"/>`).join('');}
    else if(g.type==='LineString')shape=`<path d="${path(g.coordinates)}" fill="none" stroke="${color}" stroke-width="${entry.generated?2:1}"/>`;
    else if(g.type==='Point'){const [x,y]=point(g.coordinates);shape=`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="${color}"/>`;}
    shapes.push(`<g><title>${escape(entry.featureId+' '+(entry.name??'')+' '+(entry.generated?'generated':'excluded'))}</title>${entry.osmUrl?`<a href="${escape(entry.osmUrl)}">${shape}</a>`:shape}</g>`);
  }
  const attribution=typeof scene.metadata.source==='object'?scene.metadata.source.attribution:scene.metadata.source;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#101b25"/><g font-family="sans-serif" fill="#e7edf0"><text x="60" y="38" font-size="24">OSM source → generated scene</text><text x="60" y="66" font-size="14">${buildings.length} buildings · ${roads.length} road features · ${environment.length} environment features</text></g>${shapes.join('')}${scene.metadata.selectionArea?`<path d="${path(scene.metadata.selectionArea)} Z" fill="none" stroke="#e8743b" stroke-width="1.5" stroke-dasharray="6 4"/>`:''}<g font-family="sans-serif" font-size="13" fill="#bbcbd5"><text x="60" y="${height-62}">Blue: buildings · Yellow: roads · Green/teal: environment · Grey: excluded</text><text x="60" y="${height-40}">North up. Click an object to inspect its original OSM record. Original source footprints shown.</text><text x="60" y="${height-18}">${escape(attribution)}</text></g></svg>`;
  // Parse failures have no feature geometry, but must still be inspectable by ID.
  const featureIds=new Set(entries.map(e=>e.featureId));
  const importIssues=(data.warnings??[]).filter(w=>!featureIds.has(String(w.id))).map(w=>({featureId:String(w.id),reason:w.reason,osmUrl:/^(node|way|relation)\/\d+$/.test(String(w.id))?'https://www.openstreetmap.org/'+w.id:undefined}));
  return {index:{summary,features:entries,importIssues,warnings:scene.metadata.warnings},svg};
}
