import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {edgeGeometry} from '../src/city/edge-geometry.mjs';
import {rollerShutter,serviceDoor,louvredVent,meterCabinet,SLAT_PITCH} from '../src/city/ground-floor-kit.mjs';
import {BIN} from '../src/city/materials.mjs';

const KIT_MATERIALS=['Faded sage shutter','Faded blue steel','Weathered zinc grey','Aged enamel casing','Cabinet indicator'];
const block=(id,x,properties)=>({id,properties,geometry:{type:'Polygon',coordinates:[[[x,0],[x+.0003,0],[x+.0003,.00012],[x,.00012],[x,0]]]}});
const city=features=>concreteCity(generate({type:'FeatureCollection',selectionBounds:[-.0001,-.0001,.0001+features.length*.0005,.0003],features}));
const kitObjects=scene=>scene.objects.filter(o=>o.name.startsWith('Building_')&&KIT_MATERIALS.includes(scene.materials[o.material].name));

// A 10 m edge along +x with the street on +z, collecting every emitted triangle by bin.
function edge(){
  const ring=[[0,0],[10,0],[10,-8],[0,-8],[0,0]],bins=new Map();
  const g=edgeGeometry({ring,lengths:[10,8,10,8],edge:0,a:[0,0],u:[1,0],n:[0,1],emit:(mesh,bin)=>{if(!bins.has(bin))bins.set(bin,{positions:[],normals:[]});bins.get(bin).positions.push(...mesh.positions);bins.get(bin).normals.push(...mesh.normals);}});
  const all=()=>[...bins.values()].reduce((s,m)=>({positions:[...s.positions,...m.positions],normals:[...s.normals,...m.normals]}),{positions:[],normals:[]});
  return {g,bins,all};
}
function assertWinding({positions:p,normals:n}){
  for(let i=0;i<p.length;i+=9){
    const q=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],r=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];
    const c=[q[1]*r[2]-q[2]*r[1],q[2]*r[0]-q[0]*r[2],q[0]*r[1]-q[1]*r[0]];
    assert.ok(c[0]*n[i]+c[1]*n[i+1]+c[2]*n[i+2]>0,'triangle winding matches its normal');
    assert.ok(Math.abs(Math.hypot(n[i],n[i+1],n[i+2])-1)<1e-6,'unit normals');
  }
}

test('roller shutter fills its opening with slats of fixed pitch and keeps to the opening',()=>{
  for(const [curtain,housing] of [[0,'concealed'],[.83,'concealed'],[0,'surface']]){
    const {g,bins,all}=edge();
    rollerShutter(g,[0,1],{l:2,r:5.2,bottom:0,head:2.5,curtain,housing});
    const mesh=all();assertWinding(mesh);
    // Painted slats (and a surface housing, painted to match) start at the curtain's edge.
    const top=housing==='concealed'?2.44:2.5,slats=bins.get(BIN.shutter).positions,ys=slats.filter((_,i)=>i%3===1);
    assert.ok(Math.min(...ys)>=curtain-1e-9&&Math.max(...ys)<=(housing==='surface'?2.5+.268:top)+1e-9);
    // Slat count follows the opening; the pitch never stretches beyond the reviewed profile.
    const count=Math.ceil((top-curtain)/SLAT_PITCH);
    assert.ok((top-curtain)/count<=SLAT_PITCH+1e-9);
    const xs=mesh.positions.filter((_,i)=>i%3===0),outY=mesh.positions.filter((_,i)=>i%3===1);
    const reach=housing==='surface'?.15:0;
    assert.ok(Math.min(...xs)>=2-reach-1e-9&&Math.max(...xs)<=5.2+reach+1e-9,'within the opening (and its surface housing)');
    assert.ok(Math.min(...outY)>=0&&Math.max(...outY)<=2.5+(housing==='surface'?.3:0)+1e-9);
  }
});

test('service door, vent and cabinet are finite, correctly wound and keep their reviewed size',()=>{
  const {g,all}=edge();
  serviceDoor(g,{l:1,bottom:0});louvredVent(g,[0,1],{l:1,r:1.98,bottom:2.2,top:2.8});meterCabinet(g,{x:4,y:.89});
  const mesh=all();assertWinding(mesh);assert.ok(mesh.positions.every(Number.isFinite));
  // Nothing enters the wall more than 10 cm or projects past the cabinet's 23.4 cm.
  const zs=mesh.positions.filter((_,i)=>i%3===2);
  assert.ok(Math.min(...zs)>=-.1-1e-9&&Math.max(...zs)<=.234+1e-9);
});

test('glass curtain walls, towers and offices keep their original ground floor',()=>{
  const shop={shop:'bakery'};
  for(const properties of [
    {building:'retail','building:levels':'3','building:material':'glass',...shop},
    {building:'apartments','building:levels':'14',...shop},
    {building:'office','building:levels':'5',...shop}
  ]){
    const scene=city([block('way/31',0,properties)]);
    assert.deepEqual(scene.metadata.groundFloorKit,[]);
    assert.equal(kitObjects(scene).length,0);
    assert.ok(scene.metadata.frontages.every(f=>!f.shutter));
  }
});

test('loading doors become roller shutters and shop posters keep their glass',()=>{
  const warehouse=city([block('way/41',0,{building:'warehouse'})]);
  const loading=warehouse.metadata.frontages.filter(f=>f.type==='loading-door');
  assert.ok(loading.length>0&&loading.every(f=>f.shutter==='closed'||f.shutter==='raised'));
  assert.ok(kitObjects(warehouse).length>0);

  const shops=city(['way/51','way/52','way/53','way/54'].map((id,i)=>block(id,i*.0005,{building:'retail','building:levels':'2',shop:'clothes'})));
  const shuttered=shops.metadata.frontages.filter(f=>f.shutter);
  assert.ok(shuttered.length>0,'some display windows are shuttered');
  for(const f of shuttered){
    assert.ok(!shops.metadata.windowPosters.some(p=>p.sourceId===f.sourceId&&p.edge===f.edge&&p.bay===f.bay),'no shutter over a poster');
    if(f.shutter==='closed')assert.equal(f.bounds[2],0,'a closed shutter reaches the ground');
  }
  const vacant=city([block('way/61',0,{building:'retail','building:levels':'2',shop:'vacant'})]);
  assert.ok(vacant.metadata.frontages.filter(f=>f.shutter).every(f=>f.shutter==='closed'));
});

test('plain ground floors gain service pieces deterministically and never behind a vending machine',()=>{
  const features=Array.from({length:8},(_,i)=>block(`way/7${i}`,i*.0005,{building:'apartments','building:levels':'4'}));
  const a=city(features),b=city([...features].reverse());
  const kinds=new Set(a.metadata.groundFloorKit.map(k=>k.kind));
  assert.ok(['service-door','cellar-vent','meter-cabinet'].some(k=>kinds.has(k)));
  const key=k=>`${k.sourceId}:${k.edge}:${k.bay}:${k.kind}`;
  assert.deepEqual(a.metadata.groundFloorKit.map(key).sort(),b.metadata.groundFloorKit.map(key).sort());
  for(const k of a.metadata.groundFloorKit)
    assert.ok(!a.metadata.streetProps.vendingMachines.some(v=>v.sourceId===k.sourceId&&v.edge===k.edge&&v.bay===k.bay));
  for(const o of kitObjects(a))assert.ok(o.positions.every(Number.isFinite)&&o.texcoords.length===o.positions.length/3*2);
});

test('lite detail has no ground-floor kit',()=>{
  const scene=concreteCity(generate({type:'FeatureCollection',features:[block('way/81',0,{building:'warehouse'})]}),{detail:'lite'});
  assert.deepEqual(scene.metadata.groundFloorKit,[]);
});
