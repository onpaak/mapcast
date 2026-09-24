import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {validateBounds,expandBounds,buildQuery,clipLine,fromOverpass,downloadArea} from '../src/osm.mjs';
test('bbox validates before network and uses Overpass south/west order',()=>{
  assert.throws(()=>validateBounds('13,,14,53'));assert.throws(()=>validateBounds('13,52,14,53'));
  const bbox=[13.4,52.52,13.402,52.522],expanded=expandBounds(bbox);
  assert.ok(expanded[0]<bbox[0]&&expanded[1]<bbox[1]&&expanded[2]>bbox[2]&&expanded[3]>bbox[3]);
  assert.match(buildQuery(bbox),/52.52,13.4,52.522,13.402/);assert.match(buildQuery(bbox),/\(\._;>;\)/);
});
test('clipping retains crossing road without outside nodes and breaks on exits',()=>{
  assert.deepEqual(clipLine([[-1,0.5],[2,0.5]],[0,0,1,1]),[[[0,0.5],[1,0.5]]]);
  const lines=clipLine([[0.5,0.5],[2,0.5],[2,2],[0.5,0.75]],[0,0,1,1]);
  assert.equal(lines.length,2);assert.equal(lines[0].at(-1)[0],1);
});
test('resolves nodes and reports relation members without filling holes',()=>{
  const raw={elements:[{type:'node',id:1,lon:13.4,lat:52.52},{type:'node',id:2,lon:13.401,lat:52.52},{type:'way',id:3,tags:{highway:'residential'},nodes:[1,2]},{type:'way',id:4,tags:{building:'yes'},nodes:[1,2,1]},{type:'relation',id:5,tags:{building:'yes'},members:[{type:'way',ref:4}]}]};
  const data=fromOverpass(raw);assert.equal(data.features.length,1);assert.equal(data.warnings.length,1);assert.equal(data.source.license,'ODbL-1.0');
  assert.throws(()=>fromOverpass({elements:[],remark:'timeout'}),/incomplete/);
});
test('same area uses cache and preserves download provenance',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-test-'));let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>({elements:[]})};};
  try{
    const args={cacheDir,fetchImpl},bbox=[13.4,52.52,13.402,52.522];
    const first=await downloadArea(bbox,args),second=await downloadArea(bbox,args);
    assert.equal(calls,1);assert.equal(first.cacheHit,false);assert.equal(second.cacheHit,true);assert.deepEqual(first.provenance,second.provenance);
    await downloadArea(bbox,{...args,refresh:true});assert.equal(calls,2);
  }finally{
    assert.equal(dirname(resolve(cacheDir)),resolve(tmpdir()));assert.ok(basename(cacheDir).startsWith('mapcast-test-'));
    await rm(cacheDir,{recursive:true,force:true});
  }
});
test('cross-boundary buildings are retained and missing nodes are reported',()=>{
  const raw={elements:[
    {type:'way',id:1,tags:{building:'yes'},geometry:[{lon:13.399,lat:52.52},{lon:13.401,lat:52.52},{lon:13.401,lat:52.521},{lon:13.399,lat:52.52}]},
    {type:'way',id:2,tags:{highway:'residential'},nodes:[999,1000]}
  ]};
  const data=fromOverpass(raw,{bounds:[13.4,52.52,13.402,52.522]});
  assert.equal(data.features.length,1);assert.equal(data.warnings.length,1);assert.equal(data.diagnostics.boundaryBuildings,1);
});
test('Overpass reports the network cause and recovery action',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-overpass-network-'));
  try{await assert.rejects(downloadArea([13.4,52.52,13.4002,52.5202],{cacheDir,fetchImpl:async()=>{const error=new Error('fetch failed');error.cause={code:'ETIMEDOUT'};throw error;}}),/Cannot reach Overpass \(ETIMEDOUT\)/);}
  finally{await rm(cacheDir,{recursive:true,force:true});}
});
test('building=no is case-insensitive and never becomes scene geometry',()=>{
  const geometry=[{lon:13.4,lat:52.52},{lon:13.401,lat:52.52},{lon:13.401,lat:52.521},{lon:13.4,lat:52.52}];
  for(const value of ['no','No','NO'])assert.equal(fromOverpass({elements:[{type:'way',id:1,tags:{building:value},geometry}]}).features.length,0);
});
