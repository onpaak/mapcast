import test from 'node:test';
import assert from 'node:assert/strict';
import {streetCamera} from '../src/street-camera.mjs';
test('street view faces populated interior and is independent of way direction',()=>{
 const rect=(x,z)=>[[x,z],[x+10,z],[x+10,z+10],[x,z+10],[x,z]];
 const buildings=[rect(0,10),rect(25,10),rect(50,10),rect(25,-20)];
 const road={a:[-100,0],b:[0,0]};
 const camera=streetCamera([road],buildings);
 assert.ok(camera.target[0]>camera.eye[0]);
 assert.deepEqual(camera,streetCamera([{a:road.b,b:road.a}],buildings));
 assert.equal(streetCamera([{a:[0,0],b:[2,0]}],buildings),null);
});
