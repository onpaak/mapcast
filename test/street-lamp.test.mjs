import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeGLB} from '../src/glb.mjs';
import {streetLampMeshes,placeLamp,lampYaw,lampLightOffset} from '../src/street-lamp.mjs';

test('lamp arm reaches toward the given road direction',()=>{
 const {body,lens}=streetLampMeshes();
 for(const toward of [[1,0],[0,1],[-.6,.8]]){
  const origin=[5,0,-3],head=placeLamp(lens,origin,lampYaw(toward)),light=placeLamp({positions:lampLightOffset,normals:[0,1,0]},origin,lampYaw(toward)).positions;
  const reach=[light[0]-origin[0],light[2]-origin[2]];
  assert.ok(Math.abs(reach[0]*toward[1]-reach[1]*toward[0])<1e-9&&reach[0]*toward[0]+reach[1]*toward[1]>1.5);
  assert.ok(head.normals.filter((_,i)=>i%3===1).every(v=>v<-.99),'lens faces down');
 }
 assert.ok(Math.max(...body.positions.filter((_,i)=>i%3===1))<8);
});

test('instanced lamps share one mesh and node rotation reproduces world geometry',()=>{
 const {body}=streetLampMeshes(),objects=[[0,0,0,.3],[10,0,4,2.1]].map(([x,y,z,yaw],i)=>({name:`LampPost_${i}`,...placeLamp(body,[x,y,z],yaw),material:0,extras:{assetKey:'lamp',instanceOrigin:[x,y,z],instanceYaw:yaw}}));
 const glb=encodeGLB(objects,[{name:'m',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}]),size=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+size)),bin=glb.subarray(28+size);
 assert.equal(doc.nodes[0].mesh,doc.nodes[1].mesh);
 const accessor=doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION],view=doc.bufferViews[accessor.bufferView];
 const local=Array.from({length:accessor.count*3},(_,i)=>bin.readFloatLE(view.byteOffset+i*4));
 const node=doc.nodes[1],[,qy,,qw]=node.rotation,yaw=2*Math.atan2(qy,qw);
 const world=placeLamp({positions:local,normals:local},node.translation,yaw).positions;
 // Indexed meshes reorder vertices, so match each vertex to its nearest source point.
 const source=objects[1].positions;
 for(let i=0;i<world.length;i+=3){
  let best=Infinity;for(let j=0;j<source.length;j+=3)best=Math.min(best,Math.hypot(world[i]-source[j],world[i+1]-source[j+1],world[i+2]-source[j+2]));
  assert.ok(best<1e-4,`vertex off by ${best}`);
 }
});
