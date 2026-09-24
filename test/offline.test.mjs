import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {downloadMapArea} from '../src/map-api.mjs';
import {downloadArea} from '../src/osm.mjs';
import {validateRequest} from '../src/server.mjs';
const bounds=[13.401,52.527,13.407,52.531];
for(const [name,download] of [['map',downloadMapArea],['overpass',downloadArea]]){
 test(`${name}: offline misses, refresh conflicts and cache hits never fetch`,async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-offline-'));let calls=0;
  const denied=async()=>{calls++;throw new Error('network must not run');};
  try{
   await assert.rejects(download(bounds,{cacheDir,offline:true,fetchImpl:denied}),/No cached data/);
   await assert.rejects(download(bounds,{cacheDir,offline:true,refresh:true,fetchImpl:denied}),/cannot be combined/);
   const saved=await download(bounds,{cacheDir,fetchImpl:async()=>({ok:true,json:async()=>({elements:[]})})});
   if(name==='map'){
    const record=JSON.parse(await readFile(saved.cacheFile,'utf8'));
    record.raw.elements.push({type:'relation',id:77,tags:{building:'yes',type:'multipolygon'},members:[{type:'way',ref:8,role:'outer'}]});
    await writeFile(saved.cacheFile,JSON.stringify(record));
   }
   const result=await download(bounds,{cacheDir,offline:true,fetchImpl:denied});
   assert.equal(result.cacheHit,true);
   if(name==='map'){
    assert.deepEqual(result.provenance.relationCompletionFailures,['relation/77']);
    const subset=await download([13.402,52.528,13.406,52.530],{cacheDir,offline:true,fetchImpl:denied});
    assert.equal(subset.cacheHit,true);
    assert.deepEqual(subset.provenance.relationCompletionFailures,['relation/77']);
   }
   assert.equal(calls,0);
  }finally{
   assert.equal(dirname(resolve(cacheDir)),resolve(tmpdir()));assert.ok(basename(cacheDir).startsWith('mapcast-offline-'));
   await rm(cacheDir,{recursive:true,force:true});
  }
 });
 test(`${name}: explains rate limiting`,async()=>{
  await assert.rejects(download(bounds,{refresh:true,fetchImpl:async()=>({ok:false,status:429})}),/rate limit/);
 });
}
test('web offline mode requires an explicit boolean',()=>{
 assert.equal(validateRequest({bounds}).offline,false);
 assert.equal(validateRequest({bounds,offline:true}).offline,true);
 assert.throws(()=>validateRequest({bounds,offline:'false'}),/boolean/);
});
