import test from 'node:test';
import assert from 'node:assert/strict';
import {area,subtract,clipPavement,obstacle} from '../src/pavement-clip.mjs';
import {sidewalks} from '../src/streetscape.mjs';
import {roadRibbon} from '../src/geometry.mjs';
import {roadFaceRings} from '../src/pavement-clip.mjs';
import {polygonsOverlap} from '../src/spatial.mjs';
const square=[[0,0],[4,0],[4,4],[0,4]];
test('unobstructed straight sidewalk keeps full area without artificial slab boundaries',()=>{
 const result=sidewalks([{a:[0,0],b:[100,0],width:6}],[],0);
 assert.equal(result.pads.length,2);
 // The road collision clearance removes a ten-micrometre strip along the curb.
 assert.ok(Math.abs(result.pads.reduce((s,p)=>s+area(p),0)-400)<.01);
});
test('straight width changes connect sidewalks without covering roads or buildings',()=>{
 const segments=[{a:[-12,0],b:[0,0],width:6},{a:[0,0],b:[12,0],width:9}];
 const faces=segments.flatMap(s=>roadFaceRings([roadRibbon([s.a,s.b],s.width)]));
 const building=[[-3,5],[-1,5],[-1,8],[-3,8]];
 const result=sidewalks(segments,[building],0,faces);
 assert.ok(result.objects.some(o=>o.extras.kind==='sidewalk-width-transition'));
 assert.ok(result.pads.every(p=>!polygonsOverlap(p,building)));
 for(const pad of result.pads)for(const face of faces)assert.ok(Math.abs(area(pad)-subtract(pad,face,0).reduce((s,p)=>s+area(p),0))<1e-6);
 assert.ok(result.objects.every(o=>o.positions.every(Number.isFinite)));
});
test('two-arm bend fills the outer sidewalk corner without covering the carriageway',()=>{
 const segments=[{a:[-15,0],b:[0,0],width:6},{a:[0,0],b:[0,15],width:6}];
 const faces=roadFaceRings([roadRibbon([[-15,0],[0,0],[0,15]],6)]);
 const result=sidewalks(segments,[],0,faces);
 assert.ok(result.objects.some(o=>o.extras.kind==='connected-sidewalk-bend'));
 for(const pad of result.pads)for(const face of faces)assert.ok(Math.abs(area(pad)-subtract(pad,face,0).reduce((s,p)=>s+area(p),0))<1e-6);
 const blocked=sidewalks(segments,[[[3,-6],[6,-6],[6,-3],[3,-3]]],0,faces);
 assert.ok(blocked.pads.every(p=>!polygonsOverlap(p,[[3,-6],[6,-6],[6,-3],[3,-3]])));
});
test('clipping preserves remaining area around an internal obstacle for either winding',()=>{
 const hole=[[1,1],[3,1],[3,3],[1,3]];
 for(const ring of [hole,hole.toReversed()]){const pieces=subtract(square,ring,0);assert.ok(Math.abs(pieces.reduce((s,p)=>s+area(p),0)-12)<1e-8);}
 assert.equal(clipPavement(square,[obstacle(square)]).length,0);
});
test('partial sidewalk obstruction retains paving instead of deleting a whole two metre section',()=>{
 const building=[[.8,4],[1.2,4],[1.2,8],[.8,8]],road=[{a:[0,0],b:[2,0],width:6}];
 const {pads,objects}=sidewalks(road,[building],0);
 assert.ok(pads.reduce((sum,p)=>sum+area(p),0)>7);
 assert.ok(pads.every(p=>!polygonsOverlap(p,building)));
 assert.ok(objects.every(o=>o.positions.every(Number.isFinite)));
});
test('sidewalk clips actual junction surfaces and overlapping duplicate roads once',()=>{
 const road={a:[0,0],b:[10,0],width:6},face=[[4,3],[6,3],[5,6]];
 const {pads}=sidewalks([road,road],[],0,[face]);
 assert.ok(pads.every(p=>!polygonsOverlap(p,face)));
 assert.ok(pads.reduce((s,p)=>s+area(p),0)<40);
 for(let i=0;i<pads.length;i++)for(let j=0;j<i;j++){
  const remaining=subtract(pads[i],pads[j],0).reduce((s,p)=>s+area(p),0);
  assert.ok(Math.abs(remaining-area(pads[i]))<1e-6);
 }
});
