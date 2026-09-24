import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shopSignFace} from '../src/shop-signs.mjs';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';

test('sign face preserves outward winding and keeps UVs inside the selected atlas entry',()=>{
 const uv={u0:.25,u1:.5,v0:.4,v1:.45};
 for(const n of [[0,1],[0,-1]]){const m=shopSignFace([0,0],[1,0],n,0,3,2.7,3.1,uv);const p=m.positions;const cross=(p[3]-p[0])*(p[7]-p[1])-(p[4]-p[1])*(p[6]-p[0]);assert.ok(cross*n[1]>0);
  assert.ok(m.texcoords.every((v,i)=>i%2?v>=uv.v0&&v<=uv.v1:v>=uv.u0&&v<=uv.u1));}
 assert.equal(shopSignFace([0,0],[1,0],[0,1],0,1,2.7,2.8,uv),null);
});
test('retail signs stay above glazing and canopy, residential building has no signs',()=>{
 const data={type:'FeatureCollection',features:[{type:'Feature',id:'retail-test',properties:{building:'retail',height:'7'},geometry:{type:'Polygon',coordinates:[[[0,0],[.00024,0],[.00024,.00015],[0,.00015],[0,0]]]}}]};
 const scene=concreteCity(generate(data));assert.ok(scene.metadata.shopSigns.length);
 for(const sign of scene.metadata.shopSigns){const opening=scene.metadata.frontages.find(f=>f.sourceId===sign.sourceId&&f.edge===sign.edge&&f.bay===sign.bay);assert.ok(sign.bounds[2]>opening.bounds[3]+.18);assert.ok(sign.text&&sign.signId);}
 assert.equal(scene.textures.filter(t=>/^Neon_signs_\d/.test(t.name)).length,1);
 data.features[0].properties.building='apartments';assert.equal(concreteCity(generate(data)).metadata.shopSigns.length,0);
});
