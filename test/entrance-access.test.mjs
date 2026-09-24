import test from 'node:test';
import assert from 'node:assert/strict';
import {entranceAccess,edgeOutward,sidewalkCovers} from '../src/entrance-access.mjs';
import {polygonsOverlap} from '../src/spatial.mjs';
const building=[[0,0],[10,0],[10,10],[0,10],[0,0]],pad=[[0,-5],[10,-5],[10,-3],[0,-3]],road=[[0,-9],[10,-9],[10,-6],[0,-6]];
test('entrance connector slopes to sidewalk without overlapping existing surfaces',()=>{
 const r=entranceAccess(building,0,[4.4,5.6],[pad],[building],[road]);
 assert.equal(r.reason,'connected');assert.ok(!polygonsOverlap(r.footprint,pad));assert.ok(!polygonsOverlap(r.footprint,road));assert.ok(!polygonsOverlap(r.footprint,building));
 const ys=r.mesh.positions.filter((_,i)=>i%3===1);assert.ok(Math.abs(Math.min(...ys)-.02)<1e-6);assert.ok(Math.abs(Math.max(...ys)-.175)<1e-6);
 assert.ok(r.mesh.normals.every(Number.isFinite));assert.equal(edgeOutward(building,0)[1],-1);
});
test('entrance connector skips blocked, too distant, and already paved entrances',()=>{
 const block=[[4,-2],[6,-2],[6,-1],[4,-1]];
 assert.equal(entranceAccess(building,0,[4.4,5.6],[pad],[building,block],[road]).reason,'blocked-by-building-or-access');
 assert.equal(entranceAccess(building,0,[4.4,5.6],[pad.map(([x,z])=>[x,z-12])],[building],[]).reason,'sidewalk-too-far');
 assert.equal(entranceAccess(building,0,[4.4,5.6],[[[0,-2],[10,-2],[10,-.01],[0,-.01]]],[building],[]).reason,'already-on-sidewalk');
});

test('adjacent sidewalk pads accept a doorway across their seam but reject a real narrow gap',()=>{
 const left=[[0,-5],[5,-5],[5,-3],[0,-3]],right=[[5,-5],[10,-5],[10,-3],[5,-3]];
 assert.equal(entranceAccess(building,0,[4.4,5.6],[left,right],[building],[road]).reason,'connected');
 const gap=right.map(([x,z])=>[x+.01,z]);
 assert.equal(sidewalkCovers([4.4,-3.03],[5.6,-3.03],[left,gap]),false);
 assert.equal(entranceAccess(building,0,[4.4,5.6],[left,gap],[building],[road]).reason,'landing-not-fully-paved');
});
