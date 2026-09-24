import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLongitude,normalizeBounds,boundsFromCorners,validateSelection} from '../web/bounds.js';

test('wrapped American longitudes normalize to the canonical world copy',()=>{
  assert.equal(normalizeLongitude(282.968584),-77.031416);
  assert.equal(normalizeLongitude(285.99),-74.01);
  assert.deepEqual(normalizeBounds([282.968584,38.895352,282.97491,38.898768]),[-77.031416,38.895352,-77.02509,38.898768]);
  assert.deepEqual(boundsFromCorners({lng:282.97491,lat:38.898768},{lng:282.968584,lat:38.895352}),[-77.031416,38.895352,-77.02509,38.898768]);
});

test('validation explains coordinate and size failures separately',()=>{
  assert.equal(validateSelection([282,38,283,39],1000).error,'longitudeRange');
  assert.equal(validateSelection([-73,40,-74,41],1000).error,'westEast');
  assert.equal(validateSelection([-74.02,40.70,-73.98,40.74],1000).error,'tooLarge');
  assert.equal(validateSelection([-77.031416,38.895352,-77.02509,38.898768],1000).valid,true);
});

test('four-point areas are ordered counter-clockwise and must be convex',async()=>{
  const {normalizeArea,validateAreaSelection}=await import('../web/bounds.js');
  const diamond=[[13.4,52.499],[13.401,52.5],[13.4,52.501],[13.399,52.5]];
  assert.deepEqual(normalizeArea([...diamond].reverse()),diamond);
  assert.equal(validateAreaSelection(diamond,1000).valid,true);
  assert.equal(validateAreaSelection([diamond[0],diamond[2],diamond[1],diamond[3]],1000).error,'notConvex');
  assert.equal(validateAreaSelection(diamond.slice(0,3),1000).error,'areaIncomplete');
  assert.equal(validateAreaSelection([[13.40,52.52],[13.43,52.52],[13.43,52.53],[13.40,52.53]],1000).error,'tooLarge');
});
