import {test} from 'node:test';
import assert from 'node:assert/strict';
import {posterAtlas,windowPoster} from '../src/window-posters.mjs';
const args={a:[0,0],u:[1,0],n:[0,1],pane:[0,1,.22,2.5],row:0};
test('poster fits only inside sufficiently large glass pane',()=>{
 const p=windowPoster(args);assert.ok(p);const [l,r,b,t]=p.bounds;assert.ok(l>=.1&&r<=.9&&b>=.37&&t<=2.38);
 assert.equal(windowPoster({...args,pane:[0,.6,.22,2.5]}),null);
 assert.equal(windowPoster({...args,pane:[0,1,.22,1.6]}),null);
 assert.ok(p.mesh.positions.filter((_,i)=>i%3===2).every(v=>v===-.105));
});
test('poster atlas is deterministic and every orientation reads left to right',()=>{
 assert.deepEqual(posterAtlas().png,posterAtlas().png);
 for(let row=0;row<4;row++)for(const n of [[0,1],[0,-1]]){
  const {mesh}=windowPoster({...args,n,row}),samples=Array.from({length:6},(_,i)=>({right:mesh.positions[i*3]*n[1],u:mesh.texcoords[i*2]})).sort((a,b)=>a.right-b.right);
  assert.ok(samples.at(-1).u>samples[0].u);
  assert.ok(mesh.texcoords.every(v=>v>0&&v<1));
 }
});
