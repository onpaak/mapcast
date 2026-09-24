import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roadRibbon,extrude} from '../src/geometry.mjs';
import {walkingSurfaces,walkingWidth} from '../src/walking-surfaces.mjs';
import {area,subtract,roadFaceRings} from '../src/pavement-clip.mjs';
import {polygonMesh} from '../src/polygon-mesh.mjs';
const route=(id,path)=>({name:`Walkway_${id}`,...roadRibbon(path,2),extras:{sourceId:id,walkingPath:path,highway:'footway'}});
const ring=[[4,-3],[6,-3],[6,3],[4,3]];
test('mapped walking routes clip buildings, roads, existing sidewalks and duplicate routes',()=>{
 const routes=[route('a',[[0,0],[12,0]]),route('b',[[0,0],[12,0]])];
 const sidewalk=[[8,-2],[10,-2],[10,2],[8,2]];
 const result=walkingSurfaces(routes,[extrude(ring,8)],[sidewalk],0);
 assert.ok(result.objects.length);
 assert.ok(result.records[0].retainedArea<result.records[0].originalArea);
 assert.equal(result.records[1].retainedArea,0);
 for(const p of result.pads)for(const b of [ring,sidewalk])assert.ok(area(p)-subtract(p,b,0).reduce((n,r)=>n+area(r),0)<1e-6);
 assert.ok(result.objects.every(o=>o.positions.every(Number.isFinite)));
 assert.ok(result.objects.every(o=>o.positions.filter((_,i)=>i%3===1).every(y=>y===.025)));
});
test('walking routes in courtyard remain while building walls block through routes',()=>{
 const outer=[[-5,-5],[5,-5],[5,5],[-5,5]],hole=[[-3,-3],[-3,3],[3,3],[3,-3]];
 const result=walkingSurfaces([route('a',[[-2,0],[2,0]])],[polygonMesh([outer,hole],8)],[],0);
 assert.ok(Math.abs(result.records[0].retainedArea-8)<1e-6);
 assert.ok(roadFaceRings(result.objects).length);
});
test('walking width uses explicit narrow path widths and conservative defaults',()=>{
 assert.equal(walkingWidth({highway:'path',width:'0.8 m'}).width,.8);
 assert.equal(walkingWidth({highway:'footway'}).width,1.8);
 assert.equal(walkingWidth({highway:'pedestrian'}).width,5);
});
