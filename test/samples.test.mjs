import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Published images must not carry renderer comments or EXIF (local paths, user names, dates).
test('sample images carry no comment or EXIF segments',()=>{
  for(const name of ['web/samples/day','web/samples/night','docs/images/closeup','docs/images/city']){
    const b=readFileSync(new URL(`../${name}.jpg`,import.meta.url)),markers=[];let i=2;
    while(b[i]===0xFF&&b[i+1]!==0xDA){markers.push(b[i+1]);i+=2+b.readUInt16BE(i+2);}
    assert.ok(!markers.some(m=>m===0xFE||m>=0xE1&&m<=0xEF),`${name}.jpg has metadata segments`);
  }
});
