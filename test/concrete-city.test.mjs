import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {encodeGLB} from '../src/glb.mjs';

test('OSM use selects retail and loading frontages without changing plain residential buildings',()=>{
 const make=(building,extra={})=>concreteCity(generate({type:'FeatureCollection',features:[{id:'way/90',properties:{building,'building:levels':'2',...extra},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.00012],[0,.00012],[0,0]]]}}]}));
 assert.equal(make('apartments').metadata.frontages.length,0);
 assert.equal(make('apartments',{shop:'no'}).metadata.frontages.length,0);
 const shop=make('apartments',{shop:'bakery'});
 assert.ok(shop.metadata.frontages.some(f=>f.type==='display-window'));
 assert.equal(shop.metadata.frontages.filter(f=>f.type==='street-door').length,1);
 const warehouse=make('warehouse'),loading=warehouse.metadata.frontages.filter(f=>f.type==='loading-door');
 assert.ok(loading.length>0);assert.ok(loading.every(f=>f.bounds[2]===0));
 assert.equal(warehouse.metadata.frontages.filter(f=>f.type==='street-door').length,1);
 for(const scene of [shop,warehouse]){
   assert.ok(scene.objects.every(o=>o.positions.every(Number.isFinite)));
   // +1 for the ground-floor kit's shared weathered paint tile.
   assert.ok(scene.metadata.textureReuse.sharedBuildingTextures<=9);
  assert.ok(scene.textures.filter(t=>t.name==='Shared_window_posters_128x192').length<=1);
   const bays=scene.metadata.frontages.map(f=>`${f.edge}/${f.bay}`);assert.equal(new Set(bays).size,bays.length);
 }
});
test('concrete facade reserves ground entrance and exports finite recessed geometry',()=>{
 const data={type:'FeatureCollection',features:[{id:'way/1',properties:{building:'apartments','building:levels':'6'},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.00012],[0,.00012],[0,0]]]}}]};
 const base=generate(data),scene=concreteCity(base),walls=scene.objects.filter(o=>o.name.startsWith('Building_'));
 assert.equal(scene.metadata.entranceLayouts.length,1);assert.equal(scene.metadata.entranceLayouts[0].bottom,0);
 const entrance=scene.metadata.entranceLayouts[0],ring=base.objects.find(o=>o.extras?.footprint).extras.footprint,a=ring[entrance.edge],b=ring[entrance.edge+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/length,(b[1]-a[1])/length];
 assert.equal(entrance.doorType,'solid');
 const leaf=walls.find(o=>scene.materials[o.material].name==='Oxide painted entrance'),ys=leaf.positions.filter((_,i)=>i%3===1);
 assert.equal(Math.min(...ys),0);assert.equal(Math.max(...ys),entrance.bounds[3]);
 for(const o of walls.filter(o=>scene.materials[o.material].name.toLowerCase().includes('glass'))){
   for(let i=0;i<o.positions.length;i+=3){const [x,y,z]=o.positions.slice(i,i+3),along=(x-a[0])*u[0]+(z-a[1])*u[1],away=Math.abs((x-a[0])*u[1]-(z-a[1])*u[0]);
     assert.ok(!(away<.3&&y<entrance.bounds[3]&&along>entrance.bounds[0]&&along<entrance.bounds[1]),'no glazing within solid door opening');
   }
   for(let i=0;i<o.positions.length;i+=9){const p=o.positions.slice(i,i+3),q=o.positions.slice(i+3,i+6).map((v,j)=>v-p[j]),r=o.positions.slice(i+6,i+9).map((v,j)=>v-p[j]),cross=[q[1]*r[2]-q[2]*r[1],q[2]*r[0]-q[0]*r[2],q[0]*r[1]-q[1]*r[0]];
     assert.ok(cross.reduce((s,v,j)=>s+v*o.normals[i+j],0)>0,'exterior panel winding matches outward normal');
   }
 }
 assert.ok(walls.every(o=>o.positions.every(Number.isFinite)));
 assert.ok(walls.some(o=>o.extras.styleFamily==='recessed-balcony-residential'));
 assert.ok(!walls.some(o=>o.name==='Building_way/1'));
 assert.ok(walls.every(o=>o.texcoords.length===o.positions.length/3*2&&o.texcoords.every(Number.isFinite)));
 assert.equal(new Set(scene.textures.map(t=>t.name)).size,scene.textures.length);
 assert.ok(scene.textures.some(t=>t.name==='Shared_concrete_64'||t.name==='Shared_plaster_64'));
 assert.ok(scene.textures.every(t=>!t.name.startsWith('Ground_residential')));
 for(const m of scene.materials){const index=m.pbrMetallicRoughness.baseColorTexture?.index;if(index!==undefined)assert.ok(scene.textures[index]);}
 assert.equal(encodeGLB(scene.objects,scene.materials,scene.metadata,scene.textures).subarray(0,4).toString(),'glTF');
});

test('window variation and shared surface assignments remain stable when source order changes',()=>{
 const feature=(id,x)=>({id,properties:{building:'apartments','building:levels':'5'},geometry:{type:'Polygon',coordinates:[[[x,0],[x+.0003,0],[x+.0003,.00012],[x,.00012],[x,0]]]}});
 const features=[feature('way/11',0),feature('way/12',.0005)],data={type:'FeatureCollection',selectionBounds:[-.0001,-.0001,.001,.0003],features};
 const a=concreteCity(generate(data)),b=concreteCity(generate({...data,features:[...features].reverse()}));
 const signature=scene=>scene.objects.filter(o=>o.name.startsWith('Building_')).map(o=>({name:o.name,material:scene.materials[o.material].name,positions:o.positions})).sort((x,y)=>x.name.localeCompare(y.name));
 assert.deepEqual(signature(a),signature(b));
 assert.ok(a.metadata.textureReuse.sharedBuildingTextures<=7);
 assert.ok(a.materials.some(m=>m.name==='Unlit glass'));
});

test('curtain walls and towers keep a painted ground floor and carry no hung signs',()=>{
 const make=properties=>concreteCity(generate({type:'FeatureCollection',features:[{id:'way/95',properties,geometry:{type:'Polygon',coordinates:[[[0,0],[.0006,0],[.0006,.00015],[0,.00015],[0,0]]]}}]}));
 for(const properties of [{building:'retail','building:levels':'5','building:material':'glass',shop:'mall'},{building:'apartments','building:levels':'14',shop:'bakery'}]){
   const {metadata,objects,materials}=make(properties);
   for(const key of ['entranceLayouts','frontages','shopSigns','shopBlades','streetSigns','windowPosters','shopCanopies'])assert.deepEqual(metadata[key],[],key);
   assert.ok(!objects.some(o=>/_(TowerSign|StreetSign|ShopSign)_/.test(o.name)));
   assert.ok(!objects.some(o=>o.name.startsWith('Building_')&&materials[o.material].name==='Oxide painted entrance'));
 }
 // An ordinary block of the same size keeps its modelled entrance.
 assert.equal(make({building:'apartments','building:levels':'6'}).metadata.entranceLayouts.length,1);
});
