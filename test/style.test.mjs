import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {generate} from '../src/scene.mjs';
import {stylePS2} from '../src/ps2.mjs';
import {encodeGLB} from '../src/glb.mjs';
import {renderPreview} from '../src/preview.mjs';
const data=JSON.parse(await readFile(new URL('../examples/block.json',import.meta.url),'utf8'));
test('textured GLB embeds PNGs and matching UVs with aligned views',()=>{
  const scene=stylePS2(generate(data)),glb=encodeGLB(scene.objects,scene.materials,scene.metadata,scene.textures);
  const size=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+size)),bin=glb.subarray(28+size);
  assert.equal(glb.length,glb.readUInt32LE(8));assert.ok(doc.images.length>=4);
  for(const v of doc.bufferViews){assert.equal(v.byteOffset%4,0);assert.ok(v.byteOffset+v.byteLength<=bin.length);}
  for(const m of doc.meshes){const p=m.primitives[0];if(doc.materials[p.material].pbrMetallicRoughness.baseColorTexture){assert.ok(p.attributes.TEXCOORD_0!==undefined);assert.equal(doc.accessors[p.attributes.POSITION].count,doc.accessors[p.attributes.TEXCOORD_0].count);}}
  for(const img of doc.images){const v=doc.bufferViews[img.bufferView],png=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength);assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);}
  assert.equal(doc.nodes.length,scene.objects.length);assert.ok(doc.nodes.every(node=>!node.children));
  assert.ok(doc.nodes.some(node=>node.extras?.sceneModule==='Terrain_Base'));assert.ok(doc.nodes.some(node=>node.extras?.sceneModule==='Roads'));
  const posts=doc.nodes.filter(node=>node.name?.startsWith('LampPost_'));if(posts.length>1){assert.equal(new Set(posts.map(node=>node.mesh)).size,1);assert.ok(posts.every(node=>node.translation?.length===3));}
});
test('flat city preset omits overlap-prone inferred street geometry',()=>{
  const scene=stylePS2(generate(data));
  assert.equal(scene.metadata.generationPreset.terrainMode,'flat');
  assert.equal(scene.metadata.generationPreset.trees,false);
  assert.equal(scene.metadata.roadNetwork.inferredCrosswalks,0);
  assert.equal(scene.metadata.roadNetwork.sidewalkCornerObjects,0);
  assert.equal(scene.metadata.roadNetwork.roadbedObjects,0);
  assert.ok(!scene.objects.some(object=>/^(Roadbed_|Crosswalk_|SidewalkCorner_)/.test(object.name)));
});
test('roof surfaces have no facade texture; lane marks leave intersection clear',()=>{
  const scene=stylePS2(generate(data));
  for(const o of scene.objects.filter(o=>o.name.endsWith('_Roof')))assert.equal(scene.materials[o.material].pbrMetallicRoughness.baseColorTexture,undefined);
  for(const o of scene.objects.filter(o=>o.name.startsWith('LaneMark_'))){const p=o.positions;for(let i=0;i<p.length;i+=3)assert.ok(Math.abs(p[i])>3||Math.abs(p[i+2])>3);}
  assert.ok(scene.metadata.lights.length>0);
});
test('architecture images and materials are pooled across building instances',()=>{
  const base=generate(data),before=stylePS2(base),building=base.objects.find(o=>o.name.startsWith('Building_'));
  const scene=stylePS2({...base,objects:[...base.objects,{...structuredClone(building),name:building.name+'_RepeatedPart'}]}),r=scene.metadata.textureReuse;
  assert.equal(r.buildingInstances,before.metadata.textureReuse.buildingInstances+1);
  assert.equal(r.sharedBuildingTextures,before.metadata.textureReuse.sharedBuildingTextures);
  assert.equal(r.sharedBuildingMaterials,before.metadata.textureReuse.sharedBuildingMaterials);
  assert.equal(new Set(scene.textures.map(t=>t.name)).size,scene.textures.length);
});
test('simple entrances use standalone geometry instead of repeating ground textures',()=>{
  const scene=stylePS2(generate(data)),simple=scene.metadata.buildingAppearances.filter(profile=>profile.ground==='entrance');
  assert.ok(simple.length>0);assert.ok(scene.objects.some(object=>object.name.endsWith('_DoorSlab')));
  assert.ok(!scene.textures.some(texture=>/^Ground_(residential|house|generic)_/.test(texture.name)));
});
test('preview is a decodable PNG with rendered variation and deterministic output',()=>{
  const scene=stylePS2(generate(data));const a=renderPreview(scene,{width:160,height:90}),b=renderPreview(scene,{width:160,height:90});assert.deepEqual(a,b);
  let pos=8;const chunks=[];while(pos<a.length){const n=a.readUInt32BE(pos);if(a.toString('ascii',pos+4,pos+8)==='IDAT')chunks.push(a.subarray(pos+8,pos+8+n));pos+=n+12;}
  const raw=inflateSync(Buffer.concat(chunks));assert.equal(raw.length,90*(160*4+1));assert.ok(new Set(raw).size>50);
});
