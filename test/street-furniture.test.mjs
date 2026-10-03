import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {fromOverpass,buildQuery} from '../src/osm.mjs';
import {furnitureKind} from '../src/street-furniture.mjs';
import {PAVEMENT_TOP} from '../src/ps2.mjs';

// A street with a pavement, one building, and mapped furniture on and off the pavement.
const node=(id,lon,lat,tags)=>({type:'node',id,lon,lat,tags});
function area(extra=[]){
  const nodes=[node(1,0,-.0001),node(2,.0012,-.0001),node(10,.0002,0),node(11,.0005,0),node(12,.0005,.0001),node(13,.0002,.0001)];
  const ways=[{type:'way',id:100,nodes:[1,2],tags:{highway:'residential',width:'6'}},{type:'way',id:101,nodes:[10,11,12,13,10],tags:{building:'apartments','building:levels':'3'}}];
  return fromOverpass({elements:[...nodes,...ways,...extra]},{bounds:[-.0002,-.0003,.0014,.0003]});
}
const city=extra=>concreteCity(generate(area(extra)));

test('furniture tags map to the kit; walls, hedges, kerbs and bollards are not modelled',()=>{
  assert.equal(furnitureKind({amenity:'bench'}),'bench');
  assert.equal(furnitureKind({amenity:'waste_basket'}),'litter-bin');
  assert.equal(furnitureKind({barrier:'bollard'}),null);assert.equal(furnitureKind({barrier:'bollard'},'LineString'),null);
  assert.equal(furnitureKind({barrier:'fence'},'LineString'),'railing');
  for(const barrier of ['wall','hedge','kerb','retaining_wall'])assert.equal(furnitureKind({barrier},'LineString'),null);
  assert.equal(furnitureKind({amenity:'bicycle_parking'},'Polygon'),'bicycle-parking');
  assert.match(buildQuery([13.4,52.52,13.402,52.522]),/waste_basket/);assert.match(buildQuery([13.4,52.52,13.402,52.522]),/barrier"~"\^\(fence/);
});

test('mapped benches and bins stand on the pavement, face the street and never stand on the road',()=>{
  const scene=city([
    node(20,.0001,-.00006,{amenity:'bench'}),node(21,.0008,-.00006,{amenity:'waste_basket'}),
    node(22,.0010,-.00004,{amenity:'bench',direction:'90'}),
    node(23,.0006,-.0001,{amenity:'bench'}),node(24,.0009,-.00006,{amenity:'bench',indoor:'yes'})
  ]);
  const rec=id=>scene.metadata.streetFurniture.find(r=>r.sourceId===id);
  assert.equal(rec('node/20').status,'generated');assert.equal(rec('node/21').status,'generated');
  // No direction tag: face the nearest mapped road (south of the bench, towards +z).
  assert.equal(rec('node/20').orientationSource,'inferred from nearest mapped path');
  assert.ok(Math.cos(rec('node/20').yaw)>.9,'bench faces the road');
  // direction=90 (east) is respected.
  assert.ok(Math.sin(rec('node/22').yaw)>.99);
  assert.equal(rec('node/23').status,'skipped');assert.match(rec('node/23').reason,/road/);
  assert.equal(rec('node/24').status,'skipped');
  for(const r of scene.metadata.streetFurniture.filter(r=>r.status==='generated'&&r.base!==undefined))assert.ok([0,PAVEMENT_TOP].includes(r.base));
  const objects=scene.objects.filter(o=>o.extras?.sceneModule==='StreetFurniture');
  assert.ok(objects.some(o=>o.name==='StreetFurniture_bench_wood'));
  for(const o of objects){assert.ok(o.positions.every(Number.isFinite));assert.equal(o.texcoords.length,o.positions.length/3*2);}
  // Skipped pieces are reported as omissions with their reason.
  assert.ok(scene.metadata.omissions.some(w=>w.id==='node/23'&&/Street furniture/.test(w.reason)));
});

test('railings open at mapped gates, stop at the carriageway and use one alpha-cut bar panel',()=>{
  const line=[node(30,.0006,.0002),node(31,.0006,-.0002),node(32,.0006,0,{barrier:'gate'})];
  const scene=city([...line,{type:'way',id:300,nodes:[30,32,31],tags:{barrier:'fence'}}]);
  const rec=scene.metadata.streetFurniture.find(r=>r.kind==='railing');
  assert.equal(rec.status,'generated');assert.equal(rec.openings,1);assert.ok(rec.leftOut>1,'gap for the gate and the road');
  assert.equal(rec.height,1.47);
  const bars=scene.objects.find(o=>o.name==='StreetFurniture_railing_bars'),material=scene.materials[bars.material];
  assert.equal(material.alphaMode,'MASK');assert.equal(material.doubleSided,true);
  assert.ok(scene.metadata.streetFurniture.some(r=>r.kind==='gate'&&r.status==='generated'));
});

test('bicycle parking areas get capacity / 2 stands inside the area, and lite detail has none',()=>{
  const ring=[node(40,.0007,-.00004),node(41,.0011,-.00004),node(42,.0011,-.00008),node(43,.0007,-.00008)];
  const parking={type:'way',id:400,nodes:[40,41,42,43,40],tags:{amenity:'bicycle_parking',capacity:'8'}};
  const rec=city([...ring,parking]).metadata.streetFurniture.find(r=>r.kind==='bicycle-parking');
  assert.equal(rec.status,'generated');assert.ok(rec.racks>=2&&rec.racks<=4);
  const lite=concreteCity(generate(area([...ring,parking])),{detail:'lite'});
  assert.deepEqual(lite.metadata.streetFurniture,[]);
  assert.ok(!lite.objects.some(o=>o.extras?.sceneModule==='StreetFurniture'));
});
