import test from 'node:test';
import assert from 'node:assert/strict';
import {shopCanopy,canopyObstacles} from '../src/shop-canopy.mjs';
const a=[0,0],b=[10,0],out=[0,-1],building=[[0,0],[10,0],[10,5],[0,5]];
test('shop canopy stays outside building and reduces depth when carriageway is close',()=>{
 const clear=shopCanopy(a,b,out,3,6,2.6,canopyObstacles([building]));assert.equal(clear.depth,.85);assert.ok(clear.mesh.positions.every(Number.isFinite));
 assert.equal(clear.mesh.positions.length/9,12);
 const road=[[0,-2],[10,-2],[10,-.75],[0,-.75]];
 const shallow=shopCanopy(a,b,out,3,6,2.6,canopyObstacles([building,road]));assert.equal(shallow.depth,.6);
});
test('shop canopy is omitted when blocked or below safe headroom',()=>{
 const neighbor=[[4,-1],[5,-1],[5,-.2],[4,-.2]];
 assert.equal(shopCanopy(a,b,out,3,6,2.6,canopyObstacles([building,neighbor])),null);
 assert.equal(shopCanopy(a,b,out,3,6,2.1,[]),null);
 const first=shopCanopy(a,b,out,3,6,2.6,[]);assert.equal(shopCanopy(a,b,out,3,6,2.6,canopyObstacles([first.footprint])),null);
});
