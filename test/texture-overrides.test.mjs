import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {png} from '../src/png.mjs';
import {decodePNG,applyTextureOverrides} from '../src/texture-overrides.mjs';

const image=(w,h)=>{const rgba=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++)rgba.set([i*7%256,i*13%256,i*29%256,i%3?255:128],i*4);return rgba;};

test('PNG decoder round-trips the project encoder and reads RGB files with filters',()=>{
 const rgba=image(9,5),decoded=decodePNG(png(9,5,rgba));
 assert.deepEqual([decoded.width,decoded.height],[9,5]);assert.deepEqual(Array.from(decoded.rgba),Array.from(rgba));
 // Hand-built 2×2 RGB PNG using Sub and Up filters, as image editors write.
 const chunk=(type,data)=>{const b=Buffer.alloc(8+data.length+4);b.writeUInt32BE(data.length);b.write(type,4,'ascii');data.copy(b,8);return b;};
 const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=2;
 const rows=Buffer.from([1,10,20,30,5,5,5, 2,1,1,1,2,2,2]);
 const file=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
 assert.deepEqual(Array.from(decodePNG(file).rgba),[10,20,30,255,15,25,35,255,11,21,31,255,17,27,37,255]);
});

test('same-named PNGs replace generated textures and report aspect mismatches',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mapcast-tex-'));
 try{
  await writeFile(join(dir,'Vending_machines_512.png'),png(256,256,image(256,256)));
  await writeFile(join(dir,'Other.png'),png(10,10,image(10,10)));
  const textures=[{name:'Vending_machines_512',width:512,height:512},{name:'Other',width:20,height:10},{name:'Untouched',width:4,height:4,png:Buffer.from('x')}];
  const applied=await applyTextureOverrides(textures,dir);
  assert.deepEqual(applied.map(a=>a.name),['Vending_machines_512','Other']);
  assert.deepEqual(applied.map(a=>a.file),['Vending_machines_512.png','Other.png'],'records name only, no local path');
  assert.equal(textures[0].width,256);assert.ok(!applied[0].warning);
  assert.ok(applied[1].warning,'square image over a 2:1 texture is flagged');
  assert.equal(textures[2].png.toString(),'x');
  assert.deepEqual(await applyTextureOverrides(textures,join(dir,'missing')),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('vending texture builder crops the body, maps day colour and night glow',async()=>{
 const {bodyBounds,glowMask,buildVendingTexture}=await import('../tools/vending-texture.mjs');
 // 40×60 grey background with a 30×48 machine; rows 54–57 are narrow "feet".
 const make=(body,window,bg)=>{const rgba=new Uint8Array(40*60*4);for(let y=0;y<60;y++)for(let x=0;x<40;x++){const inBody=x>=5&&x<35&&y>=4&&y<52,foot=y>=52&&y<56&&(x<9||x>=31),win=x>=10&&x<30&&y>=10&&y<30;rgba.set([...(win?window:inBody||foot?body:bg),255],(y*40+x)*4);}return {width:40,height:60,rgba};};
 const day=make([220,215,205],[120,160,210],[100,100,96]),night=make([70,80,100],[150,190,240],[10,20,45]);
 assert.deepEqual(bodyBounds(day),{x0:5,x1:35,y0:4,y1:52});
 assert.ok(glowMask(day,night,20,20)>.99,'display stays lit at night');assert.equal(glowMask(day,night,7,40),0,'body goes dark');
 const dir=await mkdtemp(join(tmpdir(),'mapcast-vend-'));
 try{
  await writeFile(join(dir,'n.png'),png(40,60,night.rgba));await writeFile(join(dir,'d.png'),png(40,60,day.rgba));
  const result=await buildVendingTexture(join(dir,'n.png'),join(dir,'d.png'),dir);
  assert.equal(result.swapped,true);
  const color=decodePNG(await readFile(result.files.color)),glow=decodePNG(await readFile(result.files.emissive));
  const px=(im,x,y)=>Array.from(im.rgba.slice((y*im.width+x)*4,(y*im.width+x)*4+3));
  assert.deepEqual(px(color,128,192),[120,160,210]);assert.deepEqual(px(color,4,300),[220,215,205]);
  assert.ok(px(glow,128,192)[2]>200);assert.deepEqual(px(glow,4,300),[0,0,0]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
