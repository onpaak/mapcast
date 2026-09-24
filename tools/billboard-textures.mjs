// Build the billboard atlas override (plus a .json sidecar) from your own 2:1 images, with a
// uniform PS2 treatment: area-averaged down to 256×128, then reduced to a 64-colour
// palette per image with 4×4 ordered dithering, like the 8-bit palette textures of the
// era. Fewer than eight images repeat to fill the slots.
//   node tools/billboard-textures.mjs [overrides/source/billboards] [overrides/textures] [--colors 64]
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {decodePNG} from '../src/texture-overrides.mjs';
import {resample} from './vending-texture.mjs';
import {png} from '../src/png.mjs';
import {BILLBOARD_LAYOUT,slotRect} from '../src/billboards.mjs';

const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

// Median cut: split the colour box with the widest channel range at its median until
// there are `colors` boxes; each box's mean becomes a palette entry.
export function medianCut(rgba,colors){
 const pixels=[];for(let i=0;i<rgba.length;i+=4)pixels.push([rgba[i],rgba[i+1],rgba[i+2]]);
 let boxes=[pixels];
 while(boxes.length<colors){
  let best=-1,channel=0,range=0;
  boxes.forEach((box,i)=>{if(box.length<2)return;for(let k=0;k<3;k++){let lo=255,hi=0;for(const p of box){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}if(hi-lo>range){range=hi-lo;best=i;channel=k;}}});
  if(best<0)break;
  const box=boxes[best].sort((a,b)=>a[channel]-b[channel]),half=box.length>>1;
  boxes.splice(best,1,box.slice(0,half),box.slice(half));
 }
 return boxes.map(box=>[0,1,2].map(k=>Math.round(box.reduce((s,p)=>s+p[k],0)/box.length)));
}

// Map each pixel to the nearest palette colour after an ordered-dither offset.
export function ps2Colour(rgba,width,{colors=64,spread=28}={}){
 const palette=medianCut(rgba,colors),out=new Uint8Array(rgba.length);
 for(let i=0;i<rgba.length;i+=4){
  const x=(i/4)%width,y=Math.floor(i/4/width),t=((BAYER[(y%4)*4+x%4]+.5)/16-.5)*spread;
  let best=palette[0],distance=Infinity;
  for(const c of palette){const d=(rgba[i]+t-c[0])**2+(rgba[i+1]+t-c[1])**2+(rgba[i+2]+t-c[2])**2;if(d<distance){distance=d;best=c;}}
  out.set([...best,255],i);
 }
 return out;
}

// Centre-crop to 2:1 so off-ratio images are not squashed.
export function crop2to1(im){
 const h=Math.min(im.height,Math.floor(im.width/2)),w=h*2;
 return {x0:Math.floor((im.width-w)/2),x1:Math.floor((im.width-w)/2)+w,y0:Math.floor((im.height-h)/2),y1:Math.floor((im.height-h)/2)+h};
}

export async function buildBillboardTexture(srcDir='overrides/source/billboards',outDir='overrides/textures',{colors=64}={}){
 const notes=[],files=(await readdir(srcDir)).filter(f=>f.toLowerCase().endsWith('.png')).sort();
 if(!files.length)throw new Error(`No PNG images in ${srcDir}`);
 if(files.length>BILLBOARD_LAYOUT.slots)notes.push(`only the first ${BILLBOARD_LAYOUT.slots} of ${files.length} images are used`);
 const L=BILLBOARD_LAYOUT,atlas=new Uint8Array(L.size*L.size*4);
 const images=await Promise.all(files.map(async f=>decodePNG(await readFile(join(srcDir,f)))));
 for(let slot=0;slot<L.slots;slot++){
  const im=images[slot%images.length],crop=crop2to1(im),r=slotRect(slot);
  if(slot<images.length&&Math.abs(im.width/im.height-2)>.02)notes.push(`${files[slot]} is ${im.width}×${im.height}; centre-cropped to 2:1`);
  const at=(x,y)=>{const i=(y*im.width+x)*4;return [im.rgba[i],im.rgba[i+1],im.rgba[i+2]];};
  const pixels=ps2Colour(resample(r.w,r.h,crop,at),r.w,{colors});
  for(let y=0;y<r.h;y++)atlas.set(pixels.subarray(y*r.w*4,(y+1)*r.w*4),((r.y+y)*L.size+r.x)*4);
 }
 await mkdir(outDir,{recursive:true});
 const file=join(outDir,`${L.name}.png`);
 await writeFile(file,png(L.size,L.size,atlas));
 // Sidecar: how many slots hold distinct artwork, so placement never treats a repeat as new.
 const unique=Math.min(files.length,L.slots);
 await writeFile(join(outDir,`${L.name}.json`),JSON.stringify({unique,images:files.slice(0,unique)},null,1));
 return {file,images:files,notes,unique};
}

if(import.meta.url===`file:///${process.argv[1]?.replace(/\\/g,'/')}`||import.meta.url===`file://${process.argv[1]}`){
 const args=process.argv.slice(2),flag=args.indexOf('--colors'),colors=flag>=0?Number(args.splice(flag,2)[1]):64;
 if(!(colors>=2&&colors<=256))throw new Error('--colors must be between 2 and 256');
 const [src,out]=args,result=await buildBillboardTexture(src,out,{colors});
 for(const note of result.notes)console.log('Note:',note);
 console.log(`${result.images.length} image(s) → ${result.file}${result.images.length<BILLBOARD_LAYOUT.slots?` (repeated to fill ${BILLBOARD_LAYOUT.slots} slots)`:''}`);
}
