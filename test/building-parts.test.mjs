import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fromOverpass} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {sourceReport} from '../src/source-report.mjs';

const square=(x0,y0,x1,y1)=>[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]];
const feature=(id,properties,coordinates)=>({type:'Feature',id,properties,geometry:{type:'Polygon',coordinates}});
// An office outline mapped as a 20 m podium with a tower from 20 m to 60 m.
const tower={type:'FeatureCollection',features:[
  feature('way/1',{building:'office',height:'60'},square(0,0,.0004,.0002)),
  feature('way/2',{'building:part':'yes',height:'20'},square(0,0,.0004,.0002)),
  feature('way/3',{'building:part':'yes',height:'60',min_height:'20'},square(.0001,.00005,.0003,.00015))
]};
const ys=objects=>objects.flatMap(o=>o.positions.filter((_,i)=>i%3===1));

test('Overpass building parts are kept, including ways tagged both building and building:part',()=>{
  const way=(id,tags,x)=>({type:'way',id,tags,geometry:[[0,0],[x,0],[x,.0001],[0,.0001],[0,0]].map(([lon,lat])=>({lon,lat}))});
  const data=fromOverpass({elements:[way(1,{building:'yes'},.0002),way(2,{'building:part':'yes',height:'30'},.0001),way(3,{building:'yes','building:part':'yes'},.0001),way(4,{'building:part':'no',building:'yes'},.0002)]});
  const kinds=Object.fromEntries(data.features.map(f=>[f.id,f.properties['building:part']??'outline']));
  assert.deepEqual(kinds,{'way/1':'outline','way/2':'yes','way/3':'yes','way/4':'no'});
  assert.equal(data.diagnostics.receivedParts,2);
});

test('parts replace their outline and raised sections start at their base',()=>{
  const scene=generate(tower),buildings=scene.objects.filter(o=>o.name.startsWith('Building_'));
  assert.deepEqual(buildings.map(o=>o.extras.sourceId).sort(),['way/2','way/3']);
  const top=buildings.find(o=>o.extras.sourceId==='way/3');
  assert.equal(top.extras.minHeight,20);assert.equal(top.extras.outlineId,'way/1');
  assert.equal(top.extras.osmTags.building,'office','parts inherit the outline use');
  assert.equal(Math.min(...ys([top])),20);assert.equal(Math.max(...ys([top])),60);
  assert.deepEqual(scene.metadata.buildingParts,{parts:2,replacedOutlines:[{sourceId:'way/1',parts:['way/2','way/3']}],extendedDown:[]});

  const report=sourceReport(tower,scene).index;
  assert.equal(report.features.find(f=>f.featureId==='way/1').generated,true,'the outline is generated through its parts');
  assert.equal(report.summary.buildingParts,2);
});

test('a part outside any outline stands on its own',()=>{
  const scene=generate({type:'FeatureCollection',features:[feature('way/9',{'building:part':'yes','building:levels':'4'},square(0,0,.0002,.0001))]});
  const building=scene.objects.find(o=>o.name.startsWith('Building_'));
  assert.equal(building.extras.height,12);assert.equal(building.extras.osmTags.building,'yes');
});

test('raised sections get no street level and sit on their podium',()=>{
  const city=concreteCity(generate(tower)),raised=city.objects.filter(o=>o.extras?.sourceId==='way/3');
  assert.ok(raised.length);
  assert.ok(Math.min(...ys(raised))>=20-1e-6,'nothing of the tower hangs below 20 m');
  assert.ok(!city.metadata.frontages.some(f=>f.sourceId==='way/3'));
});

test('a wall shared by two sections is drawn once, by the taller one',()=>{
  // A 20 m podium and a 60 m tower on the same footprint: their outer walls coincide.
  const city=concreteCity(generate({type:'FeatureCollection',features:[
    feature('way/20',{building:'office',height:'60'},square(0,0,.0004,.0002)),
    feature('way/21',{'building:part':'yes',height:'20'},square(0,0,.0004,.0002)),
    feature('way/22',{'building:part':'yes',height:'60'},square(0,0,.0004,.0002))
  ]}));
  const facade=id=>city.objects.filter(o=>o.name===`Building_${id}_FacadeAtlas`).reduce((s,o)=>s+o.positions.length,0);
  assert.equal(facade('way/21'),0,'the podium walls are left to the tower');
  assert.ok(facade('way/22')>0);
});

test('walls against a neighbour get no facade below its roof',()=>{
  // Two buildings share the wall at x = 0 (the scene origin): 12 m to the west, 24 m to the east.
  // Vertices strictly inside that wall (away from the corners, which the side walls share) are checked.
  const city=concreteCity(generate({type:'FeatureCollection',features:[
    feature('way/10',{building:'apartments',height:'12'},square(0,0,.0002,.0002)),
    feature('way/11',{building:'apartments',height:'24'},square(.0002,0,.0004,.0002))
  ]}));
  const onWall=city.objects.filter(o=>/^Building_way\/1[01]/.test(o.name)).flatMap(o=>{
    const hits=[];for(let i=0;i<o.positions.length;i+=3)if(Math.abs(o.positions[i])<.05&&Math.abs(o.positions[i+2])<10.5&&o.positions[i+1]>.05&&o.positions[i+1]<11.9)hits.push(o.name);return hits;
  });
  assert.deepEqual(onWall,[]);
  assert.ok(city.objects.some(o=>o.name==='Building_way/11_FacadeAtlas'&&o.positions.some((v,i)=>i%3===0&&Math.abs(v)<.05)),'the taller building shows its wall above the neighbour');
});

test('a tower inside a podium outline gets its own sections, a sphere and no windows',()=>{
  // A 60×40 m retail podium outline around a 10 m tower outline; the tower is mapped as a
  // 0-100 m shaft and a 20 m sphere at 100-120 m.
  const circle=(cx,cy,r,n=12)=>[Array.from({length:n+1},(_,i)=>[cx+r*Math.cos(2*Math.PI*i/n),cy+r*Math.sin(2*Math.PI*i/n)*.63])];
  const data={type:'FeatureCollection',features:[
    feature('way/30',{building:'retail',height:'12'},square(0,0,.0008,.0004)),
    feature('way/31',{building:'tower',height:'120'},circle(.0004,.0002,.00007)),
    feature('way/32',{'building:part':'yes',height:'100'},circle(.0004,.0002,.00007)),
    feature('way/33',{'building:part':'yes','building:shape':'sphere',height:'120',min_height:'100'},circle(.0004,.0002,.00014))
  ]};
  const scene=generate(data);
  assert.deepEqual(scene.metadata.buildingParts.replacedOutlines,[{sourceId:'way/31',parts:['way/32','way/33']}]);
  const city=concreteCity(scene),kinds=Object.fromEntries(city.metadata.concreteFamilies.map(f=>[f.sourceId,f.layout]));
  assert.equal(kinds['way/32'],'shaft');assert.equal(kinds['way/33'],'sphere');
  assert.ok(!city.objects.some(o=>/^Building_way\/3[23]_FacadeAtlas$/.test(o.name)),'towers carry no windows');
  const ball=city.objects.filter(o=>o.extras?.sourceId==='way/33'),y=ys(ball);
  assert.ok(Math.min(...y)>=100-1e-6&&Math.max(...y)<=120+1e-6,'the sphere fills its section');
  const x=ball.flatMap(o=>o.positions.filter((_,i)=>i%3===0));
  assert.ok(Math.max(...x)-Math.min(...x)>15,'as wide as its footprint');
});

test('a lattice tower mapped as one outline is an ordinary building, other towers stay shafts',async()=>{
  const {structureKind}=await import('../src/city/structures.mjs'),ring=square(0,0,10,10)[0];
  assert.equal(structureKind({building:'yes',man_made:'tower','tower:construction':'lattice'},ring),null);
  assert.equal(structureKind({building:'yes',man_made:'tower','tower:construction':'freestanding'},ring),'shaft');
  assert.equal(structureKind({building:'tower'},ring),'shaft');
  const scene=generate({type:'FeatureCollection',features:[feature('relation/1',{building:'yes',man_made:'tower','tower:construction':'lattice',height:'330'},square(0,0,.0008,.0008))]});
  const city=concreteCity(scene);
  assert.ok(city.objects.some(o=>o.name==='Building_relation/1_FacadeAtlas'),'it has windows');
});

test('raised sections never float: they reach down to the roof below, or to the ground',()=>{
  // A podium mapped as 3 storeys (9 m) under a tower from the 4th level (12 m), and a tower
  // from the 10th level whose podium was not mapped at all. A skybridge stays in the air.
  const scene=generate({type:'FeatureCollection',features:[
    feature('way/50',{building:'commercial',height:'60'},square(0,0,.0004,.0002)),
    feature('way/51',{'building:part':'yes','building:levels':'3'},square(0,0,.0004,.0002)),
    feature('way/52',{'building:part':'yes','building:levels':'20','building:min_level':'4'},square(.0001,.00005,.0003,.00015)),
    feature('way/53',{'building:part':'yes','building:levels':'22','building:min_level':'10'},square(.001,0,.0012,.0002)),
    feature('way/54',{'building:part':'bridge',height:'20',min_height:'15'},square(.0006,0,.0008,.00005))
  ]});
  const range=id=>{const y=ys(scene.objects.filter(o=>o.extras?.sourceId===id));return [Math.min(...y),Math.max(...y)];};
  assert.deepEqual(range('way/52'),[9,60]);assert.deepEqual(range('way/53'),[0,66]);assert.deepEqual(range('way/54'),[15,20]);
  assert.deepEqual(scene.metadata.buildingParts.extendedDown,[{sourceId:'way/52',from:12,to:9},{sourceId:'way/53',from:30,to:0}]);
});

test('sections of a building crossing the selection edge are kept with it',()=>{
  const way=(id,tags,x0,x1)=>({type:'way',id,tags,geometry:[[x0,0],[x1,0],[x1,.0002],[x0,.0002],[x0,0]].map(([lon,lat])=>({lon,lat}))});
  // The outline and the tower cross the edge at lon .0003; the podium section lies just outside.
  const data=fromOverpass({elements:[way(1,{building:'yes',height:'40'},.0002,.0006),way(2,{'building:part':'yes',height:'10'},.00035,.0006),way(3,{'building:part':'yes',height:'40',min_height:'10'},.0002,.00034)]},{bounds:[0,0,.0003,.0002]});
  assert.deepEqual(data.features.map(f=>f.id).sort(),['way/1','way/2','way/3']);
});

test('a podium leaves the wall a flush tower stands behind to the tower',()=>{
  // A 30 m podium whose west wall runs 1 m in front of a 120 m tower rising from the ground.
  const city=concreteCity(generate({type:'FeatureCollection',features:[
    feature('way/60',{building:'retail',height:'30'},square(0,0,.0008,.0004)),
    feature('way/61',{building:'office',height:'120'},square(.00001,.00001,.0003,.0002))
  ]}));
  const x0=Math.min(...city.objects.filter(o=>o.extras?.sourceId==='way/60').flatMap(o=>o.positions.filter((_,i)=>i%3===0)));
  const onPodiumWall=city.objects.filter(o=>o.extras?.sourceId==='way/60').flatMap(o=>{const hits=[];for(let i=0;i<o.positions.length;i+=3)if(Math.abs(o.positions[i]-x0)<.3&&o.positions[i+2]>5&&o.positions[i+2]<15)hits.push(o.name);return hits;});
  assert.deepEqual(onPodiumWall,[],'no podium wall in front of the tower');
  const towerWall=city.objects.filter(o=>o.name==='Building_way/61_FacadeAtlas').some(o=>o.positions.some((v,i)=>i%3===1&&v<10));
  assert.ok(towerWall,'the tower shows its facade down to the street');
});
