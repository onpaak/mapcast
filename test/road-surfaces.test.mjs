import test from 'node:test';
import assert from 'node:assert/strict';
import {roadRibbon} from '../src/geometry.mjs';
import {resolveRoadSurfaces} from '../src/road-surfaces.mjs';
import {area,roadFaceRings,subtract} from '../src/pavement-clip.mjs';
const road=(name,path,width,highway)=>({name,...roadRibbon(path,width),extras:{path,width,highway}});
test('stone service entrances stop at main road edge without overlapping faces or losing union area',()=>{
 const main=road('main',[[-20,0],[20,0]],8,'residential'),side=road('side',[[0,0],[0,12]],5,'service');
 const output=resolveRoadSurfaces([side,main]);
 assert.deepEqual(output,resolveRoadSurfaces([main,side]).toReversed());
 const faces=output.map(o=>roadFaceRings([o]));
 assert.ok(Math.abs(faces.flat().reduce((s,r)=>s+area(r),0)-360)<1e-5);
 assert.ok(faces[0].flat().every(p=>p[1]>=4-1e-7));
 for(const a of faces[0])for(const b of faces[1])assert.ok(Math.abs(area(a)-subtract(a,b,0).reduce((s,r)=>s+area(r),0))<1e-6);
 assert.ok(output.every(o=>o.positions.every(Number.isFinite)&&o.normals.every((n,i)=>n===(i%3===1?1:0))));
});
test('junction infill cannot overwrite either road and duplicate roads leave a single surface',()=>{
 const a=road('a',[[-10,0],[10,0]],8,'residential'),b=road('b',[[-10,0],[10,0]],8,'residential');
 const output=resolveRoadSurfaces([b,a,{...a,name:'Junction_0',extras:{}}]);
 assert.equal(output[0].positions.length,0);assert.equal(output[2].positions.length,0);
 assert.equal(roadFaceRings([output[1]]).reduce((s,r)=>s+area(r),0),160);
});
