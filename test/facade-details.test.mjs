import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facadeDetails} from '../src/facade-details.mjs';
import {insidePolygon} from '../src/spatial.mjs';
const building={name:'Building_test',extras:{sourceId:'way/1',height:12,footprint:[[0,0],[20,0],[20,10],[0,10],[0,0]]}};
const profile={type:'residential',variant:1,bayWidth:2.5,floorHeight:3,floors:4};
const make=(others=[],roads=[])=>facadeDetails(building,[0,0],[20,0],[0,-1],profile,[building,...others],roads,0);
test('facade details are finite outward geometry with traceable deterministic provenance',()=>{
  const a=make();assert.deepEqual(a,make());
  for(const kind of ['Cornice','BeltCourse','WindowSill','Balcony'])assert.ok(a.some(o=>o.extras.detail===kind));
  for(const o of a){
    assert.equal(o.extras.sourceId,'way/1');assert.ok(o.positions.every(Number.isFinite));
    for(let i=0;i<o.positions.length;i+=3){assert.ok(o.positions[i+2]<0);assert.ok(o.positions[i+1]>0&&o.positions[i+1]<12);}
    for(let i=0;i<o.positions.length;i+=9){const p=o.positions.slice(i,i+3),u=o.positions.slice(i+3,i+6).map((v,j)=>v-p[j]),v=o.positions.slice(i+6,i+9).map((v,j)=>v-p[j]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(n.reduce((s,x,j)=>s+x*o.normals[i+j],0)>0);}
  }
});
test('facade additions stop before adjacent buildings and carriageway',()=>{
  const neighbor={extras:{footprint:[[8,-2],[12,-2],[12,.01],[8,.01],[8,-2]]}};
  const objects=make([neighbor],[{a:[-10,-1.5],b:[30,-1.5],width:2}]);
  assert.ok(objects.length);assert.ok(!objects.some(o=>o.extras.detail==='Balcony'));
  for(const o of objects)for(let i=0;i<o.positions.length;i+=3){assert.ok(o.positions[i+2]>-.5);assert.equal(insidePolygon([o.positions[i],o.positions[i+2]],neighbor.extras.footprint),false);}
  assert.equal(make([],[{a:[-10,-1],b:[30,-1],width:2}]).length,0);
});
test('institutional frontages receive a shallow inferred entrance canopy',()=>{
  for(const type of ['education','hospital','hotel','station']){
    const p={...profile,type};const details=facadeDetails(building,[0,0],[20,0],[0,-1],p,[building],[],0);
    assert.ok(details.some(o=>o.extras.detail==='EntranceCanopy'),type);
  }
});
