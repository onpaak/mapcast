import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildingProfile,architectureTexture,facadeUV} from '../src/architecture.mjs';
const building=(tags={},id='way/123')=>({extras:{sourceId:id,height:12,footprint:[[0,0],[20,0],[20,20],[0,20],[0,0]],osmTags:tags}});
test('OSM use controls architecture and missing tags remain explicitly inferred',()=>{
  for(const [tag,type,ground] of [['apartments','residential','entrance'],['warehouse','industrial','loading'],['office','office','lobby'],['retail','retail','shop'],['detached','house','entrance']]){
    const p=buildingProfile(building({building:tag}));assert.equal(p.type,type);assert.equal(p.ground,ground);assert.match(p.classificationSource,/^osm:/);
  }
  const p=buildingProfile(building({building:'yes',shop:'no',office:'no'}));assert.equal(p.type,'generic');assert.equal(p.classificationSource,'unknown-use');assert.equal(p.ground,'entrance');
  assert.equal(buildingProfile(building({'building:colour':'#123456'})).colorSource,'osm-tag');
  assert.deepEqual(buildingProfile(building({'building:colour':'#123456'})).color,[18,52,86]);
});
test('semantic OSM tags select distinct public and special-purpose architecture',()=>{
  const cases=[
    [{building:'school'},'education','school'],[{amenity:'hospital',building:'yes'},'hospital','emergency'],
    [{tourism:'hotel',building:'yes'},'hotel','hotel'],[{amenity:'place_of_worship',building:'yes'},'religious','worship'],
    [{railway:'station',building:'yes'},'station','station'],[{building:'parking'},'parking','parking'],
    [{building:'sports_hall'},'sports','sports'],[{amenity:'police',building:'yes'},'civic','civic']
  ];
  for(const [tags,type,ground] of cases){const p=buildingProfile(building(tags));assert.equal(p.type,type);assert.equal(p.ground,ground);assert.match(p.classificationSource,/^osm:/);}
  assert.equal(buildingProfile(building({amenity:'place_of_worship',building:'yes'})).roofDetail,'spire');
  assert.equal(buildingProfile(building({amenity:'place_of_worship',building:'yes','roof:shape':'flat'})).roofDetail,'coping');
  assert.equal(buildingProfile(building({healthcare:'hospital',building:'yes'})).roofDetail,'equipment');
});
test('appearance repeats by source ID and ignores generation order',()=>{
  const a=buildingProfile(building()),png=architectureTexture(a).png;
  buildingProfile(building({},'way/456'));
  assert.deepEqual(architectureTexture(buildingProfile(building())).png,png);
  assert.notDeepEqual(architectureTexture(buildingProfile(building({},'way/456'))).png,png);
});
test('buildings with the same template share pixel data while keeping their own tint and UV offset',()=>{
  const a=buildingProfile(building({},'way/123')),b={...a,seed:a.seed+999,color:[12,34,56],uvOffset:a.uvOffset===0?.5:0};
  assert.equal(architectureTexture(a).name,architectureTexture(b).name);
  assert.deepEqual(architectureTexture(a).png,architectureTexture(b).png);
  assert.notDeepEqual(a.color,b.color);assert.notEqual(a.uvOffset,b.uvOffset);
});
test('facade UV remains anchored to building when scene origin changes',()=>{
  const p=buildingProfile(building());
  const a=facadeUV({positions:[10,3,20],normals:[0,0,1]},p,[2,4]);
  const b=facadeUV({positions:[110,3,-30],normals:[0,0,1]},p,[102,-46]);
  assert.deepEqual(a.texcoords,b.texcoords);
});
