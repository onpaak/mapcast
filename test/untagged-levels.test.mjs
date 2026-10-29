import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {validateRequest} from '../src/server.mjs';

const square=(x,s)=>[[[x,0],[x+s,0],[x+s,s],[x,s],[x,0]]];
const building=(id,properties,x,s=.0003)=>({type:'Feature',id,properties,geometry:{type:'Polygon',coordinates:square(x,s)}});
const heights=scene=>Object.fromEntries(scene.objects.filter(o=>o.name.startsWith('Building_')).map(o=>[o.extras.sourceId,[o.extras.height,o.extras.heightSource]]));

test('the storeys setting replaces only the 12 m default, never a mapped or type-based height',()=>{
  const data={type:'FeatureCollection',features:[
    building('way/1',{building:'apartments'},0),
    building('way/2',{building:'apartments','building:levels':'6'},.001),
    building('way/3',{building:'garage'},.002,.00005),
    building('way/4',{building:'yes'},.003,.0001),
    {type:'Feature',id:'way/5',properties:{'building:part':'yes'},geometry:{type:'Polygon',coordinates:square(.004,.0002)}}]};
  const plain=heights(generate(data)),set=heights(generate(data,{defaultLevels:20}));
  assert.deepEqual(plain['way/1'],[12,'default']);
  assert.deepEqual(set['way/1'],[60,'user setting']);
  assert.deepEqual(set['way/5'],[60,'user setting'],'a section on its own takes the setting too');
  for(const id of ['way/2','way/3','way/4'])assert.deepEqual(set[id],plain[id],id);
});

test('a generation request takes storeys as a whole number from 1 to 60',()=>{
  const bounds=[13.401,52.527,13.403,52.528];
  assert.equal(validateRequest({bounds}).levels,undefined);
  assert.equal(validateRequest({bounds,levels:18}).levels,18);
  for(const levels of [0,61,2.5,'8'])assert.throws(()=>validateRequest({bounds,levels}),/levels/);
});
