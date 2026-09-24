import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {validateBounds,expandBounds,fromOverpass} from './osm.mjs';
import {project} from './geometry.mjs';
import {environmentKind} from './environment.mjs';
// Small-area fallback, not a bulk data downloader.
export async function downloadMapArea(bounds,{cacheDir='cache',refresh=false,offline=false,fetchImpl=fetch}={}){
  if(offline&&refresh)throw new Error('Offline mode cannot be combined with refresh');
  bounds=validateBounds(bounds);
  if(Math.hypot(...project(bounds[2],bounds[3],[bounds[0],bounds[1]]))>1000)throw new Error('OSM Map API fallback supports a diagonal <= 1 km; use Overpass for larger areas');
  const retrievalBounds=expandBounds(bounds),endpoint=`https://api.openstreetmap.org/api/0.6/map.json?bbox=${retrievalBounds.join(',')}`;
  const file=join(cacheDir,'map-'+createHash('sha256').update(endpoint).digest('hex').slice(0,20)+'.json');
  if(!refresh){try{const cached=JSON.parse(await readFile(file,'utf8')),completion=await completeBuildingRelations(cached.raw,{fetchImpl,offline});cached.raw=completion.raw;cached.provenance={...cached.provenance,completedRelations:[...new Set([...(cached.provenance?.completedRelations??[]),...completion.completed])],relationCompletionFailures:completion.failed};if(completion.completed.length)await writeFile(file,JSON.stringify(cached,null,2));fromOverpass(cached.raw,{bounds});return {...cached,bounds,provenance:{...cached.provenance,retrievalBounds:cached.retrievalBounds??retrievalBounds},cacheHit:true,cacheFile:file};}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!refresh){
    let names=[];try{names=await readdir(cacheDir);}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const name of names.filter(n=>/^map-[0-9a-f]{20}\.json$/.test(n)).sort()){
      const candidate=join(cacheDir,name),cached=JSON.parse(await readFile(candidate,'utf8')),b=cached.retrievalBounds??cached.bounds;
      if(b&&retrievalBounds[0]>=b[0]&&retrievalBounds[1]>=b[1]&&retrievalBounds[2]<=b[2]&&retrievalBounds[3]<=b[3]){
        const completion=await completeBuildingRelations(cached.raw,{fetchImpl,offline});cached.raw=completion.raw;cached.provenance={...cached.provenance,completedRelations:[...new Set([...(cached.provenance?.completedRelations??[]),...completion.completed])],relationCompletionFailures:completion.failed};if(completion.completed.length)await writeFile(candidate,JSON.stringify(cached,null,2));
        fromOverpass(cached.raw,{bounds});return {...cached,bounds,provenance:{...cached.provenance,retrievalBounds:b},cacheHit:true,cacheFile:candidate};
      }
    }
  }
  if(offline)throw new Error('No cached data for this area; turn off offline mode to download it, or use a local map file');
  let response;try{response=await fetchImpl(endpoint,{headers:{Accept:'application/json','User-Agent':'Mapcast/0.1'},signal:AbortSignal.timeout(35000)});}
  catch(error){throw new Error(`Cannot reach the OSM Map API (${error.cause?.code??error.name??'network error'}); check the network connection and try again`,{cause:error});}
  if(!response.ok)throw new Error(response.status===429?'OSM Map API rate limit reached (HTTP 429); try again later or use cached data':'OSM Map API HTTP '+response.status);
  const completion=await completeBuildingRelations(await response.json(),{fetchImpl});const raw=completion.raw;fromOverpass(raw,{bounds});
  const record={raw,bounds,retrievalBounds,provenance:{provider:'OSM Map API',endpoint,retrievalBounds,completedRelations:completion.completed,relationCompletionFailures:completion.failed,downloadedAt:new Date().toISOString()}};
  await mkdir(cacheDir,{recursive:true});await writeFile(file,JSON.stringify(record,null,2));
  return {...record,cacheHit:false,cacheFile:file};
}

export async function completeBuildingRelations(raw,{fetchImpl=fetch,offline=false}={}){
  if(!Array.isArray(raw.elements))return {raw,completed:[],failed:[]};
  const ways=new Set(raw.elements.filter(e=>e.type==='way').map(e=>e.id)),relations=raw.elements.filter(e=>e.type==='relation'&&((e.tags?.building&&String(e.tags.building).toLowerCase()!=='no')||environmentKind(e.tags)));
  const missing=relations.filter(r=>(r.members??[]).some(m=>m.type==='way'&&!m.geometry&&!ways.has(m.ref))),completed=[],failed=[],elements=new Map(raw.elements.map(e=>[`${e.type}/${e.id}`,e]));
  for(const relation of missing){
    if(offline){failed.push(`relation/${relation.id}`);continue;}
    try{
      const url=`https://api.openstreetmap.org/api/0.6/relation/${relation.id}/full.json`,response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'Mapcast/0.1'},signal:AbortSignal.timeout(35000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const full=await response.json();for(const e of full.elements??[])elements.set(`${e.type}/${e.id}`,e);completed.push(`relation/${relation.id}`);
    }catch{failed.push(`relation/${relation.id}`);}
  }
  return {raw:{...raw,elements:[...elements.values()]},completed,failed};
}
