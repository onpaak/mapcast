import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {polygonsOverlap,strip,insidePolygon} from '../src/spatial.mjs';
import {boxMesh,standingSign,vendingMachine,vendingAtlas,vendingCells,VENDING_WIDTH} from '../src/street-props.mjs';

const uv={u0:.1,u1:.2,v0:.1,v1:.2};

test('prop boxes face outward and front/back art reads left to right from outside',()=>{
 for(const n of [[0,1],[0,-1]]){
  const mesh=boxMesh({a:[0,0],u:[1,0],n,x0:0,x1:1,d0:0,d1:.5,y0:0,y1:1,faces:{front:uv,back:uv,left:uv,right:uv,top:uv,bottom:uv}});
  assert.equal(mesh.positions.length/9,12);
  for(let i=0;i<mesh.positions.length;i+=9){
   const p=mesh.positions.slice(i,i+3),q=mesh.positions.slice(i+3,i+6).map((v,j)=>v-p[j]),r=mesh.positions.slice(i+6,i+9).map((v,j)=>v-p[j]),normal=mesh.normals.slice(i,i+3);
   assert.ok([q[1]*r[2]-q[2]*r[1],q[2]*r[0]-q[0]*r[2],q[0]*r[1]-q[1]*r[0]].reduce((s,v,j)=>s+v*normal[j],0)>0);
  }
  for(const start of [0,6]){
   const nx=mesh.normals[start*3],nz=mesh.normals[start*3+2];
   const samples=Array.from({length:6},(_,i)=>({right:mesh.positions[(start+i)*3]*nz-mesh.positions[(start+i)*3+2]*nx,u:mesh.texcoords[(start+i)*2]})).sort((a,b)=>a.right-b.right);
   assert.ok(samples.at(-1).u>samples[0].u,'front and back are not mirrored');
  }
 }
});

test('vending texture is its own replaceable pair with a lit front and a 2:3 face',()=>{
 const {color,emissive}=vendingAtlas(),size=color.width;
 assert.equal(color.name,'Vending_machines_512');assert.equal(emissive.name,'Vending_machines_emissive_512');
 const sum=c=>{let s=0;for(let y=Math.floor(c.v0*size);y<Math.floor(c.v1*size);y++)for(let x=Math.floor(c.u0*size);x<Math.floor(c.u1*size);x++)s+=emissive.rgba[(y*size+x)*4];return s;};
 assert.ok(sum(vendingCells.front)>0);assert.equal(sum(vendingCells.side),0);
 const f=vendingCells.front;assert.ok(Math.abs((f.u1-f.u0)/(f.v1-f.v0)-VENDING_WIDTH/1.83)<.01,'art aspect matches the modelled face');
});

test('standing lightbox reaches eye level; vending machine stands in front of the wall',()=>{
 const stand=standingSign({a:[0,0],u:[1,0],n:[0,1],along:1,offset:1,sign:{aspect:1,uv}});
 assert.ok(stand.height>=1.2);assert.ok(Math.max(...stand.faces.positions.filter((_,i)=>i%3===1))>1);
 const machine=vendingMachine({a:[0,0],u:[1,0],n:[0,1],along:2});
 assert.ok(machine.footprint.every(([,z])=>z>0));
});

test('generated pavement props avoid carriageways and no cables are generated',()=>{
 const street={id:'way/500',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,.00022],[.0006,.00022]]}};
 let found;
 for(let i=1;i<60&&!found;i++){
  // A shop block (standing lightboxes) faces a residential block (vending machines).
  const block=(id,building,lat)=>({id,properties:{building,'building:levels':'6'},geometry:{type:'Polygon',coordinates:[[[0,lat],[.0004,lat],[.0004,lat+.00012],[0,lat+.00012],[0,lat]]]}});
  const data={type:'FeatureCollection',selectionBounds:[-.0003,-.0001,.0007,.0006],features:[block(`way/${i}`,'retail',.0001-.00012),block(`way/${i+100}`,'apartments',.00034),street]};
  const base=generate(data),scene=concreteCity(base),p=scene.metadata.streetProps;
  if(p.standingSigns.length&&p.vendingMachines.length)found={base,scene};
 }
 assert.ok(found,'some layout produces standing signs and vending machines');
 const {base,scene}=found,props=scene.metadata.streetProps;
 const road=base.objects.find(o=>o.extras?.path),carriageway=road.extras.path.slice(1).map((b,i)=>strip(road.extras.path[i],b,road.extras.width));
 for(const item of [...props.vendingMachines,...props.standingSigns])assert.ok(!carriageway.some(r=>polygonsOverlap(item.footprint,r)));
 assert.ok(scene.objects.some(o=>o.name.endsWith('_Vending')&&scene.materials[o.material].name==='Vending machines'));
 assert.ok(!scene.objects.some(o=>/cable/i.test(o.name))&&!('cables' in props));
});

test('pavement props stand fully on the slab or fully on the ground, never across the kerb',async()=>{
 const {PAVEMENT_TOP}=await import('../src/ps2.mjs');
 const street={id:'way/500',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,.00022],[.0006,.00022]]}};
 const block=(id,building,lat)=>({id,properties:{building,'building:levels':'6'},geometry:{type:'Polygon',coordinates:[[[0,lat],[.0004,lat],[.0004,lat+.00012],[0,lat+.00012],[0,lat]]]}});
 let checked=0;
 for(let i=1;i<40;i++){
  const scene=concreteCity(generate({type:'FeatureCollection',selectionBounds:[-.0003,-.0001,.0007,.0006],features:[block(`way/${i}`,'retail',.0001-.00012),block(`way/${i+100}`,'apartments',.00034),street]}));
  const slabs=scene.objects.filter(o=>/^Sidewalk/.test(o.name)).flatMap(o=>{const t=[];for(let k=0;k<o.positions.length;k+=9)if(o.normals[k+1]>.9&&o.positions[k+1]>PAVEMENT_TOP-.01)t.push([[o.positions[k],o.positions[k+2]],[o.positions[k+3],o.positions[k+5]],[o.positions[k+6],o.positions[k+8]],[o.positions[k],o.positions[k+2]]]);return t;});
  for(const item of [...scene.metadata.streetProps.vendingMachines,...scene.metadata.streetProps.standingSigns]){
   const on=item.footprint.map(q=>slabs.some(t=>insidePolygon(q,t)));
   assert.ok(on.every(Boolean)||!on.some(Boolean),'footprint does not straddle the kerb');checked++;
  }
 }
 assert.ok(checked>0);
});

test('low-rise neighbourhoods keep only shop signage',()=>{
 // A cluster of two-storey houses along a street: no towers, rooftop letters or billboards.
 const houses=Array.from({length:8},(_,i)=>({id:`way/${700+i}`,properties:{building:'house'},geometry:{type:'Polygon',coordinates:[[[i*.0002,0],[i*.0002+.00012,0],[i*.0002+.00012,.0001],[i*.0002,.0001],[i*.0002,0]]]}}));
 const street={id:'way/799',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,-.00008],[.0018,-.00008]]}};
 const scene=concreteCity(generate({type:'FeatureCollection',selectionBounds:[-.0003,-.0003,.0019,.0003],features:[...houses,street]}));
 assert.equal(scene.metadata.streetSigns.length,0);assert.equal(scene.metadata.rooftopSigns.length,0);assert.equal(scene.metadata.billboards.length,0);
 assert.equal(scene.metadata.streetProps.vendingMachines.length,0);
});
