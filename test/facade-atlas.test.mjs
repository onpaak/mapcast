import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {encodeGLB} from '../src/glb.mjs';
import {insidePolygon} from '../src/spatial.mjs';
import {facadeAtlas,cellUV,groundCell,upperCell,windowPixels,facadeProfiles,curtainCell} from '../src/facade-atlas.mjs';
import {atlasCell} from '../src/city/facade-bays.mjs';

const block=(extra=[],levels='6')=>({type:'FeatureCollection',selectionBounds:[-.0002,-.0002,.0005,.0003],features:[
 {id:'way/7',properties:{building:'apartments','building:levels':levels},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.00012],[0,.00012],[0,0]]]}},...extra]});
const street={id:'way/8',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,-.00008],[.0005,-.00008]]}};
const triangles=scene=>scene.objects.filter(o=>o.name.startsWith('Building_')).reduce((s,o)=>s+o.positions.length/9,0);

test('facade atlas is a power-of-two texture whose emission is limited to lit windows',()=>{
 const {color,emissive}=facadeAtlas();
 for(const t of [color,emissive])assert.deepEqual([t.width,t.height],[512,512]);
 const glowIn=([row,col])=>{let sum=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++)sum+=emissive.rgba[((row*64+y)*512+col*64+x)*4];return sum;};
 assert.equal(glowIn(upperCell(0,50)),0,'dark window cell does not glow');
 assert.equal(glowIn(upperCell(0,30)),0,'curtained window cell does not glow');
 assert.ok(glowIn(upperCell(0,0))>0,'lit-warm cell glows');
 assert.ok(glowIn(upperCell(0,18))>0,'lit-cool cell glows');
 assert.ok(glowIn(groundCell(0,{brick:true,seed:3}))>0);
 assert.equal(glowIn(groundCell(0,{brick:true,seed:60})),0);
 const uv=cellUV([2,3]);assert.ok(uv.u0>=0&&uv.u1<=1&&uv.v0>=0&&uv.v1<=1&&uv.u0<uv.u1&&uv.v0<uv.v1);
 for(const p of facadeProfiles){const w=windowPixels(p);assert.ok(w.top>0&&w.bottom<64&&w.left<w.right&&w.top<w.bottom,p.name);assert.ok(w.left>0&&w.right<64,p.name);}
 // Tower cells: the lit pattern cell glows, the all-dark cell does not.
 const tower=facadeProfiles.findIndex(p=>p.grid);assert.ok(tower>=0);
 assert.equal(glowIn([tower,0]),0);assert.ok(glowIn([tower,3])>0);
 const square=windowPixels(facadeProfiles.find(p=>p.name==='square-windows'));assert.ok(Math.abs((square.right-square.left)-(square.bottom-square.top))<=2,'square windows are square');
});

test('upper floors are outward-facing atlas quads and the emissive map survives export',()=>{
 const base=generate(block([street])),scene=concreteCity(base),ring=base.objects.find(o=>o.extras?.footprint).extras.footprint;
 const facade=scene.objects.find(o=>o.name.endsWith('_FacadeAtlas'));
 assert.ok(facade);assert.equal(facade.texcoords.length,facade.positions.length/3*2);
 assert.ok(facade.texcoords.every(v=>v>=0&&v<=1));
 for(let i=0;i<facade.positions.length;i+=9){
  const p=facade.positions.slice(i,i+3),q=facade.positions.slice(i+3,i+6).map((v,j)=>v-p[j]),r=facade.positions.slice(i+6,i+9).map((v,j)=>v-p[j]),normal=facade.normals.slice(i,i+3);
  const cross=[q[1]*r[2]-q[2]*r[1],q[2]*r[0]-q[0]*r[2],q[0]*r[1]-q[1]*r[0]];
  assert.ok(cross.reduce((s,v,j)=>s+v*normal[j],0)>0,'winding matches normal');
  // Front faces of the building shell point away from the footprint.
  if(Math.abs(normal[1])<.5&&[0,3,6].every(k=>{const x=facade.positions[i+k],z=facade.positions[i+k+2];return ring.slice(1).some((b,e)=>{const a=ring[e],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return Math.abs((x-a[0])*(b[1]-a[1])-(z-a[1])*(b[0]-a[0]))/len<1e-3;});})){
   const c=[0,2].map(k=>(p[k]+facade.positions[i+3+k]+facade.positions[i+6+k])/3);
   assert.ok(!insidePolygon([c[0]+normal[0]*.1,c[1]+normal[2]*.1],ring),'shell face points outward');
  }
 }
 const material=scene.materials[facade.material];
 assert.equal(scene.textures[material.emissiveTexture.index].name,'Facade_atlas_emissive_512');
 const glb=encodeGLB(scene.objects,scene.materials,scene.metadata,scene.textures),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
 const exported=json.materials.find(m=>m.name===material.name);
 assert.equal(json.images[json.textures[exported.emissiveTexture.index].source].name,'Facade_atlas_emissive_512');
});

test('modelled glazing stays on the street-facing ground floor',()=>{
 const base=generate(block([street])),scene=concreteCity(base),ring=base.objects.find(o=>o.extras?.footprint).extras.footprint;
 const fh=base.objects.find(o=>o.extras?.footprint).extras.height/6;
 const edge=scene.metadata.entranceLayouts[0].edge,a=ring[edge],b=ring[edge+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
 const glass=scene.objects.filter(o=>o.name.startsWith('Building_')&&!o.name.endsWith('_FacadeAtlas')&&scene.materials[o.material].name.toLowerCase().includes('glass'));
 assert.ok(glass.length>0);
 for(const o of glass)for(let i=0;i<o.positions.length;i+=3){
  const [x,y,z]=o.positions.slice(i,i+3);
  assert.ok(y<=fh+1e-6,'no modelled glass above the ground floor');
  assert.ok(Math.abs((x-a[0])*(b[1]-a[1])-(z-a[1])*(b[0]-a[0]))/len<.5,'modelled glass only on the street edge');
 }
});

test('a six-storey panel block stays within the PS2 triangle budget',()=>{
 const scene=concreteCity(generate(block([street])));
 assert.ok(triangles(scene)<1500,`building triangles ${triangles(scene)}`);
});

test('lite detail paints every facade from the atlas and drops street props',()=>{
 const full=concreteCity(generate(block([street]))),lite=concreteCity(generate(block([street])),{detail:'lite'});
 assert.equal(lite.metadata.detail,'lite');
 assert.ok(triangles(lite)<triangles(full)*.6,`lite ${triangles(lite)} vs full ${triangles(full)}`);
 assert.ok(!lite.objects.some(o=>o.name.startsWith('StreetProps_')));
 assert.ok(!lite.objects.some(o=>o.name.startsWith('Building_')&&/glass/i.test(lite.materials[o.material].name)),'no modelled glazing');
});

test('glass-tagged buildings get curtain walls that light whole floors; others keep concrete',()=>{
 const tower=tags=>({type:'FeatureCollection',selectionBounds:[-.0002,-.0002,.0005,.0003],features:[{id:'way/40',properties:{building:'office','building:levels':'20',...tags},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.00012],[0,.00012],[0,0]]]}},street]});
 const facade=tags=>{const city=concreteCity(generate(tower(tags))),o=city.objects.find(o=>o.name==='Building_way/40_FacadeAtlas');return {city,o,material:city.materials[o.material]};};
 const glass=facade({'building:material':'glass'});
 assert.equal(glass.material.name,'Facade atlas curtain glass');
 assert.ok(glass.material.pbrMetallicRoughness.roughnessFactor<.3,'glossy enough to reflect the sky');
 assert.ok(glass.o.texcoords.every((v,i)=>i%2?v>=448/512:v>=384/512),'only curtain cells are sampled');
 assert.equal(glass.city.metadata.concreteFamilies[0].facade,'curtain-wall');
 assert.equal(glass.city.metadata.streetProps.acUnits,0);
 // The facade material wins over the building material; untagged towers stay concrete.
 for(const tags of [{'building:material':'glass','building:facade:material':'concrete'},{}])
  assert.match(facade(tags).material.name,/^Facade atlas (concrete|plaster|cool concrete)$/);

 // Emission: dark glass and spandrels never glow; lit cells do.
 const {emissive}=facadeAtlas(),glow=([row,col],y0=0,y1=64)=>{let s=0;for(let y=y0;y<y1;y++)for(let x=0;x<64;x++)s+=emissive.rgba[((row*64+y)*512+col*64+x)*4];return s;};
 assert.equal(glow(curtainCell(false)),0);
 assert.ok(glow(curtainCell(true),0,54)>0);assert.equal(glow(curtainCell(true),55,64),0,'the spandrel stays dark');
 // A floor is lit or dark as a whole, apart from the odd bay; about a third are lit.
 const building={glass:true,id:'way/41'};let litFloors=0;
 for(let floor=0;floor<60;floor++){
  const lit=Array.from({length:10},(_,col)=>atlasCell(building,floor,`way/41:0:${floor}:${col}`)[1]===curtainCell(true)[1]).filter(Boolean).length;
  assert.ok(lit===0||lit>=6,`floor ${floor} is mixed: ${lit}/10 lit`);if(lit)litFloors++;
 }
 assert.ok(litFloors>=10&&litFloors<=32,`${litFloors} of 60 floors lit`);
});
