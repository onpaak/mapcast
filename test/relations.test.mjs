import {test} from 'node:test';
import assert from 'node:assert/strict';
import {joinRings,relationPolygons} from '../src/relations.mjs';
import {polygonMesh} from '../src/polygon-mesh.mjs';
import {fromOverpass} from '../src/osm.mjs';
import {insidePolygon} from '../src/spatial.mjs';
test('joins unordered and reversed way fragments into a closed ring',()=>{
  const parts=[[[0,0],[5,0]],[[0,5],[5,5]],[[0,0],[0,5]],[[5,0],[5,5]]];
  assert.equal(joinRings(parts)[0].length,5);assert.throws(()=>joinRings(parts.slice(0,3)),/missing/);
});
test('courtyard roof area excludes hole and its normals face upward',()=>{
  const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[3,3],[7,3],[7,7],[3,7],[3,3]],mesh=polygonMesh([outer,hole],12);
  let area=0;
  for(let i=0;i<mesh.positions.length;i+=9){if(mesh.normals[i+1]<.99)continue;const a=mesh.positions.slice(i,i+3),b=mesh.positions.slice(i+3,i+6),c=mesh.positions.slice(i+6,i+9);area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;assert.equal(insidePolygon([(a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3],hole),false);}
  assert.equal(area,84);
  let inwardWall=false;
  for(let i=0;i<mesh.positions.length;i+=3){if(mesh.positions[i]===3&&mesh.normals[i]>.99)inwardWall=true;}
  assert.ok(inwardWall,'courtyard wall must face into the hole');
});
test('OSM relation imports once and retains source member IDs',()=>{
  const geometry=r=>r.map(([lon,lat])=>({lon,lat}));
  const raw={elements:[{type:'way',id:1,tags:{building:'yes'},geometry:geometry([[0,0],[.001,0],[.001,.001],[0,.001],[0,0]])},{type:'way',id:2,geometry:geometry([[.0002,.0002],[.0004,.0002],[.0004,.0004],[.0002,.0004],[.0002,.0002]])},{type:'relation',id:3,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'inner'}]}]};
  const data=fromOverpass(raw);assert.equal(data.features.length,1);assert.equal(data.features[0].id,'relation/3');assert.equal(data.features[0].geometry.coordinates.length,2);assert.deepEqual(data.features[0].properties.osm_member_ids,['way/1','way/2']);assert.equal(data.warnings.length,0);
});
test('assigns holes to correct part of disjoint multipolygon',()=>{
  const geom=r=>r.map(([lon,lat])=>({lon,lat}));const relation={tags:{type:'multipolygon'},members:[{type:'way',ref:1,role:'outer',geometry:geom([[0,0],[5,0],[5,5],[0,5],[0,0]])},{type:'way',ref:2,role:'outer',geometry:geom([[10,0],[15,0],[15,5],[10,5],[10,0]])},{type:'way',ref:3,role:'inner',geometry:geom([[11,1],[12,1],[12,2],[11,2],[11,1]])}]};
  const parts=relationPolygons(relation,new Map(),new Map());assert.equal(parts.length,2);assert.equal(parts[0].length,1);assert.equal(parts[1].length,2);
});
