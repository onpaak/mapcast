import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadMapArea} from '../src/map-api.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
test('Map API fallback rejects large selections before issuing any request',async()=>{
  let called=false;
  await assert.rejects(downloadMapArea([13.4,52.52,13.42,52.53],{fetchImpl:async()=>{called=true;}}),/1 km/);
  assert.equal(called,false);
});
test('Map API reports a useful network failure instead of bare fetch failed',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-network-'));
  try{await assert.rejects(downloadMapArea([13.4,52.52,13.4002,52.5202],{cacheDir,fetchImpl:async()=>{const error=new Error('fetch failed');error.cause={code:'EACCES'};throw error;}}),/Cannot reach the OSM Map API \(EACCES\)/);}
  finally{await rm(cacheDir,{recursive:true,force:true});}
});
test('smaller selections reuse actual covering cache without a second request',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-map-'));let calls=0;
  try{
    const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>({elements:[]})};};
    await downloadMapArea([13.401,52.527,13.407,52.531],{cacheDir,fetchImpl});
    const selected=[13.402,52.528,13.406,52.530],result=await downloadMapArea(selected,{cacheDir,fetchImpl});
    assert.equal(calls,1);assert.equal(result.cacheHit,true);assert.deepEqual(result.bounds,selected);
    const r=result.provenance.retrievalBounds;assert.ok(r[0]<13.401&&r[1]<52.527&&r[2]>13.407&&r[3]>52.531);
  }finally{assert.equal(dirname(resolve(cacheDir)),resolve(tmpdir()));assert.ok(basename(cacheDir).startsWith('mapcast-map-'));await rm(cacheDir,{recursive:true,force:true});}
});
test('Map API requests a buffer but filters and reports against the selected bounds',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-buffer-')),requested=[];
  try{
    const bounds=[13.4,52.52,13.401,52.521],fetchImpl=async url=>{requested.push(url);return {ok:true,json:async()=>({elements:[]})};};
    const result=await downloadMapArea(bounds,{cacheDir,fetchImpl});
    const fetched=new URL(requested[0]).searchParams.get('bbox').split(',').map(Number);
    assert.ok(fetched[0]<bounds[0]&&fetched[1]<bounds[1]&&fetched[2]>bounds[2]&&fetched[3]>bounds[3]);
    assert.deepEqual(result.bounds,bounds);assert.deepEqual(result.retrievalBounds,fetched);
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});
test('Map API completes missing building relation members from the full endpoint',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-relation-')),urls=[];
  try{
    const relation={type:'relation',id:77,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:8,role:'outer'}]};
    const nodes=[[1,13.4,52.52],[2,13.401,52.52],[3,13.401,52.521],[4,13.4,52.521]].map(([id,lon,lat])=>({type:'node',id,lon,lat}));
    const way={type:'way',id:8,nodes:[1,2,3,4,1]};
    const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/full.json')?{elements:[...nodes,way,relation]}:{elements:[relation]}};};
    const result=await downloadMapArea([13.4002,52.5202,13.4008,52.5208],{cacheDir,fetchImpl});
    assert.equal(urls.length,2);assert.match(urls[1],/relation\/77\/full\.json$/);assert.deepEqual(result.provenance.completedRelations,['relation/77']);
    assert.ok(result.raw.elements.some(e=>e.type==='way'&&e.id===8));
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});
test('Map API completes and upgrades cached environmental relations',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-environment-relation-')),urls=[];
  try{
    const relation={type:'relation',id:91,tags:{type:'multipolygon',natural:'water'},members:[{type:'way',ref:18,role:'outer'}]},nodes=[[1,13.4,52.52],[2,13.401,52.52],[3,13.401,52.521],[4,13.4,52.521]].map(([id,lon,lat])=>({type:'node',id,lon,lat})),way={type:'way',id:18,nodes:[1,2,3,4,1]};
    const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/full.json')?{elements:[...nodes,way,relation]}:{elements:[relation]}};};
    const bounds=[13.4002,52.5202,13.4008,52.5208],first=await downloadMapArea(bounds,{cacheDir,fetchImpl});assert.deepEqual(first.provenance.completedRelations,['relation/91']);
    const second=await downloadMapArea(bounds,{cacheDir,fetchImpl});assert.equal(second.cacheHit,true);assert.equal(urls.length,2);assert.ok(second.raw.elements.some(e=>e.type==='way'&&e.id===18));
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});
