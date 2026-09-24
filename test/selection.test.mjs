import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fromOverpass} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {sourceReport} from '../src/source-report.mjs';
const geom=r=>r.map(([lon,lat])=>({lon,lat}));
const ring=[[0,0],[.002,0],[.002,.002],[0,.002],[0,0]];
const way={type:'way',id:1,tags:{building:'yes'},geometry:geom(ring)};
test('small selection within a building keeps its full outline; covering cache excludes distant buildings',()=>{
  const data=fromOverpass({elements:[way,{...way,id:2,geometry:geom(ring.map(([x,y])=>[x+.01,y]))}]},{bounds:[.0005,.0005,.001,.001]});
  assert.equal(data.features.length,1);assert.deepEqual(data.features[0].geometry.coordinates[0],ring);
  assert.equal(data.diagnostics.outsideBuildings,1);assert.equal(data.diagnostics.boundaryBuildings,1);
  assert.equal(sourceReport(data,generate(data)).index.summary.buildings,1);
});
test('selection inside courtyard does not invent a building; crossing relation keeps its hole',()=>{
  const hole=[[.0005,.0005],[.0015,.0005],[.0015,.0015],[.0005,.0015],[.0005,.0005]];
  const raw={elements:[way,{type:'way',id:2,geometry:geom(hole)},{type:'relation',id:3,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'inner'}]}]};
  const empty=fromOverpass(raw,{bounds:[.0007,.0007,.001,.001]});assert.equal(empty.features.length,0);
  const data=fromOverpass(raw,{bounds:[.0001,.0001,.001,.001]});assert.equal(data.features.length,1);assert.equal(data.features[0].geometry.coordinates.length,2);assert.equal(data.diagnostics.receivedBuildings,1);
});
test('empty result and invalid buildings produce distinct diagnostic reports',()=>{
  const bounds=[0,0,.001,.001];
  const empty=fromOverpass({elements:[]},{bounds});
  assert.equal(sourceReport(empty,generate(empty)).index.summary.buildingDiagnostics.skippedBuildings,0);
  const invalid=fromOverpass({elements:[{...way,geometry:undefined,nodes:[900,901]}]},{bounds});
  const d=sourceReport(invalid,generate(invalid)).index.summary.buildingDiagnostics;
  assert.equal(d.receivedBuildings,1);assert.equal(d.generatedBuildings,0);assert.equal(d.skippedBuildings,1);
});

test('environment relation boundaries do not suppress independently tagged buildings or roads',()=>{
 const road={type:'way',id:2,tags:{highway:'service'},geometry:geom(ring.map(([x,y])=>[x+.003,y]))};
 const raw={elements:[way,road,{type:'relation',id:3,tags:{type:'multipolygon',leisure:'park'},members:[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'outer'}]}]};
 const data=fromOverpass(raw,{bounds:[0,0,.006,.003]});
 assert.ok(data.features.some(f=>f.id==='way/1'));
 assert.ok(data.features.some(f=>f.id==='way/2/0'));
 assert.ok(data.features.some(f=>f.id==='relation/3'));
 assert.equal(data.diagnostics.receivedBuildings,1);
});

test('multipolygon selects intersecting components only and retains their complete outlines',()=>{
 const distant={...way,id:2,geometry:geom(ring.map(([x,y])=>[x+.01,y]))};
 const relation={type:'relation',id:3,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'outer'}]};
 const data=fromOverpass({elements:[way,distant,relation]},{bounds:[.0005,.0005,.001,.001]});
 assert.equal(data.features.length,1);
 assert.equal(data.features[0].geometry.type,'Polygon');
 assert.deepEqual(data.features[0].geometry.coordinates,[ring]);
 assert.equal(data.diagnostics.boundaryBuildings,1);
 const whole=fromOverpass({elements:[way,distant,relation]});
 assert.equal(whole.features[0].geometry.type,'MultiPolygon');
 assert.equal(whole.features[0].geometry.coordinates.length,2);
});

test('environment relation still deduplicates its own tagged area members',()=>{
 const area={...way,tags:{leisure:'park'}};
 const data=fromOverpass({elements:[area,{type:'relation',id:3,tags:{type:'multipolygon',leisure:'park'},members:[{type:'way',ref:1,role:'outer'}]}]},{bounds:[0,0,.003,.003]});
 assert.deepEqual(data.features.map(f=>f.id),['relation/3']);
});
