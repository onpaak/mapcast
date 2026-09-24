import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shopBlade} from '../src/shop-blade.mjs';
const args={a:[0,0],u:[1,0],n:[0,1],along:1,bottom:2.7,top:3,uv:{u0:.1,u1:.3,v0:.2,v1:.25},obstacles:[]};
test('blade has two independently readable faces with opposite outward normals',()=>{
 const b=shopBlade(args);assert.ok(b);assert.equal(b.faces.positions.length,36);assert.equal(b.faces.texcoords.length,24);
 assert.equal(b.faces.normals[0],1);assert.equal(b.faces.normals[18],-1);
 assert.ok(b.faces.positions.every(Number.isFinite));assert.ok(b.depth<=1.2);
 // Text direction reverses in world space so the back is not a mirrored front.
 const front=b.faces.positions.slice(0,18),back=b.faces.positions.slice(18);
 assert.ok(Math.max(...front.filter((_,i)=>i%3===2))>.08);
 assert.ok(Math.min(...back.filter((_,i)=>i%3===2))<1.18);
});
test('blade rejects adjacent walls, roads, prior signs and low headroom',()=>{
 assert.equal(shopBlade({...args,bottom:2.3}),null);
 assert.equal(shopBlade({...args,top:2.8}),null);
 const block={ring:[[.9,.5],[1.1,.5],[1.1,1.5],[.9,1.5]]};
 assert.equal(shopBlade({...args,obstacles:[block]}),null);
 const first=shopBlade(args);assert.equal(shopBlade({...args,obstacles:[{ring:first.footprint}]}),null);
});

test('both blade faces increase texture U toward the viewer right, avoiding mirror text',()=>{
 const mesh=shopBlade(args).faces;
 for(const start of [0,6]){
  const nx=mesh.normals[start*3],nz=mesh.normals[start*3+2];
  const samples=Array.from({length:6},(_,i)=>{const v=start+i;return {right:mesh.positions[v*3]*nz-mesh.positions[v*3+2]*nx,u:mesh.texcoords[v*2]};});
  samples.sort((a,b)=>a.right-b.right);
  assert.ok(samples.at(-1).u>samples[0].u);
 }
});
