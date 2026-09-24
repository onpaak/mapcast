import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentKind} from '../src/environment.mjs';
import {fromOverpass,clipPolygonRing,buildQuery} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {stylePS2} from '../src/ps2.mjs';

test('environment tags map area scenery while individual trees stay disabled',()=>{
  assert.equal(environmentKind({natural:'water'}),'water');
  assert.equal(environmentKind({landuse:'meadow'}),'green');
  assert.equal(environmentKind({landuse:'forest'}),'woodland');
  assert.equal(environmentKind({natural:'tree'}),undefined);
  assert.equal(environmentKind({landuse:'residential'}),undefined);
});

test('environment polygon clipping keeps generated geometry inside selection',()=>{
  const bounds=[0,0,.01,.01],ring=[[-.01,-.01],[.02,-.01],[.02,.02],[-.01,.02],[-.01,-.01]],clipped=clipPolygonRing(ring,bounds);
  assert.ok(clipped.length>=4);assert.ok(clipped.every(([x,y])=>x>=0&&x<=.01&&y>=0&&y<=.01));
  const raw={elements:[{type:'way',id:7,tags:{leisure:'park'},geometry:ring.map(([lon,lat])=>({lon,lat}))},{type:'node',id:8,lon:.005,lat:.005,tags:{natural:'tree'}}]};
  const data=fromOverpass(raw,{bounds});assert.equal(data.features.length,1);assert.equal(data.diagnostics.generatedEnvironment,1);
  const scene=stylePS2(generate(data));assert.equal(scene.metadata.environmentTypes.green,1);
  assert.ok(scene.objects.some(o=>o.name.startsWith('Environment_green_')));assert.ok(!scene.objects.some(o=>o.name.startsWith('Tree_')));
});

test('Overpass query requests environmental areas without individual trees',()=>{
  const query=buildQuery([13.4,52.52,13.401,52.521]);
  assert.doesNotMatch(query,/node\["natural"="tree"\]/);assert.match(query,/way\["landuse"/);assert.match(query,/relation\["natural"/);
});
