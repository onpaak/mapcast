import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insidePolygon,polygonsOverlap,strip,blocked} from '../src/spatial.mjs';
import {sidewalks,sidewalkCorners,buildingDetails} from '../src/streetscape.mjs';
test('polygon collision detects crossing edges even without interior vertices',()=>{
  assert.ok(polygonsOverlap([[-3,-.5],[3,-.5],[3,.5],[-3,.5]],[[-.5,-3],[.5,-3],[.5,3],[-.5,3]]));
  assert.equal(insidePolygon([2,2],[[0,0],[1,0],[1,1],[0,1]]),false);
  assert.ok(blocked([1.2,.5],[[[0,0],[1,0],[1,1],[0,1]]],.3));
});
test('raised sidewalk avoids crossing carriageway and building footprints',()=>{
  const segments=[{a:[-20,0],b:[20,0],width:6},{a:[0,-20],b:[0,20],width:8}];
  const footprint=[[10,3],[18,3],[18,8],[10,8]];
  const {objects,pads}=sidewalks(segments,[footprint],0);
  assert.ok(objects.length);assert.ok(pads.length);
  for(const pad of pads){assert.equal(polygonsOverlap(pad,footprint),false);for(const s of segments)assert.equal(polygonsOverlap(pad,strip(s.a,s.b,s.width)),false);}
  const ys=objects.flatMap(o=>o.positions.filter((_,i)=>i%3===1));assert.ok(Math.abs(Math.max(...ys)-.175)<1e-8);
});
test('storefront triangles face outward; rooftop unit stays inside footprint',()=>{
  const b={name:'Building_test',extras:{height:12,footprint:[[0,0],[20,0],[20,10],[0,10],[0,0]]}};
  const details=buildingDetails([b],[{a:[0,-8],b:[20,-8],width:6}],{shop:1,trim:2,roofEquipment:3});
  assert.ok(details.some(o=>o.name.includes('_Shop_')));
  for(const o of details.filter(o=>o.name.includes('_Shop_')))for(let i=0;i<o.positions.length;i+=9){
    const p=o.positions.slice(i,i+3),q=o.positions.slice(i+3,i+6),r=o.positions.slice(i+6,i+9),u=q.map((v,j)=>v-p[j]),v=r.map((v,j)=>v-p[j]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert.ok(n.reduce((s,v,j)=>s+v*o.normals[i+j],0)>0);
    assert.equal(insidePolygon([p[0]+o.normals[i]*.1,p[2]+o.normals[i+2]*.1],b.extras.footprint),false);
  }
  const unit=details.find(o=>o.name.endsWith('_RoofUnit'));assert.ok(unit);
  for(let i=0;i<unit.positions.length;i+=3)assert.ok(insidePolygon([unit.positions[i],unit.positions[i+2]],b.extras.footprint));
});
test('residential frontage gets one complete standalone door assembly',()=>{
  const b={name:'Building_home',extras:{sourceId:'way/7',height:12,footprint:[[0,0],[20,0],[20,10],[0,10],[0,0]]}};
  const profile={type:'residential',ground:'entrance',roofDetail:'coping',variant:1,seed:1234,floorHeight:3,bayWidth:2.5,floors:4};
  const materials={door:4,glass:5,frame:6,handle:7};
  const details=buildingDetails([b],[{a:[0,-8],b:[20,-8],width:6}],{shop:1,trim:2,roofEquipment:3,buildingMaterials:new Map([[b.name,{profile}] ]),entranceMaterials:materials});
  const doors=details.filter(object=>object.name.includes('_Door'));
  assert.deepEqual(doors.map(object=>object.name),['Building_home_DoorSlab','Building_home_DoorGlass','Building_home_DoorFrameLeft','Building_home_DoorFrameRight','Building_home_DoorFrameTop','Building_home_DoorThreshold','Building_home_DoorHandle']);
  assert.ok(!details.some(object=>object.name.includes('_Entrance_')));
  assert.ok(doors.every(object=>object.positions.every(Number.isFinite)&&object.extras.detail==='MainEntrance'));
  const slab=doors[0],ys=slab.positions.filter((_,index)=>index%3===1);assert.ok(Math.min(...ys)<.2&&Math.max(...ys)>2.5);
});
test('religious profile adds a finite inferred spire above a valid roof center',()=>{
  const b={name:'Building_worship',extras:{sourceId:'way/9',height:12,footprint:[[0,0],[20,0],[20,10],[0,10],[0,0]]}};
  const profile={type:'religious',ground:'worship',roofDetail:'spire',variant:0,floorHeight:4,bayWidth:4,floors:3};
  const details=buildingDetails([b],[{a:[0,-8],b:[20,-8],width:6}],{shop:1,trim:2,roofEquipment:3,buildingMaterials:new Map([[b.name,{profile,ground:1}]])});
  const spire=details.find(o=>o.name.endsWith('_Spire'));assert.ok(spire);assert.ok(spire.positions.every(Number.isFinite));
  assert.ok(Math.max(...spire.positions.filter((_,i)=>i%3===1))>b.extras.height);
});
test('sidewalk corner pads stay outside carriageways and buildings',()=>{
  const segments=[{a:[-20,0],b:[0,0],width:8,road:'west'},{a:[0,0],b:[20,0],width:8,road:'east'},{a:[0,-20],b:[0,0],width:8,road:'south'}];
  const junctions=[{name:'Junction_0',extras:{center:[0,0],radius:4.35}}],footprint=[[4,4],[10,4],[10,10],[4,10]];
  const result=sidewalkCorners(junctions,segments,[footprint],3);assert.ok(result.objects.length);assert.ok(result.pads.length);
  for(const pad of result.pads){assert.equal(polygonsOverlap(pad,footprint),false);for(const s of segments)assert.equal(polygonsOverlap(pad,strip(s.a,s.b,s.width+.25)),false);}
});
