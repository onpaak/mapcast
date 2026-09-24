import {extrude} from './geometry.mjs';
import {area,obstacle,clipPavement,roadFaceRings} from './pavement-clip.mjs';

export function walkingWidth(tags){
  const match=String(tags.width??'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:m)?$/i);
  const value=match?Number(match[1]):0;
  return value>0?{width:Math.max(.5,Math.min(20,value)),widthSource:'width'}:
    {width:{pedestrian:5,footway:1.8,path:1.2,cycleway:2.5}[tags.highway]??1.8,widthSource:'class'};
}

// These are mapped routes, not inferred door-to-sidewalk connectors.
export function walkingSurfaces(routes,blockingObjects,sidewalkPads,material){
  const blocks=roadFaceRings(blockingObjects).map(r=>obstacle(r,0));
  const occupied=sidewalkPads.map(r=>obstacle(r,0)),objects=[],records=[],pads=[];
  for(const route of [...routes].sort((a,b)=>String(a.extras.sourceId).localeCompare(String(b.extras.sourceId)))){
    const pieces=[],input=roadFaceRings([route]);
    for(const triangle of input){
      for(const piece of clipPavement(triangle,[...blocks,...occupied],.005)){
        pieces.push(piece);pads.push(piece);occupied.push(obstacle(piece,0));
      }
    }
    const originalArea=input.reduce((n,r)=>n+area(r),0),retainedArea=pieces.reduce((n,r)=>n+area(r),0);
    records.push({sourceId:route.extras.sourceId,highway:route.extras.highway,originalArea,retainedArea,status:retainedArea>0?'generated':'covered-or-blocked'});
    if(!pieces.length)continue;
    const meshes=pieces.map(p=>extrude(p,0,.025));
    objects.push({...route,positions:meshes.flatMap(m=>m.positions),normals:meshes.flatMap(m=>m.normals),material,extras:{...route.extras,retainedArea,originalArea}});
  }
  return {objects,records,pads};
}
