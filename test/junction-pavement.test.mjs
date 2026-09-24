import test from 'node:test';
import assert from 'node:assert/strict';
import {roadRibbon} from '../src/geometry.mjs';
import {junctionPatches} from '../src/road-network.mjs';
import {resolveRoadSurfaces} from '../src/road-surfaces.mjs';
import {sidewalks} from '../src/streetscape.mjs';
import {area,subtract,roadFaceRings} from '../src/pavement-clip.mjs';
for(const [name,angles] of [['T',[0,90,180]],['oblique',[0,60,180]],['five-arm',[0,65,140,220,290]]])test(`${name} junction retains paving without road or paving overlap`,()=>{
 const segments=angles.map((angle,i)=>({a:[0,0],b:[30*Math.cos(angle*Math.PI/180),30*Math.sin(angle*Math.PI/180)],width:i?6:9,road:`r${i}`}));
 const roads=segments.map(s=>({name:s.road,...roadRibbon([s.a,s.b],s.width),extras:{path:[s.a,s.b],width:s.width,highway:'residential'}}));
 const faces=roadFaceRings(resolveRoadSurfaces([...roads,...junctionPatches(segments)])),walks=sidewalks(segments,[],0,faces);
 assert.ok(walks.pads.reduce((s,p)=>s+area(p),0)>angles.length*50);
 const remaining=(a,b)=>subtract(a,b,0).reduce((s,p)=>s+area(p),0);
 for(let i=0;i<walks.pads.length;i++){
  const p=walks.pads[i];for(const r of [...faces,...walks.pads.slice(0,i)])assert.ok(Math.abs(area(p)-remaining(p,r))<1e-5);
 }
 assert.ok(walks.objects.every(o=>o.positions.every(Number.isFinite)));
});
