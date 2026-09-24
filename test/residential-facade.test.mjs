import test from 'node:test';
import assert from 'node:assert/strict';
import {balconyFits} from '../src/residential-facade.mjs';
const rect=depth=>[[0,0],[20,0],[20,depth],[0,depth],[0,0]];
test('recess fits broad buildings but rejects thin wings and courtyard walls',()=>{
 const a=[0,0],b=[20,0],out=[0,-1];
 assert.equal(balconyFits(rect(8),[],a,b,out,3,6),true);
 assert.equal(balconyFits(rect(1),[],a,b,out,3,6),false);
 assert.equal(balconyFits(rect(8),[[[4,1],[5,1],[5,3],[4,3]]],a,b,out,3,6),false);
});
test('concave notch inside recess is rejected even when all recess corners are inside',()=>{
 const ring=[[0,0],[20,0],[20,8],[5,8],[5,.8],[4,.8],[4,8],[0,8],[0,0]];
 assert.equal(balconyFits(ring,[],[0,0],[20,0],[0,-1],3,6),false);
});
