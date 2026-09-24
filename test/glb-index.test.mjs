import test from 'node:test';
import assert from 'node:assert/strict';
import {indexMesh,encodeGLB} from '../src/glb.mjs';
import {extrude} from '../src/geometry.mjs';

test('indexed export reproduces all triangle attributes and preserves hard edges and UV seams',()=>{
 const mesh=extrude([[0,0],[3,0],[3,2],[0,2]],4);
 mesh.texcoords=mesh.positions.flatMap((v,i)=>i%3===0?[v/3,mesh.positions[i+1]/4]:[]);
 const indexed=indexMesh(mesh.positions,mesh.normals,mesh.texcoords);
 assert.ok(indexed.positions.length<mesh.positions.length);
 for(const [name,size] of [['positions',3],['normals',3],['texcoords',2]])assert.deepEqual(indexed.indices.flatMap(i=>indexed[name].slice(i*size,i*size+size)),mesh[name].map(Math.fround));
 const changed=[...mesh.texcoords];changed[0]+=.125;
 const seam=indexMesh(mesh.positions,mesh.normals,changed);
 assert.deepEqual(seam.indices.flatMap(i=>seam.texcoords.slice(i*2,i*2+2)),changed.map(Math.fround));
 const glb=encodeGLB([{name:'Box',...mesh,material:0}],[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}]);
 const length=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+length)),bin=glb.subarray(28+length),prim=doc.meshes[0].primitives[0],accessor=doc.accessors[prim.indices],view=doc.bufferViews[accessor.bufferView];
 assert.equal(accessor.componentType,5123);
 assert.deepEqual(Array.from({length:accessor.count},(_,i)=>bin.readUInt16LE(view.byteOffset+i*2)),indexed.indices);
 assert.ok(doc.bufferViews.every(v=>v.byteOffset%4===0));
});

test('indexing rejects malformed UV and nonfinite attributes',()=>{
 assert.throws(()=>indexMesh([0,0,0],[0,1,0]),/length/);
 const p=[0,0,0,1,0,0,0,1,0],n=[0,0,1,0,0,1,0,0,1];
 assert.throws(()=>indexMesh(p,n,[0,0]),/length/);
 assert.throws(()=>indexMesh(p.map((v,i)=>i===0?Infinity:v),n),/attribute/);
});

test('large meshes use 32-bit indices without overflow',()=>{
 const positions=[],normals=[];
 for(let repeat=0;repeat<2;repeat++)for(let i=0;i<65538;i++){positions.push(i,i%3,0);normals.push(0,0,1);}
 const bytes=encodeGLB([{name:'Large',positions,normals,material:0}],[{}]),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),a=doc.accessors[doc.meshes[0].primitives[0].indices],v=doc.bufferViews[a.bufferView];
 assert.equal(a.componentType,5125);assert.equal(a.max[0],65537);
 assert.equal(bytes.readUInt32LE(28+length+v.byteOffset+(65538-1)*4),65537);
});

test('zero-area triangles are dropped on export, never emptying an object',async()=>{
 const {dropDegenerate}=await import('../src/glb.mjs');
 const good=[0,0,0,1,0,0,0,0,1],flat=[0,0,0,1,0,0,2,0,0],n=Array(9).fill(0).map((_,i)=>i%3===1?1:0);
 const mixed=dropDegenerate({positions:[...good,...flat],normals:[...n,...n],texcoords:Array(12).fill(.5)});
 assert.deepEqual(mixed.positions,good);assert.equal(mixed.texcoords.length,6);
 const only=dropDegenerate({positions:flat,normals:n});assert.deepEqual(only.positions,flat);
});
