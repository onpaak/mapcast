import test from 'node:test';
import assert from 'node:assert/strict';
import {isBusStopNode,busShelterParts,busStopPoleParts} from '../src/bus-stops.mjs';
import {fromOverpass,buildQuery} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {PAVEMENT_TOP} from '../src/ps2.mjs';

const m=1/111195;
const stop=(id,x,z,tags={})=>({type:'Feature',id,properties:{highway:'bus_stop',...tags},geometry:{type:'Point',coordinates:[x*m,-z*m]}});
// One east-west street 10 m wide through the origin (+z is south), a block close to its south
// kerb at x 35..55, and mapped stops around it.
function street(){
  const features=[
    {type:'Feature',id:'way/1',properties:{highway:'secondary',width:'10'},geometry:{type:'LineString',coordinates:[[-60*m,0],[60*m,0]]}},
    {type:'Feature',id:'way/2',properties:{building:'apartments','building:levels':'4'},geometry:{type:'Polygon',coordinates:[[[35*m,-6*m],[55*m,-6*m],[55*m,-20*m],[35*m,-20*m],[35*m,-6*m]]]}},
    stop('node/1',-30,7),stop('node/2',-26,7),stop('node/3',-28,-7),stop('node/4',20,7,{shelter:'no'}),stop('node/5',0,28),stop('node/6',45,5.8)];
  return concreteCity(generate({type:'FeatureCollection',selectionBounds:[-65*m,-30*m,65*m,30*m],features}));
}

test('bus stops are the mapped stop and bus platform nodes',()=>{
  assert.ok(isBusStopNode({highway:'bus_stop'}));
  assert.ok(isBusStopNode({public_transport:'platform',bus:'yes'}));
  assert.equal(isBusStopNode({public_transport:'platform',tram:'yes'}),false);
  assert.equal(isBusStopNode({public_transport:'stop_position',bus:'yes'}),false,'the stop position is on the carriageway');
  const node=(id,tags)=>({type:'node',id,lat:.0001,lon:.0001,tags});
  const data=fromOverpass({elements:[node(1,{highway:'bus_stop'}),node(2,{public_transport:'platform',bus:'yes'}),node(3,{public_transport:'platform',tram:'yes'})]},{bounds:[0,0,.0002,.0002]});
  assert.deepEqual(data.features.map(f=>f.id),['node/1','node/2']);
  assert.match(buildQuery([13.4,52.52,13.401,52.521]),/node\["highway"="bus_stop"\]/);
});

test('a mapped stop gets a shelter at its kerb, or a pole where there is no room or no shelter',()=>{
  const scene=street(),record=id=>scene.metadata.busStops.find(r=>r.sourceId===id);
  const steel=id=>scene.objects.find(o=>o.extras?.sourceId===id&&o.name.endsWith('_steel'));
  // Back of the stop: local +z turned by the instance yaw.
  const back=o=>[Math.sin(o.extras.instanceYaw),Math.cos(o.extras.instanceYaw)];
  assert.equal(record('node/1').kind,'shelter');
  assert.deepEqual(back(steel('node/1')).map(v=>Math.round(v)+0),[0,1],'south side: the back faces away from the road');
  assert.ok(Math.abs(steel('node/1').extras.instanceOrigin[2]-5.3)<1e-6,'0.3 m back from the kerb');
  assert.equal(record('node/2').status,'merged','the same stop mapped twice on the same side');
  assert.equal(record('node/3').kind,'shelter','a stop across the road is its own stop');
  assert.deepEqual(back(steel('node/3')).map(v=>Math.round(v)+0),[0,-1]);
  assert.deepEqual([record('node/4').kind,record('node/4').kindSource],['pole','OSM shelter=no']);
  assert.equal(record('node/5').status,'skipped');
  assert.deepEqual([record('node/6').kind,record('node/6').kindSource],['pole','no room for a shelter'],'the block leaves 1 m of pavement');
  assert.deepEqual(scene.metadata.busStopSummary,{shelter:2,merged:1,pole:2,skipped:1});
  // Everything stands on the pavement slab and shares one mesh per part.
  const parts=scene.objects.filter(o=>o.name.startsWith('BusStop_'));
  assert.ok(parts.every(o=>o.extras.instanceOrigin[1]===PAVEMENT_TOP&&o.extras.assetKey&&o.texcoords.length/2===o.positions.length/3));
  assert.equal(scene.metadata.assetInstances['bus-shelter-steel'],2);
  assert.equal(scene.materials[parts.find(o=>o.name.endsWith('_glass')).material].alphaMode,'BLEND');
});

test('shelter and pole faces point the way their normals say, and their pictures read the right way round',()=>{
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  for(const P of [busShelterParts(0),busShelterParts(3),busStopPoleParts()])for(const [part,mesh] of Object.entries(P))for(let i=0;i<mesh.positions.length;i+=9){
    const p=[0,3,6].map(k=>mesh.positions.slice(i+k,i+k+3)),n=mesh.normals.slice(i,i+3);
    assert.ok(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),n)>0,`${part} triangle faces its normal`);
    if(!['ad','flag','table'].includes(part))continue;
    // Seen from in front, u grows to the viewer's right and v (0 at the image top) downwards.
    const right=cross(n.map(v=>-v),[0,1,0]),uv=[0,1,2].map(k=>mesh.texcoords.slice((i/3+k)*2,(i/3+k)*2+2));
    const a=[dot(sub(p[1],p[0]),right),p[1][1]-p[0][1]],b=[dot(sub(p[2],p[0]),right),p[2][1]-p[0][1]],det=a[0]*b[1]-a[1]*b[0];
    const grad=c=>{const d1=uv[1][c]-uv[0][c],d2=uv[2][c]-uv[0][c];return [(d1*b[1]-d2*a[1])/det,(a[0]*d2-b[0]*d1)/det];};
    assert.ok(grad(0)[0]>0&&Math.abs(grad(0)[1])<1e-9,`${part}: not mirrored`);
    assert.ok(grad(1)[1]<0&&Math.abs(grad(1)[0])<1e-9,`${part}: not upside down`);
  }
});
