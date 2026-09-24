import test from 'node:test';
import assert from 'node:assert/strict';
import {roadWidth,roadSurface,junctionPatches} from '../src/road-network.mjs';

test('road width prefers OSM width, then lanes, then highway class',()=>{
  assert.deepEqual(roadWidth({highway:'residential',width:'8.5'}),{width:8.5,widthSource:'width'});
  assert.equal(roadWidth({width:`8'0"`}).width,2.5);
  assert.deepEqual(roadWidth({highway:'primary',lanes:'3'}),{width:9.600000000000001,widthSource:'lanes'});
  assert.deepEqual(roadWidth({highway:'secondary'}),{width:10,widthSource:'class-default'});
});

test('junction patches cover shared T and crossroad endpoints',()=>{
  const segments=[
    {a:[-10,0],b:[0,0],width:8,road:'main'},
    {a:[0,0],b:[10,0],width:8,road:'main'},
    {a:[0,-8],b:[0,0],width:6,road:'side'}
  ];
  const patches=junctionPatches(segments);
  assert.equal(patches.length,1);
  assert.deepEqual(patches[0].extras.incidentRoads,['main','side']);
  assert.ok(patches[0].positions.every(Number.isFinite));
  assert.ok(patches[0].positions.some((v,i)=>i%3===1&&v===.03));
});

test('a bend in one road does not create a junction patch',()=>{
  assert.equal(junctionPatches([
    {a:[-5,0],b:[0,0],width:7,road:'same'},
    {a:[0,0],b:[3,4],width:7,road:'same'}
  ]).length,0);
});

test('road surface maps OSM values to shared visual families',()=>{
  assert.deepEqual(roadSurface({surface:'sett'}),{kind:'stone',source:'sett'});
  assert.deepEqual(roadSurface({surface:'concrete:plates'}),{kind:'concrete',source:'concrete:plates'});
  assert.equal(roadSurface({surface:'gravel'}).kind,'dirt');
  assert.deepEqual(roadSurface({}),{kind:'asphalt',source:'default'});
});

test('junction surface follows incident road widths instead of a generic octagon',()=>{
  const segments=[{a:[0,0],b:[20,0],width:12,road:'east'},{a:[0,0],b:[-20,0],width:12,road:'west'},{a:[0,0],b:[0,20],width:5,road:'north'}];
  const [junction]=junctionPatches(segments);
  const xs=junction.positions.filter((_,index)=>index%3===0),zs=junction.positions.filter((_,index)=>index%3===2);
  assert.ok(Math.max(...xs)-Math.min(...xs)<Math.max(...zs)-Math.min(...zs)*2);
  assert.ok(junction.normals.every((value,index)=>index%3!==1||value>0));
});
