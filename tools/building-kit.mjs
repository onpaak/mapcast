import {mkdir,writeFile} from 'node:fs/promises';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {encodeGLB} from '../src/glb.mjs';
import {renderPreview} from '../src/preview.mjs';
import {applyTextureOverrides} from '../src/texture-overrides.mjs';
const root='output/building-kit',manifest=[];
for(const [name,type,width,depth,height] of [['residential','apartments',36,14,18],['office','office',20,18,24],['commercial','retail',26,16,7],['industrial','warehouse',30,22,7],['public-hall','civic',32,20,9]]){
 const out=`${root}/${name}`;await mkdir(out,{recursive:true});
 const x=width/111195,z=depth/111195;
 const data={type:'FeatureCollection',selectionBounds:[-x/2,-z/2,x/2,z/2],features:[{type:'Feature',id:`kit-${name}`,properties:{building:type,height:String(height)},geometry:{type:'Polygon',coordinates:[[[-x/2,-z/2],[x/2,-z/2],[x/2,z/2],[-x/2,z/2],[-x/2,-z/2]]]}},{type:'Feature',id:'sample-frontage',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-x,-z/2-8/111195],[x,-z/2-8/111195]]}}]};
 const scene=concreteCity(generate(data));
 // Samples are standalone building meshes, with embedded shared materials.
 scene.objects=scene.objects.filter(o=>o.name.startsWith('Building_'));
 await applyTextureOverrides(scene.textures,'overrides/textures');
 const distance=Math.max(width*.85,height*1.3),camera={eye:[-distance,height*.75,depth/2+distance],target:[0,height*.42,0]};scene.metadata.previewCamera=camera;
 await writeFile(`${out}/area.geojson`,JSON.stringify(data,null,2));
 await writeFile(`${out}/city.glb`,encodeGLB(scene.objects,scene.materials,scene.metadata,scene.textures));
 await writeFile(`${out}/metadata.json`,JSON.stringify(scene.metadata,null,2));
 await writeFile(`${out}/preview.png`,renderPreview(scene,{...camera,width:1000,height:800,ambient:.8,direct:.4,sunDirection:[-.5,.9,.7],fogDistance:2000,skyTop:[50,55,60],skyBottom:[65,70,74]}));
 manifest.push({name,type,width,depth,height,family:scene.metadata.concreteFamilies[0].family,glb:`${name}/city.glb`,preview:`${name}/preview.png`,triangles:scene.objects.reduce((s,o)=>s+o.positions.length/9,0),buildingTextures:scene.metadata.textureReuse.sharedBuildingTextures});
}
await writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
