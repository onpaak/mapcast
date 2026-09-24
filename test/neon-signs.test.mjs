import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {encodeGLB} from '../src/glb.mjs';
import {insidePolygon} from '../src/spatial.mjs';
import {signAtlas,signCatalog,validateCatalog} from '../src/neon-signs.mjs';

const street={id:'way/900',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,-.00008],[.0005,-.00008]]}};
const block=(id,building,levels)=>({type:'FeatureCollection',selectionBounds:[-.0002,-.0002,.0005,.0003],features:[
 {id,properties:{building,'building:levels':levels},geometry:{type:'Polygon',coordinates:[[[0,0],[.0003,0],[.0003,.00012],[0,.00012],[0,0]]]}},street]});

test('sign atlas packs every catalog entry without overlap and is deterministic',()=>{
 const atlas=signAtlas(),rects=Object.values(atlas.entries);
 assert.equal(rects.length,signCatalog.length);
 assert.deepEqual(atlas.color.png,signAtlas().color.png);
 for(const t of [atlas.color,atlas.emissive])assert.ok(t.width===512&&[512,1024,2048].includes(t.height));
 for(const [i,a] of rects.entries()){
  assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=512&&a.y+a.h<=atlas.color.height,a.id);
  for(const b of rects.slice(i+1))assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${a.id} overlaps ${b.id}`);
 }
 const alpha=e=>{const v=[];for(let y=e.y;y<e.y+e.h;y++)for(let x=e.x;x<e.x+e.w;x++)v.push(atlas.color.rgba[(y*512+x)*4+3]);return v;};
 const glow=e=>{let s=0;for(let y=e.y;y<e.y+e.h;y++)for(let x=e.x;x<e.x+e.w;x++)s+=atlas.emissive.rgba[(y*512+x)*4];return s;};
 for(const e of rects){
  assert.ok(glow(e)>0,`${e.id} emits light`);
  if(e.style==='cutout'){const a=alpha(e);assert.ok(a.includes(0)&&a.includes(255),`${e.id} is cut out around letters`);}
  else assert.ok(alpha(e).every(v=>v===255),`${e.id} is opaque`);
 }
});

test('vertical signs hang above the ground floor on the street front and read from both sides',()=>{
 const base=generate(block('way/31','retail','6')),scene=concreteCity(base),source=base.objects.find(o=>o.extras?.footprint);
 const h=source.extras.height,fh=h/6;
 assert.ok(scene.metadata.streetSigns.length>0);
 for(const s of scene.metadata.streetSigns){assert.ok(s.bottom>=fh&&s.top<=h,`sign spans ${s.bottom}–${s.top}`);assert.ok(signCatalog.some(e=>e.id===s.signId&&['vertical','square','tower'].includes(e.kind)));}
 for(const o of scene.objects.filter(o=>/_(StreetSign|TowerSign)_/.test(o.name))){
  for(const start of [0,6]){
   const nx=o.normals[start*3],nz=o.normals[start*3+2];
   const samples=Array.from({length:6},(_,i)=>({right:o.positions[(start+i)*3]*nz-o.positions[(start+i)*3+2]*nx,u:o.texcoords[(start+i)*2]})).sort((a,b)=>a.right-b.right);
   assert.ok(samples.at(-1).u>samples[0].u,'text is not mirrored');
  }
 }
});

test('rooftop letters stand on the roof, cut out with alpha, and export emissive strength',()=>{
 let found;
 for(let i=1;i<40&&!found;i++){const base=generate(block(`way/${i}`,'retail','5')),scene=concreteCity(base);if(scene.metadata.rooftopSigns.length)found={base,scene};}
 assert.ok(found,'some retail block carries a rooftop sign');
 const {base,scene}=found,source=base.objects.find(o=>o.extras?.footprint),ring=source.extras.footprint,sign=scene.metadata.rooftopSigns[0];
 assert.ok(sign.bottom>source.extras.height);
 assert.ok(sign.footprint.every(p=>insidePolygon(p,ring)),'frame stays on the roof');
 const face=scene.objects.find(o=>o.name.endsWith('_RooftopSign')),material=scene.materials[face.material];
 assert.equal(material.alphaMode,'MASK');
 const glb=encodeGLB(scene.objects,scene.materials,scene.metadata,scene.textures),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
 assert.ok(json.extensionsUsed.includes('KHR_materials_emissive_strength'));
 assert.ok(json.materials.filter(m=>m.name.startsWith('Neon sign')).every(m=>m.extensions.KHR_materials_emissive_strength.emissiveStrength>1));
});

test('shop fronts carry one tall tower sign at an end joint spanning more than a storey',()=>{
 const base=generate(block('way/31','retail','6')),scene=concreteCity(base),h=base.objects.find(o=>o.extras?.footprint).extras.height,fh=h/6;
 const towers=scene.metadata.streetSigns.filter(s=>s.kind==='tower');
 assert.equal(towers.length,1);
 const [t]=towers,others=scene.metadata.streetSigns.filter(s=>s!==t&&s.edge===t.edge);
 assert.ok(t.top-t.bottom>fh,'tower spans more than one storey');assert.ok(t.top<=h-.3+1e-9);
 assert.ok(!others.some(s=>s.joint===t.joint),'no second sign on the tower joint');
 const face=scene.objects.find(o=>o.name.includes('_TowerSign_')),xs=face.positions.filter((_,i)=>i%3===0),zs=face.positions.filter((_,i)=>i%3===2);
 assert.ok(Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))>=.95,'tower face is at least 0.95 m wide');
});

test('the whole catalog renders and a broken catalog fails clearly',()=>{
 assert.equal(Object.keys(signAtlas().entries).length,signCatalog.length);
 assert.throws(()=>validateCatalog(signCatalog.filter(e=>e.kind!=='tower')),/missing tower/);
 assert.throws(()=>signAtlas([...signCatalog,{id:'x',kind:'front',text:'€',style:'lightbox',scheme:'red'}]),/Sign x: No pixel glyph/);
});

test('icons are centred and paired hanzi share a height',async()=>{
 const {iconGlyphs,kanaGlyphs}=await import('../src/pixel-glyphs.mjs');
 for(const [name,rows] of Object.entries(iconGlyphs)){
  const top=rows.findIndex(r=>/[#+]/.test(r)),bottom=15-rows.findLastIndex(r=>/[#+]/.test(r));
  assert.ok(Math.abs(top-bottom)<=1,`${name} icon is vertically centred`);
 }
 const span=ch=>{const rows=kanaGlyphs[ch];return [rows.findIndex(r=>r.includes('#')),rows.findLastIndex(r=>r.includes('#'))];};
 assert.deepEqual(span('电'),span('玩'));
});

