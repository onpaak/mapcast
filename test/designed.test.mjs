import test from 'node:test';
import assert from 'node:assert/strict';
import {slabA,towerC,rectangle} from '../src/city/designed.mjs';
import {stableSeed} from '../src/architecture.mjs';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';

const m=1/111195;
// Building ids that the half-by-id rule does or does not pick.
const ids=(want,count)=>{const out=[];for(let i=1;out.length<count;i++)if((stableSeed(`way/${i}:designed`)%2===0)===want)out.push(`way/${i}`);return out;};
const block=(id,x,z,l,d,tags)=>({type:'Feature',id,properties:{building:'apartments',...tags},geometry:{type:'Polygon',coordinates:[[[x*m,-z*m],[(x+l)*m,-z*m],[(x+l)*m,-(z+d)*m],[x*m,-(z+d)*m],[x*m,-z*m]]]}});
// A street along x through the origin (+z is south) and buildings south of it.
function city(buildings){
  const road={type:'Feature',id:'way/9999',properties:{highway:'residential',width:'8'},geometry:{type:'LineString',coordinates:[[-120*m,0],[120*m,0]]}};
  return concreteCity(generate({type:'FeatureCollection',selectionBounds:[-125*m,-60*m,125*m,60*m],features:[road,...buildings]}));
}
const facing=objects=>objects.every(o=>{const p=o.positions;for(let i=0;i<p.length;i+=9){const a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]],n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];if(Math.hypot(...n)>1e-9&&n[0]*o.normals[i]+n[1]*o.normals[i+1]+n[2]*o.normals[i+2]<=0)return false;}return true;});

test('the models stretch by bays and floors and every face points the way its normal says',()=>{
  const small=slabA({length:22,depth:9,floors:2}),long=slabA({length:46,depth:13,floors:6});
  assert.ok(long.signFaces[0].bays>small.signFaces[0].bays&&long.roof>small.roof);
  // Every sign face points away from the model: its outward normal leads out of the footprint.
  for(const [model,L,D] of [[long,46,13],[towerC({length:17,depth:15,floors:6}),17,15]])for(const f of model.signFaces){
    const out=[f.dir[1],-f.dir[0]],mid=[f.a[0]+f.dir[0]*f.len/2+out[0]*.5,f.a[1]+f.dir[1]*f.len/2+out[1]*.5];
    assert.ok(Math.abs(mid[0])>L/2-1e-6||Math.abs(mid[1])>Math.abs(f.a[1])+.4||Math.abs(mid[0])>Math.abs(f.a[0])+.4,'outward');
  }
  for(const model of [small,long,towerC({length:17,depth:15,floors:6}),towerC({length:24,depth:16,floors:12,shops:true})])assert.ok(facing(model.parts.filter(p=>p.positions.length)));
  const r=rectangle([[0,0],[20,0],[20,10],[0,10],[0,0]]);
  assert.deepEqual([r.length,r.depth].map(v=>+v.toFixed(6)),[20,10]);
});

test('long plain blocks become slab A, tall square ones tower C, half of them by id',()=>{
  const [slabId,towerId,shopTowerId,northId]=ids(true,4),[skipped]=ids(false,1);
  const scene=city([
    block(slabId,-110,10,34,11,{'building:levels':'5'}),
    block(towerId,-50,10,18,15,{'building:levels':'10'}),
    block(shopTowerId,10,10,18,15,{'building:levels':'10'}),{type:'Feature',id:'node/1',properties:{shop:'bakery',name:'Bakery'},geometry:{type:'Point',coordinates:[19*m,-17*m]}},
    block(skipped,60,10,34,11,{'building:levels':'5'}),
    // North of the street the model is mirrored to keep its front on the street.
    block(northId,-50,-25,18,15,{'building:levels':'10'})]);
  const layout=id=>scene.metadata.concreteFamilies.find(f=>f.sourceId===id).layout;
  assert.equal(layout(slabId),'slab-a');assert.equal(layout(towerId),'tower-c');
  assert.notEqual(layout(skipped),'slab-a','the other half stays procedural');
  const parts=id=>scene.objects.filter(o=>o.extras?.sourceId===id&&o.extras.designedModel);
  assert.ok(parts(slabId).length&&parts(towerId).length&&facing(parts(towerId))&&facing(parts(slabId)));
  assert.ok(facing(parts(northId)),'mirrored faces keep their winding');
  const north=parts(northId).flatMap(o=>o.positions.filter((_,i)=>i%3===2));
  assert.ok(Math.max(...north)>-9,'the mirrored entrance slab also reaches towards the street');
  assert.ok(!scene.objects.some(o=>o.name===`Building_${slabId}_FacadeAtlas`),'a designed model replaces the painted facade');
  // The front faces the street (z = 0): the tower's entrance slab reaches out past its footprint (z = 10).
  const zs=parts(towerId).flatMap(o=>o.positions.filter((_,i)=>i%3===2));
  assert.ok(Math.min(...zs)<9,'the entrance slab reaches towards the street');
  // Shops keep their row of shop windows.
  const names=new Set(parts(shopTowerId).map(o=>scene.materials[o.material].name));
  assert.ok(names.has('Shop display glass'));
});

test('a slab never stands against a neighbour; a tower may when its footprint is a near-perfect rectangle',()=>{
  const [slabId,towerId,neighbour]=ids(true,3);
  const scene=city([
    block(slabId,-100,10,34,11,{'building:levels':'5'}),block('way/90001',-66,10,10,11,{'building:levels':'3'}),
    block(towerId,0,10,18,15,{'building:levels':'10'}),block(neighbour,18,10,10,15,{'building:levels':'3'})]);
  const layout=id=>scene.metadata.concreteFamilies.find(f=>f.sourceId===id).layout;
  assert.notEqual(layout(slabId),'slab-a');
  assert.equal(layout(towerId),'tower-c');
});

test('designed models can be turned off',()=>{
  const [id]=ids(true,1),road={type:'Feature',id:'way/9999',properties:{highway:'residential',width:'8'},geometry:{type:'LineString',coordinates:[[-120*m,0],[120*m,0]]}};
  const scene=concreteCity(generate({type:'FeatureCollection',selectionBounds:[-125*m,-60*m,125*m,60*m],features:[road,block(id,-20,10,34,11,{'building:levels':'5'})]}),{designed:false});
  assert.ok(!scene.objects.some(o=>o.extras?.designedModel));
});
