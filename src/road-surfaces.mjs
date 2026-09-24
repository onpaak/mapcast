import {extrude} from './geometry.mjs';
import {roadFaceRings,clipPavement,obstacle} from './pavement-clip.mjs';

const ranks={motorway:9,trunk:8,primary:7,secondary:6,tertiary:5,unclassified:4,residential:3,living_street:2,service:1,track:0};
// A road owns its overlap before a lower-priority street. Junction patches
// fill only uncovered corners, never paint over an existing carriageway.
export function resolveRoadSurfaces(objects){
 const ordered=[...objects].sort((a,b)=>Number(!!b.extras?.path)-Number(!!a.extras?.path)||(ranks[b.extras?.highway]??0)-(ranks[a.extras?.highway]??0)||(b.extras?.width??0)-(a.extras?.width??0)||a.name.localeCompare(b.name));
 const occupied=[],resolved=new Map();
 for(const object of ordered){
  const positions=[],normals=[];
  for(const face of roadFaceRings([object])){
   const pieces=clipPavement(face,occupied,1e-7);
   for(const ring of pieces){const mesh=extrude(ring,0,.025);positions.push(...mesh.positions);normals.push(...mesh.normals);occupied.push(obstacle(ring,0));}
  }
  resolved.set(object.name,{...object,positions,normals,extras:{...object.extras,surfaceOwnership:'road-priority-clipped'}});
 }
 return objects.map(o=>resolved.get(o.name));
}
