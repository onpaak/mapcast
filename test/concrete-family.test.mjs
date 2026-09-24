import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveConcreteFamily} from '../src/concrete-family.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {generate} from '../src/scene.mjs';
test('related uses reuse plain window blocks with traceable evidence',()=>{
 for(const tags of [{building:'school'},{building:'yes',amenity:'hospital'},{building:'yes',tourism:'hotel'},{building:'yes','building:use':'university'}]){
  const result=resolveConcreteFamily(tags);assert.equal(result.family,'residential');assert.equal(result.plainWindows,true);assert.equal(result.assignment,'mapped-use');assert.equal(tags[result.evidence.key],result.evidence.value);
 }
 assert.equal(resolveConcreteFamily({building:'apartments',amenity:'school'}).plainWindows,false);
 assert.equal(resolveConcreteFamily({building:'yes'}).assignment,'default');
 assert.equal(resolveConcreteFamily({building:'yes',office:'government'}).family,'office');
});
test('special and unknown shapes fall back without invented doors or residential details',()=>{
 for(const building of ['church','water_tower','castle','storage_tank','unrecognized_type']){
  const tags={building};assert.equal(resolveConcreteFamily(tags).family,'simple-mass');
  const scene=concreteCity(generate({type:'FeatureCollection',features:[{id:'special',properties:{...tags,height:'12'},geometry:{type:'Polygon',coordinates:[[[0,0],[.0002,0],[.0002,.0001],[0,.0001],[0,0]]]}}]}));
  assert.equal(scene.metadata.entranceLayouts.length,0);assert.equal(scene.metadata.frontages.length,0);
  assert.equal(scene.metadata.concreteFamilies[0].assignment,'fallback');
  const parts=scene.objects.filter(o=>o.name.startsWith('Building_'));
  assert.ok(parts.every(o=>o.extras.styleFamily==='simple-mass'));
  assert.equal(Math.max(...parts.flatMap(o=>o.positions.filter((_,i)=>i%3===1))),12);
 }
});
