// Build the vending machine texture override from a front-view day image and a
// matching night image (same framing). The day image becomes the colour map; the
// parts that stay bright at night become the emissive map.
//   node tools/vending-texture.mjs overrides/source/a.png overrides/source/b.png [outDir]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {decodePNG} from '../src/texture-overrides.mjs';
import {png} from '../src/png.mjs';
import {VENDING_LAYOUT} from '../src/street-props.mjs';

const lum=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const at=(im,x,y)=>{const i=(y*im.width+x)*4;return [im.rgba[i],im.rgba[i+1],im.rgba[i+2]];};
const meanLum=im=>{let s=0;for(let i=0;i<im.rgba.length;i+=16)s+=lum(im.rgba[i],im.rgba[i+1],im.rgba[i+2]);return s/(im.rgba.length/16);};

// Machine body = rows/columns that are mostly unlike the background sampled at the
// corners; narrow rows such as the feet fall below the coverage threshold.
export function bodyBounds(im,{coverage=.6,distance=30}={}){
 const corners=[[2,2],[im.width-3,2],[2,im.height-3],[im.width-3,im.height-3]].map(([x,y])=>at(im,x,y));
 const bg=[0,1,2].map(k=>corners.reduce((s,c)=>s+c[k],0)/4);
 const body=(x,y)=>{const c=at(im,x,y);return Math.hypot(c[0]-bg[0],c[1]-bg[1],c[2]-bg[2])>distance;};
 const rows=[];for(let y=0;y<im.height;y++){let n=0;for(let x=0;x<im.width;x++)n+=body(x,y);rows.push(n/im.width);}
 const top=rows.findIndex(f=>f>coverage),bottom=rows.findLastIndex(f=>f>coverage);
 if(top<0)throw new Error('Could not find the machine body against the background');
 const cols=[];for(let x=0;x<im.width;x++){let n=0;for(let y=top;y<=bottom;y++)n+=body(x,y);cols.push(n/(bottom-top+1));}
 return {x0:cols.findIndex(f=>f>coverage),x1:cols.findLastIndex(f=>f>coverage)+1,y0:top,y1:bottom+1};
}

// Area-average a crop down to width×height; fn maps a source pixel to an RGB triple.
export function resample(width,height,crop,fn){
 const out=new Uint8Array(width*height*4),sx=(crop.x1-crop.x0)/width,sy=(crop.y1-crop.y0)/height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const xa=Math.floor(crop.x0+x*sx),xb=Math.max(xa+1,Math.floor(crop.x0+(x+1)*sx)),ya=Math.floor(crop.y0+y*sy),yb=Math.max(ya+1,Math.floor(crop.y0+(y+1)*sy));
  const sum=[0,0,0];let n=0;
  for(let v=ya;v<yb;v++)for(let u=xa;u<xb;u++){const c=fn(u,v);sum[0]+=c[0];sum[1]+=c[1];sum[2]+=c[2];n++;}
  out.set([...sum.map(s=>Math.round(s/n)),255],(y*width+x)*4);
 }
 return out;
}

// Lit where the night image keeps most of its daytime brightness and is itself bright.
export function glowMask(day,night,x,y){
 const d=lum(...at(day,x,y)),n=lum(...at(night,x,y)),ratio=n/Math.max(d,1);
 return Math.min(1,Math.max(0,(ratio-.62)/.23))*Math.min(1,Math.max(0,(n-60)/40));
}

export async function buildVendingTexture(fileA,fileB,outDir='overrides/textures'){
 const [a,b]=await Promise.all([fileA,fileB].map(async f=>decodePNG(await readFile(f))));
 if(a.width!==b.width||a.height!==b.height)throw new Error('Day and night images must have the same size and framing');
 // Whichever image is brighter overall is the daytime one.
 const [day,night,swapped]=meanLum(a)>=meanLum(b)?[a,b,false]:[b,a,true];
 const crop=bodyBounds(day),L=VENDING_LAYOUT,size=L.size;
 const color=new Uint8Array(size*size*4),glow=new Uint8Array(size*size*4);
 const blit=(target,cell,pixels)=>{for(let y=0;y<cell.h;y++)target.set(pixels.subarray(y*cell.w*4,(y+1)*cell.w*4),((cell.y+y)*size+cell.x)*4);};
 blit(color,L.front,resample(L.front.w,L.front.h,crop,(x,y)=>at(day,x,y)));
 blit(glow,L.front,resample(L.front.w,L.front.h,crop,(x,y)=>{const m=glowMask(day,night,x,y);return at(night,x,y).map(v=>v*m);}));
 // Sides and top reuse the body colour from the machine's left frame.
 const frame=resample(1,1,{x0:crop.x0+4,x1:crop.x0+Math.round((crop.x1-crop.x0)*.025),y0:crop.y0+Math.round((crop.y1-crop.y0)*.2),y1:crop.y0+Math.round((crop.y1-crop.y0)*.8)},(x,y)=>at(day,x,y));
 const fill=(cell,shade)=>{for(let y=0;y<cell.h;y++)for(let x=0;x<cell.w;x++){const n=((Math.imul(x+5,73856093)^Math.imul(y+13,19349663))>>>0)%7-3,edge=x<2||x>=cell.w-2?.8:1;color.set([0,1,2].map(k=>Math.max(0,Math.min(255,Math.round(frame[k]*shade*edge+n)))).concat(255),((cell.y+y)*size+cell.x+x)*4);}};
 fill(L.side,.92);fill(L.top,.8);
 for(let i=3;i<glow.length;i+=4)glow[i]=255;
 await mkdir(outDir,{recursive:true});
 const files={color:join(outDir,`${L.name}.png`),emissive:join(outDir,`${L.emissiveName}.png`)};
 await writeFile(files.color,png(size,size,color));await writeFile(files.emissive,png(size,size,glow));
 return {files,crop,swapped};
}

if(import.meta.url===`file:///${process.argv[1]?.replace(/\\/g,'/')}`||import.meta.url===`file://${process.argv[1]}`){
 const [a,b,out]=process.argv.slice(2);
 if(!a||!b){console.error('Usage: node tools/vending-texture.mjs day.png night.png [outDir]');process.exit(1);}
 const result=await buildVendingTexture(a,b,out);
 if(result.swapped)console.log('Note: the second image is the brighter one, so it was used as the daytime colour map.');
 console.log(`Machine body ${result.crop.x1-result.crop.x0}×${result.crop.y1-result.crop.y0} px → ${result.files.color}, ${result.files.emissive}`);
}
