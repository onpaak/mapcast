import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename} from 'node:path';
import {generate} from '../src/scene.mjs';
import {junctionPatches} from '../src/road-network.mjs';
import {resolveRoadSurfaces} from '../src/road-surfaces.mjs';
import {area,obstacle,subtract,roadFaceRings} from '../src/pavement-clip.mjs';
import {renderPreview} from '../src/preview.mjs';
const results=[];await mkdir('output/validation',{recursive:true});
for(const folder of process.argv.slice(2)){
 const scene=generate(JSON.parse(await readFile(`${folder}/area.geojson`,'utf8'))),roads=scene.objects.filter(o=>o.extras?.path),segments=roads.flatMap(o=>o.extras.path.slice(1).map((b,i)=>({a:o.extras.path[i],b,width:o.extras.width,road:o.name})));
 const source=[...roads,...junctionPatches(segments)],resolved=resolveRoadSurfaces(source),faces=resolved.flatMap(o=>roadFaceRings([o]).map(r=>({...obstacle(r,0),name:o.name})));let overlaps=0;
 for(let i=0;i<faces.length;i++)for(let j=0;j<i;j++){const a=faces[i],b=faces[j],x=a.bounds,y=b.bounds;if(x[0]>=y[2]||x[2]<=y[0]||x[1]>=y[3]||x[3]<=y[1])continue;const lost=area(a.ring)-subtract(a.ring,b.ring,0).reduce((s,r)=>s+area(r),0);if(lost>1e-5)overlaps++;}
 const result={folder,roads:roads.length,overlappingFacePairs:overlaps,finite:resolved.every(o=>o.positions.every(Number.isFinite)),removedDuplicateAreaM2:Math.round(roadFaceRings(source).reduce((s,r)=>s+area(r),0)-faces.reduce((s,o)=>s+area(o.ring),0))};results.push(result);console.log(JSON.stringify(result));
 // Before/after images of the road surfaces, named after the area folder.
 {
  scene.materials.push({pbrMetallicRoughness:{baseColorFactor:[.65,.52,.34,1]}});
  for(const [label,objects] of [['before',source],['after',resolved]]){
   const shown=objects.map(o=>({...o,material:o.extras?.surface&&o.extras.surface!=='asphalt'?scene.materials.length-1:1}));
   await writeFile(`output/validation/roads-${basename(folder)}-${label}.png`,renderPreview({...scene,objects:[scene.objects[0],...shown]},{width:1000,height:1000,eye:[0,650,1],target:[0,0,0],ambient:1,direct:0,fogDistance:5000}));
  }
 }
}
await writeFile('output/validation/road-surfaces.json',JSON.stringify(results,null,2));
if(results.some(r=>r.overlappingFacePairs||!r.finite))process.exitCode=1;
