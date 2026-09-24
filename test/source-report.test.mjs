import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {sourceReport} from '../src/source-report.mjs';
test('source report links generated geometry to OSM and escapes labels',()=>{
  const data={type:'FeatureCollection',features:[{type:'Feature',id:'way/42/0',properties:{highway:'residential',name:'A < B & C'},geometry:{type:'LineString',coordinates:[[13.4,52.52],[13.401,52.521]]}}]};
  const report=sourceReport(data,generate(data));assert.equal(report.index.summary.roads,1);assert.equal(report.index.features[0].osmUrl,'https://www.openstreetmap.org/way/42');assert.deepEqual(report.index.features[0].objectNames,['Road_way/42/0']);assert.ok(report.svg.includes('A &lt; B &amp; C'));
});

test('diagnostic report exposes failed imports and per-feature generation reasons',async()=>{
 const {fromOverpass}=await import('../src/osm.mjs');
 const data=fromOverpass({elements:[
  {type:'way',id:7,tags:{building:'yes'},nodes:[987,988]},
  {type:'way',id:8,tags:{building:'yes',layer:'-1'},geometry:[{lon:0,lat:0},{lon:.001,lat:0},{lon:.001,lat:.001},{lon:0,lat:0}]}
 ]},{bounds:[0,0,.002,.002]});
 const report=sourceReport(data,generate(data)).index;
 assert.equal(report.importIssues[0].featureId,'way/7');
 assert.equal(report.importIssues[0].osmUrl,'https://www.openstreetmap.org/way/7');
 assert.match(report.importIssues[0].reason,/Missing geometry/);
 assert.equal(report.features[0].generated,false);
 assert.match(report.features[0].skipReasons[0],/Underground/);
});

test('buildings with a positive layer (podiums, stations) are still generated',async()=>{
 const {fromOverpass}=await import('../src/osm.mjs');
 const ring=[{lon:0,lat:0},{lon:.0003,lat:0},{lon:.0003,lat:.0003},{lon:0,lat:0}];
 const data=fromOverpass({elements:[{type:'way',id:8,tags:{building:'office',layer:'2'},geometry:ring},{type:'way',id:9,tags:{highway:'residential',bridge:'yes'},geometry:ring.slice(0,2)}]},{bounds:[0,0,.002,.002]});
 const features=sourceReport(data,generate(data)).index.features;
 assert.equal(features.find(f=>f.featureId==='way/8').generated,true);
 assert.match(features.find(f=>f.featureId.startsWith('way/9')).skipReasons[0],/Elevated/,'bridges are still skipped');
});

test('untagged heights follow building type and footprint instead of a flat 12 m',async()=>{
 const {untaggedHeight}=await import('../src/scene.mjs');
 assert.equal(untaggedHeight('house',150).height,6.5);
 assert.equal(untaggedHeight('garage',30).height,3.5);
 assert.deepEqual(untaggedHeight('yes',180),{height:6.5,source:'footprint'});
 assert.deepEqual(untaggedHeight('yes',300),{height:9.5,source:'footprint'});
 assert.deepEqual(untaggedHeight('yes',2000),{height:12,source:'default'});
 assert.equal(untaggedHeight('apartments',90).height,12,'unknown multi-storey types keep the default');
});

test('intentionally omitted stair routes have a specific diagnostic reason',()=>{
 const data={type:'FeatureCollection',selectionBounds:[0,0,.002,.002],features:[{type:'Feature',id:'way/9/0',properties:{highway:'steps'},geometry:{type:'LineString',coordinates:[[0,0],[.001,.001]]}}]};
 const entry=sourceReport(data,generate(data)).index.features[0];
 assert.equal(entry.generated,false);
 assert.match(entry.skipReasons[0],/steps/);
});
