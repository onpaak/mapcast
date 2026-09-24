import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,createServer} from '../src/server.mjs';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
test('web request rejects oversized selections and unknown data sources',()=>{
  assert.throws(()=>validateRequest({bounds:[13.4,52.52,13.42,52.53]}),/1 km/);
  assert.throws(()=>validateRequest({bounds:[13.401,52.527,13.407,52.531],provider:'shell'}),/data source/);
});
test('local server rejects cross-origin generation and private file reads',async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try{const denied=await fetch(base+'/api/generate',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
    const privateFile=await fetch(base+'/package.json');assert.equal(privateFile.status,404);
    assert.equal((await fetch(base+'/vendor/three/build/three.module.js')).status,200);
    assert.ok(Array.isArray(await (await fetch(base+'/api/results')).json()));
    assert.equal((await fetch(base+'/api/search?q=')).status,400);
    // Deleting: only result folders, never from another origin.
    const folder=join(fileURLToPath(new URL('../output/',import.meta.url)),'test-delete-me');
    await mkdir(folder,{recursive:true});await writeFile(join(folder,'source-index.json'),'{}');
    assert.equal((await fetch(base+'/api/results/test-delete-me',{method:'DELETE',headers:{Origin:'https://example.com'}})).status,403);
    assert.equal((await fetch(base+'/api/results/test-delete-me',{method:'DELETE'})).status,200);
    await assert.rejects(stat(folder));
    assert.equal((await fetch(base+'/api/results/test-delete-me',{method:'DELETE'})).status,404);
    assert.equal((await fetch(base+'/api/results/..',{method:'DELETE'})).status,405);
    assert.equal((await fetch(base+'/vendor/three/package.json')).status,404);
    assert.equal((await fetch(base+'/result/..%2Fpackage.json/city.glb')).status,404);
    const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/Mapcast/);
  }finally{await new Promise(r=>server.close(r));}
});

test('lite detail and area request options are validated',()=>{
 assert.equal(validateRequest({bounds:[13.401,52.527,13.407,52.531]}).lite,false);
 assert.equal(validateRequest({bounds:[13.401,52.527,13.407,52.531],lite:true}).lite,true);
 assert.throws(()=>validateRequest({bounds:[13.401,52.527,13.407,52.531],lite:'yes'}),/boolean/);
 const area=validateRequest({area:[[13.404,52.527],[13.407,52.529],[13.404,52.531],[13.401,52.529]]});
 assert.deepEqual(area.bounds,[13.401,52.527,13.407,52.531]);assert.equal(area.area.length,4);
 assert.throws(()=>validateRequest({area:[[13.40,52.52],[13.43,52.52],[13.43,52.53],[13.40,52.53]]}),/1 km/);
 assert.throws(()=>validateRequest({area:[[13.404,52.527],[13.404,52.531],[13.407,52.529],[13.401,52.529]]}),/convex/);
});
