const active=value=>value&&!['no','vacant'].includes(String(value));
const homes=new Set(['apartments','residential','house','detached','semidetached_house','terrace','dormitory','bungalow','cabin','hut','villa','farm','static_caravan']);
// Civic halls, and large venues (theatres, cinemas, museums, sports halls) that would otherwise
// fall back to a windowless mass.
const halls=new Set(['civic','public','townhall','community_centre','library','courthouse','theatre','cinema','arts_centre','concert_hall','museum','gallery','exhibition_centre','conference_centre','sports_hall','sports_centre']);
// Fire stations are garages for engines: roller doors at the front suit them.
const industrial=new Set(['industrial','warehouse','garages','garage','shed','fire_station']);
// Government buildings and police stations are ordinary offices.
const offices=new Set(['office','commercial','government','police']);
const windowBlocks=new Set(['school','college','university','hospital','hotel','motel','hostel','kindergarten','guardhouse','outbuilding']);
const special=new Set(['church','cathedral','chapel','mosque','synagogue','temple','religious','stadium','tower','water_tower','storage_tank','castle','bunker','hangar','train_station','transportation']);

export function resolveConcreteFamily(tags={}){
 const normalized=Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,String(v).trim().toLowerCase()])),building=normalized.building;
 const result=(family,key,assignment='tag',plainWindows=false)=>({family,assignment,evidence:key?{key,value:tags[key]}:null,plainWindows});
 const use=(value,key)=>{
  if(special.has(value)||value==='place_of_worship')return result('simple-mass',key,'fallback');
  if(industrial.has(value))return result('industrial',key);
  if(halls.has(value))return result('public-hall',key);
  if(windowBlocks.has(value))return result('residential',key,'mapped-use',true);
  if(homes.has(value))return result('residential',key);
  if(offices.has(value))return result('office',key);
  if(value==='retail'||value==='kiosk')return result('retail',key);
  return null;
 };
 // A whole-building type takes precedence over a secondary tenant or amenity.
 if(!['yes','commercial',undefined,''].includes(building)&&!homes.has(building)){
  const explicit=use(building,'building');if(explicit)return explicit;
 }
 if(homes.has(building)){
  if(active(normalized.shop)||['restaurant','cafe','bar','fast_food'].includes(normalized.amenity))return result('retail',active(normalized.shop)?'shop':'amenity');
  return result('residential','building');
 }
 for(const key of ['building:use','amenity','tourism']){const mapped=use(normalized[key],key);if(mapped)return mapped;}
 if(active(normalized.shop)||['restaurant','cafe','bar','fast_food'].includes(normalized.amenity))return result('retail',active(normalized.shop)?'shop':'amenity');
 if(active(normalized.office))return result('office','office');
 if(building==='commercial')return result('office','building');
 if(!building||building==='yes')return result('residential',building?'building':null,'default');
 return result('simple-mass','building','fallback');
}
export function concreteFamily(tags={}){return resolveConcreteFamily(tags).family;}
