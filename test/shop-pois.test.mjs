import test from 'node:test';
import assert from 'node:assert/strict';
import {fromOverpass,buildQuery} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
const ring=[[0,0],[.0003,0],[.0003,.0002],[0,.0002],[0,0]];
const building={id:'way/1',properties:{building:'apartments'},geometry:{type:'Polygon',coordinates:[ring]}};
const poi=(id,x,y,extra={})=>({id,properties:{shop:'bakery',...extra},geometry:{type:'Point',coordinates:[x,y]}});
test('retains OSM shop nodes and links interior shop to mixed residential frontage',()=>{
 const data=fromOverpass({elements:[{type:'way',id:1,tags:building.properties,geometry:ring.map(([lon,lat])=>({lon,lat}))},{type:'node',id:2,lon:.0001,lat:.0001,tags:{shop:'bakery'}}]});
 const base=generate(data);assert.equal(base.metadata.shopPOIs.matched,1);
 const scene=concreteCity(base);assert.equal(scene.metadata.entranceLayouts[0].doorType,'solid');assert.ok(scene.metadata.frontages.length>0);
 const doors=scene.metadata.frontages.filter(f=>f.shopDoorBounds);assert.ok(doors.length>0);
 for(const material of scene.materials)assert.ok(material.pbrMetallicRoughness.baseColorFactor.every(v=>v>=0&&v<=1));
 const entry=scene.metadata.entranceLayouts[0];
 for(const door of doors){const [l,r,y,top]=door.shopDoorBounds;assert.equal(y,0);assert.ok(top>2);assert.ok(r>l&&r-l<=1.01);assert.notEqual(door.bay,entry.bay);assert.ok(l>=door.bounds[0]&&r<door.bounds[1]);}
 assert.ok(buildQuery([0,0,.001,.001]).includes('node["shop"]'));
});
test('does not assign courtyard, outside, upper-floor, or ambiguous shops to street-level building',()=>{
 const hole=[[.00008,.00008],[.00015,.00008],[.00015,.00015],[.00008,.00015],[.00008,.00008]];
 const b={...building,geometry:{type:'Polygon',coordinates:[ring,hole]}};
 const scene=generate({type:'FeatureCollection',features:[b,poi('hole',.0001,.0001),poi('outside',.0004,.0001),poi('upper',.0002,.0001,{level:'1'})]});
 assert.deepEqual(scene.metadata.shopPOIs,{matched:0,unmatched:2,ambiguous:0,aboveGround:1});
 const ambiguous=generate({type:'FeatureCollection',features:[building,{...building,id:'way/2'},poi('shared',.0001,.0001)]});assert.equal(ambiguous.metadata.shopPOIs.ambiguous,1);
});
