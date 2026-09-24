import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {png} from './png.mjs';

// Minimal PNG reader for 8-bit, non-interlaced images (grey, RGB, palette, with or
// without alpha), which covers what image editors save by default. Returns RGBA.
export function decodePNG(buffer){
 if(buffer.readUInt32BE(0)!==0x89504e47)throw new Error('Not a PNG file');
 let offset=8,width,height,depth,type,interlace,palette,alphaTable;const data=[];
 while(offset<buffer.length){
  const length=buffer.readUInt32BE(offset),kind=buffer.toString('ascii',offset+4,offset+8),body=buffer.subarray(offset+8,offset+8+length);offset+=12+length;
  if(kind==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);depth=body[8];type=body[9];interlace=body[12];}
  else if(kind==='PLTE')palette=body;
  else if(kind==='tRNS')alphaTable=body;
  else if(kind==='IDAT')data.push(body);
  else if(kind==='IEND')break;
 }
 const channels={0:1,2:3,3:1,4:2,6:4}[type];
 if(depth!==8||!channels||interlace)throw new Error('Save the PNG as 8-bit per channel and non-interlaced');
 const raw=inflateSync(Buffer.concat(data)),stride=width*channels,pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)],row=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),out=pixels.subarray(y*stride,(y+1)*stride),prev=y?pixels.subarray((y-1)*stride,y*stride):null;
  for(let x=0;x<stride;x++){
   const a=x>=channels?out[x-channels]:0,b=prev?prev[x]:0,c=prev&&x>=channels?prev[x-channels]:0;
   const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c),paeth=pa<=pb&&pa<=pc?a:pb<=pc?b:c;
   out[x]=(row[x]+[0,a,b,(a+b)>>1,paeth][filter])&255;
  }
 }
 const rgba=new Uint8Array(width*height*4);
 for(let i=0;i<width*height;i++){
  const s=pixels.subarray(i*channels,(i+1)*channels);
  const px=type===0?[s[0],s[0],s[0],255]:type===4?[s[0],s[0],s[0],s[1]]:type===2?[s[0],s[1],s[2],255]:type===6?[...s]:[palette[s[0]*3],palette[s[0]*3+1],palette[s[0]*3+2],alphaTable?.[s[0]]??255];
  rgba.set(px,i*4);
 }
 return {width,height,rgba};
}

// Replace generated textures with same-named PNGs from dir (e.g. Vending_machines_256x128.png).
// UVs are normalised, so a replacement may use any resolution with the same layout.
export async function applyTextureOverrides(textures,dir){
 let files;
 try{files=new Set(await readdir(dir));}catch{return [];}
 const applied=[];
 for(const texture of textures){
  const file=texture.name+'.png';
  if(!files.has(file))continue;
  const image=decodePNG(await readFile(join(dir,file)));
  const aspect=image.width/image.height,expected=texture.width/texture.height;
  // Image data only: the generated texture keeps its other settings, such as filter.
  Object.assign(texture,{...image,png:png(image.width,image.height,image.rgba)});
  applied.push({name:texture.name,file,width:image.width,height:image.height,...(Math.abs(aspect-expected)>.01?{warning:`aspect ${aspect.toFixed(2)} differs from generated ${expected.toFixed(2)}; atlas regions may not line up`}:{})});
 }
 return applied;
}
