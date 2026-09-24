import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {downloadTerrain,terrainHeight,terrainMesh,prepareGameTerrain,roadbedHeightLocal} from '../src/terrain.mjs';
import {generate} from '../src/scene.mjs';
import {stylePS2} from '../src/ps2.mjs';

test('terrain download samples, caches and interpolates relative elevation',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'mapcast-terrain-'));let calls=0;
  try{
    const fetchImpl=async url=>{calls++;const count=url.searchParams.get('latitude').split(',').length;return {ok:true,json:async()=>({elevation:Array.from({length:count},(_,i)=>100+i)})};};
    const bounds=[13.4,52.52,13.401,52.521],first=await downloadTerrain(bounds,{cacheDir,fetchImpl}),second=await downloadTerrain(bounds,{cacheDir,fetchImpl});
    assert.equal(first.cols,3);assert.equal(first.rows,3);assert.equal(calls,1);assert.equal(second.cacheHit,true);assert.ok(Number.isFinite(terrainHeight(first,13.4005,52.5205)));
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});

test('terrain mesh faces upward and styled scene follows terrain',()=>{
  const source={bounds:[13.4,52.52,13.401,52.521],cols:3,rows:3,elevations:[100,101,102,101,102,103,102,103,104],datum:102,source:{attribution:'test'}},terrain=prepareGameTerrain(source);
  const mesh=terrainMesh(terrain,[13.4005,52.5205]);assert.ok(mesh.normals.every((v,i)=>i%3!==1||v>0));
  const data={type:'FeatureCollection',selectionBounds:terrain.bounds,terrain:source,features:[{type:'Feature',id:'way/1/0',properties:{highway:'residential'},geometry:{type:'LineString',coordinates:[[13.4,52.52],[13.401,52.521]]}},{type:'Feature',id:'way/2',properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[[[13.4002,52.5202],[13.4004,52.5202],[13.4004,52.5204],[13.4002,52.5202]]]}},{type:'Feature',id:'way/3',properties:{natural:'water'},geometry:{type:'Polygon',coordinates:[[[13.4006,52.5206],[13.4009,52.5206],[13.4009,52.5209],[13.4006,52.5206]]]}}]};
  const scene=stylePS2(generate(data)),ground=scene.objects.find(o=>o.extras?.terrainGround),building=scene.objects.find(o=>o.name==='Building_way/2');
  assert.ok(ground.positions.some((v,i)=>i%3===1&&v!==0));assert.ok(Number.isFinite(building.extras.terrainOffset));
  const bases=building.positions.filter((_,i)=>i%3===1).filter(y=>Math.abs(y-building.extras.terrainOffset)<1e-8);assert.ok(bases.length>0);assert.equal(scene.metadata.terrain.datum,102);assert.ok(scene.objects.some(o=>o.name==='Foundation_way/2'));
  const water=scene.objects.find(o=>o.extras?.environment==='water'),waterY=new Set(water.positions.filter((_,i)=>i%3===1).map(v=>v.toFixed(6)));assert.equal(waterY.size,1);assert.ok(scene.metadata.sceneModules.Water>0);
});

test('game terrain compresses extreme relief and roadbed keeps a level cross-section',()=>{
  const terrain=prepareGameTerrain({bounds:[0,0,.01,.01],cols:3,rows:3,elevations:[0,100,400,0,200,400,0,100,400],datum:200});assert.ok(terrain.terrainPreset.gameRelief<=120);assert.ok(terrain.terrainPreset.appliedScale<1);
  const origin=[.005,.005],segments=[{a:[-400,0],b:[400,0],width:8}],left=roadbedHeightLocal(terrain,origin,0,-4,segments),right=roadbedHeightLocal(terrain,origin,0,4,segments);assert.equal(left,right);
});
