import test from 'node:test';
import assert from 'node:assert/strict';
import {concreteFamily} from '../src/concrete-family.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {generate} from '../src/scene.mjs';
test('public hall classification is separate from office and does not turn residential POIs into halls',()=>{
 for(const tags of [{building:'civic'},{building:'public'},{building:'yes',amenity:'library'}])assert.equal(concreteFamily(tags),'public-hall');
 assert.equal(concreteFamily({building:'office'}),'office');
 assert.equal(concreteFamily({building:'apartments',amenity:'library'}),'residential');
 assert.equal(concreteFamily({building:'warehouse',shop:'yes'}),'industrial');
});
test('public hall exports high windows and an independent solid entrance with reusable textures',()=>{
 const scene=concreteCity(generate({type:'FeatureCollection',features:[{id:'hall',properties:{building:'civic',height:'9'},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.0002],[0,.0002],[0,0]]]}}]}));
 assert.equal(scene.metadata.concreteFamilies[0].family,'public-hall');
 const entries=scene.metadata.entranceLayouts;assert.equal(entries.length,1);assert.equal(entries[0].doorType,'solid-double');assert.equal(entries[0].bounds[2],0);assert.equal(entries[0].bounds[3],2.4);
 assert.ok(scene.metadata.frontages.some(x=>x.type==='hall-high-window'&&x.bounds[3]-x.bounds[2]>6));
 assert.ok(scene.metadata.frontages.some(x=>x.type==='hall-clerestory'));
 assert.ok(scene.objects.every(o=>o.positions.every(Number.isFinite)&&(!o.texcoords||o.texcoords.length===o.positions.length/3*2)));
 assert.ok(scene.metadata.textureReuse.sharedBuildingTextures<=6);
 assert.equal(scene.metadata.entranceAccessEnabled,false);
});
