import {insidePolygon} from './spatial.mjs';
import {project} from './geometry.mjs';

export function isShopPOI(tags={}){
 return Boolean(tags.shop&&!['no','vacant'].includes(String(tags.shop).toLowerCase())||['cafe','restaurant','bar','fast_food'].includes(tags.amenity));
}

export function associateShopPOIs(objects,features,origin){
 // Shops sit in ground-level sections, not in raised parts stacked above them.
 const buildings=objects.filter(o=>o.name.startsWith('Building_')&&!(o.extras.minHeight>0)),report={matched:0,unmatched:0,ambiguous:0,aboveGround:0};
 const seen=new Set();
 for(const feature of features){
   if(feature.geometry?.type!=='Point'||!isShopPOI(feature.properties)||seen.has(feature.id))continue;
   seen.add(feature.id);const tags=feature.properties??{},level=tags.level??tags['addr:floor'];
   if(level!==undefined&&String(level)!=='0'){report.aboveGround++;continue;}
   const point=project(...feature.geometry.coordinates.slice(0,2),origin),matches=buildings.filter(o=>insidePolygon(point,o.extras.footprint)&&!(o.extras.holes??[]).some(h=>insidePolygon(point,h)));
   if(matches.length!==1){report[matches.length?'ambiguous':'unmatched']++;continue;}
   const building=matches[0];building.extras.containedShops??=[];
   building.extras.containedShops.push({sourceId:feature.id,shop:tags.shop,amenity:tags.amenity,position:point,groundFloor:level===undefined?'inferred':'tagged'});report.matched++;
 }
 return report;
}
