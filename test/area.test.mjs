import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateArea,areaBounds,clipLineToArea,clipRingToArea,offsetConvex} from '../src/area.mjs';
import {fromOverpass} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {insidePolygon} from '../src/spatial.mjs';

// A diamond (a square turned 45°) around 13.4,52.5, about 150 m across.
const diamond=[[13.4,52.499],[13.401,52.5],[13.4,52.501],[13.399,52.5]];
const close=(a,b)=>Math.abs(a-b)<1e-9;

test('areas parse from text, turn counter-clockwise and reject concave or crossing shapes',()=>{
  assert.deepEqual(validateArea('13.4,52.499 13.401,52.5 13.4,52.501 13.399,52.5'),diamond);
  assert.deepEqual(validateArea([...diamond].reverse()),validateArea(diamond),'clockwise input is reordered');
  assert.deepEqual(validateArea([...diamond,diamond[0]]),diamond,'a closing point is dropped');
  assert.throws(()=>validateArea([[13.4,52.499],[13.4,52.501],[13.401,52.5],[13.399,52.5]]),/convex/,'crossing edges');
  assert.throws(()=>validateArea([[13.399,52.499],[13.401,52.499],[13.4,52.4995],[13.4,52.501]]),/convex/,'concave dent');
  assert.throws(()=>validateArea('13.4,52.5 13.401,52.5'),/3 to 12/);
  assert.throws(()=>validateArea([[13.3,52.4],[13.5,52.4],[13.5,52.6],[13.3,52.6]]),/3 km/);
  assert.deepEqual(areaBounds(diamond),[13.399,52.499,13.401,52.501]);
});

test('lines clip to the area and keep a break where they leave and come back',()=>{
  const across=clipLineToArea([[13.398,52.5],[13.402,52.5]],diamond);
  assert.equal(across.length,1);assert.ok(close(across[0][0][0],13.399)&&close(across[0][1][0],13.401));
  // Along the lower edge, out past the tip and back in along the upper edge: two pieces.
  const zigzag=clipLineToArea([[13.3995,52.4999],[13.4,52.4995],[13.402,52.4995],[13.402,52.5005],[13.4,52.5005],[13.3995,52.5001]],diamond);
  assert.equal(zigzag.length,2);
  assert.deepEqual(clipLineToArea([[13.39,52.49],[13.391,52.49]],diamond),[]);
});

test('rings clip to the area and stay closed',()=>{
  const square=[[13.399,52.499],[13.401,52.499],[13.401,52.501],[13.399,52.501],[13.399,52.499]];
  const clipped=clipRingToArea(square,diamond);
  assert.equal(clipped.length,5);assert.deepEqual(clipped[0],clipped.at(-1));
  for(const p of clipped)assert.ok(insidePolygon(p,diamond));
  assert.deepEqual(clipRingToArea([[13.39,52.49],[13.391,52.49],[13.391,52.491],[13.39,52.49]],diamond),[]);
});

test('an offset convex polygon moves every edge out by the distance',()=>{
  const square=[[0,0],[10,0],[10,10],[0,10]];
  assert.deepEqual(offsetConvex(square,2),[[-2,-2],[12,-2],[12,12],[-2,12]]);
  assert.deepEqual(offsetConvex([...square].reverse(),2),[[-2,12],[12,12],[12,-2],[-2,-2]],'either winding grows outward');
});

test('an area selection keeps only what touches the area and shapes the ground to it',()=>{
  const way=(id,tags,points)=>({type:'way',id,tags,geometry:points.map(([lon,lat])=>({lon,lat}))});
  const box=(x,y,s=.0001)=>[[x,y],[x+s,y],[x+s,y+s],[x,y+s],[x,y]];
  const raw={elements:[
    way(1,{building:'yes'},box(13.39995,52.49995)),   // at the centre
    way(2,{building:'yes'},box(13.39905,52.49905)),   // inside the bounding box, outside the diamond
    way(3,{highway:'residential'},[[13.398,52.5],[13.402,52.5]]),
    {type:'node',id:9,lon:13.3991,lat:52.4991,tags:{shop:'bakery'}},
    {type:'node',id:10,lon:13.4,lat:52.5,tags:{shop:'bakery'}}
  ]};
  const data=fromOverpass(raw,{area:diamond});
  assert.deepEqual(data.features.map(f=>f.id),['way/1','way/3/0','node/10']);
  assert.deepEqual(data.selectionBounds,[13.399,52.499,13.401,52.501]);
  assert.deepEqual(data.selectionArea,[...diamond,diamond[0]]);

  const scene=generate(data),ground=scene.objects.find(o=>o.name==='Terrain_Surface');
  assert.deepEqual(scene.metadata.selectionArea,data.selectionArea);
  // The ground is the diamond grown by 25 m, not the 25 m-padded bounding box: its widest
  // points lie on the axes through the centre, and the box corners stay empty.
  const xs=ground.positions.filter((_,i)=>i%3===0),zs=ground.positions.filter((_,i)=>i%3===2);
  const tips=[];for(let i=0;i<xs.length;i++)if(Math.abs(zs[i])<1e-6)tips.push(xs[i]);
  assert.ok(tips.length&&Math.max(...xs)===Math.max(...tips),'the east tip is the widest point');
  const plan=[];for(let i=0;i<xs.length;i++)plan.push([xs[i],zs[i]]);
  assert.ok(!plan.some(([x,z])=>x>Math.max(...xs)-5&&Math.abs(z)>Math.max(...zs)-5),'no square corner');
});
