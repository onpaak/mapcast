import test from 'node:test';
import assert from 'node:assert/strict';
import {crossingMarked,zebraCrossings,CROSSING_DEPTH} from '../src/crossings.mjs';

test('only crossings mapped with paint are marked',()=>{
  assert.ok(crossingMarked({highway:'crossing',crossing:'zebra'}));
  assert.ok(crossingMarked({highway:'crossing',crossing:'traffic_signals'}));
  assert.ok(crossingMarked({highway:'crossing','crossing:markings':'dashes'}));
  assert.equal(crossingMarked({highway:'crossing',crossing:'traffic_signals','crossing:markings':'no'}),false);
  assert.equal(crossingMarked({highway:'crossing',crossing:'unmarked'}),false);
  assert.equal(crossingMarked({highway:'crossing'}),false,'unknown markings are not guessed');
  assert.equal(crossingMarked({railway:'crossing'}),false);
});

test('a zebra spans the carriageway, stays clear of the cross road and skips what it cannot place',()=>{
  const main={a:[-50,0],b:[50,0],width:10,road:'Road_main'},side={a:[0,0],b:[0,40],width:7,road:'Road_side'};
  const points=[
    {id:'node/1',point:[-20,0],tags:{highway:'crossing',crossing:'zebra'}},
    {id:'node/2',point:[-6,0],tags:{highway:'crossing',crossing:'zebra'}},
    {id:'node/3',point:[20,0],tags:{highway:'crossing','crossing:markings':'no'}},
    {id:'node/4',point:[20,6],tags:{highway:'crossing',crossing:'zebra'}}];
  const {objects,records}=zebraCrossings(points,[main,side],7);
  const rec=id=>records.find(r=>r.sourceId===id);
  assert.equal(rec('node/1').status,'generated');assert.equal(rec('node/1').bars,9);
  assert.equal(rec('node/2').status,'generated','slid out of the junction');
  assert.equal(rec('node/3').reason,'not marked as painted');assert.equal(rec('node/4').reason,'not on a generated carriageway');
  const p=objects[0].positions;
  for(let i=0;i<p.length;i+=3){
    assert.ok(Math.abs(p[i+2])<=4.7+1e-6,'inside the carriageway');
    // No bar on the side road's carriageway (x within 3.5 m of 0, z > 0).
    assert.ok(!(Math.abs(p[i])<3.5-1e-6&&p[i+2]>5+1e-6));
  }
  assert.ok(objects[0].normals.every((v,i)=>i%3!==1||v===1));
  const xs=[];for(let i=0;i<p.length;i+=3)if(p[i]<-10)xs.push(p[i]);
  assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-CROSSING_DEPTH)<1e-6);
});

test('signal parts face the way their normals say',async()=>{
  const {signalMeshes}=await import('../src/traffic-signals.mjs');
  for(const mesh of Object.values(signalMeshes()))for(let i=0;i<mesh.positions.length;i+=9){
    const p=mesh.positions,a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    assert.ok(n[0]*mesh.normals[i]+n[1]*mesh.normals[i+1]+n[2]*mesh.normals[i+2]>0);
  }
});

test('signal heads face back across the junction, poles on the kerb of the traffic they serve',async()=>{
  const {placeSignals}=await import('../src/traffic-signals.mjs');
  const roads=[{a:[-40,0],b:[0,0],width:8,road:'w'},{a:[0,0],b:[40,0],width:8,road:'e'},{a:[0,-40],b:[0,0],width:8,road:'n'},{a:[0,0],b:[0,40],width:8,road:'s'}];
  const {poles}=placeSignals([{id:'node/9',point:[0,0],tags:{highway:'traffic_signals'}}],roads,{onPavement:()=>true,inBuilding:()=>false,origin:[13.4,52.5]});
  assert.equal(poles.length,4);
  for(const p of poles){
    // Local +x after the yaw points from the pole back towards the junction centre.
    const f=[Math.cos(p.yaw),-Math.sin(p.yaw)],toCentre=[-p.position[0],-p.position[1]],l=Math.hypot(...toCentre);
    const along=Math.abs(p.position[0])>Math.abs(p.position[1])?[-Math.sign(p.position[0]),0]:[0,-Math.sign(p.position[1])];
    assert.ok(f[0]*along[0]+f[1]*along[1]>.99,'faces along its road, back across the junction');
    assert.ok(l>4,'outside the junction');
  }
  // Right-hand traffic: the east road's pole serves traffic heading east, so it stands on the
  // south kerb (+z is south in scene coordinates, the right of an eastbound driver).
  const east=poles.find(p=>p.position[0]>4);assert.ok(east.position[1]>0);
});
