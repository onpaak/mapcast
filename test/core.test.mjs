import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {triangulate,extrude,roadRibbon} from '../src/geometry.mjs';
import {generate} from '../src/scene.mjs';
import {encodeGLB} from '../src/glb.mjs';
test('concave roof preserves footprint area and upward normals',()=>{
  const ring=[[0,0],[4,0],[4,4],[2,4],[2,2],[0,2]];
  const {points:p,triangles}=triangulate(ring);
  const area=triangles.reduce((sum,[a,b,c])=>sum+Math.abs((p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]))/2,0);
  assert.equal(area,12); assert.equal(extrude(ring,0).normals[1],1);
});
test('GLB contains valid ranges, finite positions and correct source heights',async()=>{
  const scene=generate(JSON.parse(await readFile(new URL('../examples/block.json',import.meta.url),'utf8')));
  assert.equal(scene.objects.length,6);assert.equal(scene.objects.find(o=>o.name==='Building_b').extras.height,18);
  const bytes=encodeGLB(scene.objects,scene.materials,scene.metadata);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString());
  for(const v of doc.bufferViews)assert.ok(v.byteOffset+v.byteLength<=doc.buffers[0].byteLength);
  for(const a of doc.accessors)assert.ok(a.min.every(Number.isFinite)&&a.max.every(Number.isFinite));
});
test('courtyard building generates with hole metadata',async()=>{
  const data=JSON.parse(await readFile(new URL('../examples/block.json',import.meta.url),'utf8'));
  data.features[2].geometry.coordinates.push([[13.4004,52.5203],[13.4005,52.5203],[13.4005,52.5204],[13.4004,52.5203]]);
  const scene=generate(data);assert.equal(scene.metadata.warnings.length,0);assert.equal(scene.objects.find(o=>o.name==='Building_a').extras.holes.length,1);
});
test('joined road ribbon shares bend edges without stacked segment caps',()=>{
  const mesh=roadRibbon([[0,0],[10,0],[10,10]],8);
  assert.equal(mesh.positions.length,36);
  assert.ok(mesh.positions.every(Number.isFinite));
  assert.ok(mesh.normals.every((value,index)=>index%3!==1||value>0));
  const vertices=[];for(let index=0;index<mesh.positions.length;index+=3)vertices.push(mesh.positions.slice(index,index+3).join(','));
  const first=new Set(vertices.slice(0,6)),second=new Set(vertices.slice(6));
  assert.equal([...first].filter(vertex=>second.has(vertex)).length,2);
});
