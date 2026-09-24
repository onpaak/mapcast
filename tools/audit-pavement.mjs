import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {generate} from '../src/scene.mjs';
import {sidewalks} from '../src/streetscape.mjs';
import {junctionPatches} from '../src/road-network.mjs';
import {resolveRoadSurfaces} from '../src/road-surfaces.mjs';
import {roadFaceRings,polygonObstacles,obstacle,area,subtract} from '../src/pavement-clip.mjs';
const results=[];
for(const folder of process.argv.slice(2)){
 const base=generate(JSON.parse(await readFile(`${folder}/area.geojson`,'utf8'))),roads=base.objects.filter(o=>o.extras?.path),footprints=base.objects.filter(o=>o.extras?.footprint).map(o=>o.extras.footprint);
 const segments=roads.flatMap(o=>o.extras.path.slice(1).map((b,i)=>({a:o.extras.path[i],b,width:o.extras.width,road:o.name,highway:o.extras.highway})));
 const faces=roadFaceRings(resolveRoadSurfaces([...roads,...junctionPatches(segments)])),walks=sidewalks(segments,footprints,0,faces),blocks=[...polygonObstacles(footprints),...faces.map(r=>obstacle(r))];let collisions=0,pavingOverlaps=0;
 const paving=walks.pads.map(r=>obstacle(r,0));
 for(let i=0;i<paving.length;i++)for(let j=0;j<i;j++){const a=paving[i],b=paving[j],x=a.bounds,y=b.bounds;if(x[0]>=y[2]||x[2]<=y[0]||x[1]>=y[3]||x[3]<=y[1])continue;if(area(a.ring)-subtract(a.ring,b.ring,0).reduce((s,r)=>s+area(r),0)>1e-5)pavingOverlaps++;}
 for(const p of walks.pads){const box=obstacle(p).bounds;for(const o of blocks){const b=o.bounds;if(box[0]>=b[2]||box[2]<=b[0]||box[1]>=b[3]||box[3]<=b[1])continue;const overlap=area(p)-subtract(p,o.ring,0).reduce((s,r)=>s+area(r),0);if(overlap>1e-5)collisions++;}}
 const result={folder,buildings:footprints.length,roads:roads.length,pads:walks.pads.length,pavedAreaM2:Math.round(walks.pads.reduce((s,p)=>s+area(p),0)),buildingOrRoadOverlaps:collisions,pavingOverlaps,finite:walks.objects.every(o=>o.positions.every(Number.isFinite))};results.push(result);console.log(JSON.stringify(result));
}
await mkdir('output/validation',{recursive:true});await writeFile('output/validation/pavement.json',JSON.stringify(results,null,2));
if(results.some(r=>r.buildingOrRoadOverlaps||r.pavingOverlaps||!r.finite))process.exitCode=1;
