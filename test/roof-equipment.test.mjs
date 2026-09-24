import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placeRoofEquipment} from '../src/city/roof-equipment.mjs';
import {insidePolygon,polygonsOverlap,distanceToSegment} from '../src/spatial.mjs';

const ring=[[0,0],[30,0],[30,20],[0,20],[0,0]],core=[[13.4,8.8],[16.6,8.8],[16.6,11.2],[13.4,11.2]];
function run(height,{billboard}={}){
  const positions=[],state={rooftopEquipment:[],billboards:billboard?[{sourceId:'way/1',footprint:billboard}]:[],rooftopSigns:[]};
  const building={id:'way/1',ring,holes:[],height,lengths:[30,20,30,20],family:'residential'};
  placeRoofEquipment({state},building,{emit:mesh=>positions.push(...mesh.positions)},core);
  return {positions,items:state.rooftopEquipment};
}

test('roof equipment stands on the roof, clear of the parapet, stair core and signs',()=>{
  const billboard=[[4,2],[12,2],[12,3],[4,3]],{positions,items}=run(30,{billboard});
  assert.ok(items.length>0&&items.length<=6);
  for(const {footprint} of items){
    assert.ok(footprint.every(p=>insidePolygon(p,ring)&&ring.slice(1).every((q,i)=>distanceToSegment(p,ring[i],q)>.7)));
    assert.ok(!polygonsOverlap(footprint,core)&&!polygonsOverlap(footprint,billboard));
  }
  for(let i=1;i<positions.length;i+=3)assert.ok(positions[i]>=30-1e-9,'nothing below the roof');
  for(const [i,a] of items.entries())for(const b of items.slice(i+1))assert.ok(!polygonsOverlap(a.footprint,b.footprint));
});

test('roof equipment is deterministic and skipped on low buildings',()=>{
  assert.deepEqual(run(30).items,run(30).items);
  assert.equal(run(6).items.length,0);
});
