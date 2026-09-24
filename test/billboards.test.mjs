import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {insidePolygon} from '../src/spatial.mjs';
import {png} from '../src/png.mjs';
import {decodePNG} from '../src/texture-overrides.mjs';
import {rooftopBillboard,billboardCells,placeholderBillboards,BILLBOARD_LAYOUT} from '../src/billboards.mjs';
import {ps2Colour,crop2to1,buildBillboardTexture} from '../tools/billboard-textures.mjs';

test('billboard face is 2:1, faces the street and reads left to right',()=>{
 for(const n of [[0,1],[0,-1]]){
  const board=rooftopBillboard({a:[0,0],u:[1,0],n,center:5,width:8,roof:15,uv:billboardCells[0]}),f=board.face;
  const ys=f.positions.filter((_,i)=>i%3===1),xs=f.positions.filter((_,i)=>i%3===0);
  assert.ok(Math.abs((Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys))-2)<1e-9);
  assert.ok(Math.min(...ys)>15);assert.equal(f.normals[2],n[1]);
  const samples=Array.from({length:6},(_,i)=>({right:f.positions[i*3]*n[1],u:f.texcoords[i*2]})).sort((a,b)=>a.right-b.right);
  assert.ok(samples.at(-1).u>samples[0].u,'artwork is not mirrored');
 }
 const {width,height}=placeholderBillboards();assert.deepEqual([width,height],[BILLBOARD_LAYOUT.size,BILLBOARD_LAYOUT.size]);assert.equal(placeholderBillboards().filter,'linear');
});

test('billboards stand on the roof, replace rooftop letters and respect the slot count',()=>{
 // Search deterministic ids for a tall block that gets a billboard.
 const block=id=>({type:'FeatureCollection',selectionBounds:[-.0002,-.0002,.0005,.0004],features:[
  {id,properties:{building:'retail','building:levels':'6'},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.00018],[0,.00018],[0,0]]]}},
  {id:'way/900',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,-.00008],[.0005,-.00008]]}}]});
 let found;
 for(let i=1;i<200&&!found;i++){const base=generate(block(`way/${i}`)),scene=concreteCity(base,{billboardSlots:3});if(scene.metadata.billboards.length)found={base,scene};}
 assert.ok(found,'some block carries a billboard');
 const {base,scene}=found,ring=base.objects.find(o=>o.extras?.footprint).extras.footprint,[board]=scene.metadata.billboards;
 assert.ok(board.footprint.every(p=>insidePolygon(p,ring)));
 assert.ok(board.slot<3,'only slots with distinct artwork are used');
 assert.equal(scene.metadata.rooftopSigns.length,0,'no rooftop letters on the same roof');
 assert.ok(scene.objects.some(o=>o.name.endsWith('_Billboard')&&scene.materials[o.material].name==='Billboards'));
});

test('PS2 treatment reduces to a small palette and the builder fills every slot',async()=>{
 const rgba=new Uint8Array(8*4*4).map((_,i)=>i%4===3?255:(i*37)%256),out=ps2Colour(rgba,8,{colors:4});
 const colours=new Set();for(let i=0;i<out.length;i+=4)colours.add(out.slice(i,i+3).join());assert.ok(colours.size<=4,'at most the requested palette size');
 assert.deepEqual(crop2to1({width:300,height:100}),{x0:50,x1:250,y0:0,y1:100});
 const dir=await mkdtemp(join(tmpdir(),'mapcast-bb-'));
 try{
  const img=c=>{const d=new Uint8Array(64*32*4);for(let i=0;i<64*32;i++)d.set([...c,255],i*4);return png(64,32,d);};
  await writeFile(join(dir,'a.png'),img([200,0,0]));await writeFile(join(dir,'b.png'),img([0,0,200]));
  const result=await buildBillboardTexture(dir,dir);
  assert.equal(result.unique,2);assert.deepEqual(JSON.parse(await readFile(join(dir,'Billboards_512.json'),'utf8')).unique,2);
  const atlas=decodePNG(await readFile(result.file)),px=(x,y)=>Array.from(atlas.rgba.slice((y*512+x)*4,(y*512+x)*4+3));
  assert.ok(px(128,64)[0]>170&&px(384,64)[2]>170,'slots 0 and 1 hold the two images');
  assert.ok(px(128,192)[0]>170,'slot 2 repeats the first image');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('GLB samplers keep pixel art crisp in Unreal and billboards soft',async()=>{
 const {encodeGLB}=await import('../src/glb.mjs');
 const tex=(name,filter)=>({name,png:png(2,2,new Uint8Array(16)),...(filter?{filter}:{})});
 const glb=encodeGLB([],[],{},[tex('Crisp'),tex('Soft','linear')]),doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
 const sampler=name=>doc.samplers[doc.textures[doc.images.findIndex(i=>i.name===name)].sampler];
 assert.equal(sampler('Crisp').minFilter,9728,'plain NEAREST so Unreal imports TF_Nearest');
 assert.equal(sampler('Soft').minFilter,9987);
});

test('placeholder ads fill all eight slots with different, repeatable artwork',async()=>{
 const {slotRect}=await import('../src/billboards.mjs');
 const a=placeholderBillboards(),b=placeholderBillboards();
 assert.deepEqual(a.rgba,b.rgba,'deterministic');
 const slots=Array.from({length:8},(_,i)=>{const r=slotRect(i),rows=[];for(let y=0;y<r.h;y+=8)rows.push(Buffer.from(a.rgba.subarray(((r.y+y)*512+r.x)*4,((r.y+y)*512+r.x+r.w)*4)).toString('base64'));return rows.join();});
 assert.equal(new Set(slots).size,8);
 for(let i=0;i<8;i++){const r=slotRect(i),colours=new Set();for(let y=0;y<r.h;y+=4)for(let x=0;x<r.w;x+=4){const k=((r.y+y)*512+r.x+x)*4;colours.add(a.rgba.slice(k,k+3).join());}assert.ok(colours.size>=4,`slot ${i} has real artwork`);}
});
