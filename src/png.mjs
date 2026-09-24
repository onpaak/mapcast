import {deflateSync} from 'node:zlib';
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const t=Buffer.from(type),payload=Buffer.concat([t,data]);let crc=0xffffffff;for(const b of payload)crc=table[(crc^b)&255]^(crc>>>8);const h=Buffer.alloc(4),c=Buffer.alloc(4);h.writeUInt32BE(data.length);c.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([h,payload,c]);}
export function png(width,height,rgba){
  if(rgba.length!==width*height*4)throw new Error('Invalid PNG dimensions');
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(rgba.subarray(y*width*4,(y+1)*width*4)).copy(rows,y*(width*4+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
