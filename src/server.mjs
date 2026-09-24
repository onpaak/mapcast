import http from 'node:http';
import {readFile,readdir,stat,rm} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {validateBounds} from './osm.mjs';
import {project} from './geometry.mjs';
import {validateArea,areaBounds} from './area.mjs';

// Local web workbench: serves the page in web/, runs the CLI for a selected area and
// serves each result from output/<name>/. Listens on 127.0.0.1 only.
const root=fileURLToPath(new URL('../',import.meta.url)),outputDir=resolve(root,'output'),jobs=new Map();let running=false;
const KEEP_WEB_RESULTS=5;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.txt':'text/plain'};
const files=new Set(['city.glb','metadata.json','area.geojson','source-map.svg','source-index.json','preview-street.png','preview-overview.png','ATTRIBUTION.txt']);
const webFiles=['index.html','app.js','bounds.js','i18n.js','viewer.js','style.css','samples/day.jpg','samples/night.jpg'];
// three.js modules used by the 3D preview, served from node_modules.
const threeFiles=['build/three.module.js','build/three.core.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/controls/OrbitControls.js','examples/jsm/utils/BufferGeometryUtils.js'];

// A request selects either a box (bounds) or a convex four-point area (area: [[lon,lat], ...]).
export function validateRequest(input){
  const area=input.area!==undefined?validateArea(input.area):undefined;
  const bounds=area?areaBounds(area):validateBounds(input.bounds);
  const provider=input.provider??'map-api';if(!['map-api','overpass'].includes(provider))throw new Error('Unknown map data source');
  if(provider==='map-api'&&Math.hypot(...project(bounds[2],bounds[3],[bounds[0],bounds[1]]))>1000)throw new Error('Area too large: the OSM Map API allows a 1 km diagonal');
  for(const key of ['offline','lite'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new Error(`${key} must be a boolean`);
  return {bounds,area,provider,offline:input.offline===true,lite:input.lite===true};
}

function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function file(res,path){const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(data);}

// Finished results in output/, newest first.
async function results(){
  const names=await readdir(outputDir).catch(()=>[]),found=[];
  for(const name of names){
    if(!/^[\w-]+$/.test(name))continue;
    const index=await stat(resolve(outputDir,name,'source-index.json')).catch(()=>null);
    if(index)found.push({name,time:index.mtimeMs});
  }
  return found.sort((a,b)=>b.time-a.time);
}
// Place search through Nominatim (OSM's geocoder). Its usage policy asks for an identifying
// User-Agent, at most one request per second and no search-as-you-type; answers are cached.
const searches=new Map();let lastSearch=0;
async function search(query,language){
  const key=language+':'+query;
  if(!searches.has(key)){
    const wait=lastSearch+1100-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
    lastSearch=Date.now();
    const params=new URLSearchParams({q:query,format:'jsonv2',limit:'6','accept-language':language});
    const response=await fetch('https://nominatim.openstreetmap.org/search?'+params,{headers:{'User-Agent':'Mapcast/0.1',Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Search service HTTP '+response.status);
    searches.set(key,(await response.json()).map(p=>({name:p.display_name,lat:Number(p.lat),lon:Number(p.lon)})));
  }
  return searches.get(key);
}

// Web runs write to output/web-<id>; only the most recent few are kept.
async function pruneWebResults(){
  for(const {name} of (await results()).filter(r=>r.name.startsWith('web-')).slice(KEEP_WEB_RESULTS-1))
    await rm(resolve(outputDir,name),{recursive:true,force:true});
}

function startJob({bounds,area,provider,offline,lite}){
  const id=randomUUID(),name='web-'+id,job={id,state:'running',stage:'loading',bounds};jobs.set(id,job);running=true;
  const args=[resolve(root,'src/cli.mjs'),...(area?['--area',area.map(p=>p.join(',')).join(' ')]:['--bbox',bounds.join(',')]),'--provider',provider,'--out',resolve(outputDir,name),...(offline?['--offline']:[]),...(lite?['--detail','lite']:[])];
  const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let errors='';
  child.stdout.on('data',b=>{const text=b.toString();if(text.includes('Cache hit'))job.stage='cached';else if(text.includes('Downloaded'))job.stage='downloaded';});
  child.stderr.on('data',b=>{errors=(errors+b).slice(-4000);});
  const fail=message=>{running=false;Object.assign(job,{state:'error',message});};
  child.on('error',e=>fail(e.message));
  child.on('close',async code=>{
    if(code!==0){fail(errors.trim()||'Generator exited with an error');return;}
    try{job.report=JSON.parse(await readFile(resolve(outputDir,name,'source-index.json'),'utf8'));Object.assign(job,{base:`/result/${name}/`,name,state:'done',stage:'done'});}
    catch(e){fail(e.message);return;}
    running=false;
  });
  return id;
}

export function createServer(){return http.createServer(async(req,res)=>{
  try{
    // Only loopback names: a page on another domain cannot reach this server through DNS tricks.
    const host=req.headers.host;if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host??'')){json(res,403,{error:'Loopback host required'});return;}
    const url=new URL(req.url,'http://'+host),path=url.pathname;
    if(req.method==='POST'&&path==='/api/generate'){
      if(req.headers.origin&&req.headers.origin!=='http://'+host){json(res,403,{error:'Cross-origin request denied'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON required'});return;}
      if(running){json(res,409,{error:'A generation is already running'});return;}
      // Claim the slot before any await so two requests cannot both start a job.
      running=true;
      try{
        let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){running=false;json(res,413,{error:'Request too large'});return;}}
        const request=validateRequest(JSON.parse(body));
        await pruneWebResults();
        json(res,202,{id:startJob(request)});return;
      }catch(error){running=false;throw error;}
    }
    // Deleting a result removes its whole folder under output/.
    const removal=path.match(/^\/api\/results\/([\w-]+)$/);
    if(req.method==='DELETE'&&removal){
      if(req.headers.origin&&req.headers.origin!=='http://'+host){json(res,403,{error:'Cross-origin request denied'});return;}
      const folder=resolve(outputDir,removal[1]);
      await stat(resolve(folder,'source-index.json'));
      await rm(folder,{recursive:true,force:true});
      json(res,200,{deleted:removal[1]});return;
    }
    if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return;}
    if(path.startsWith('/api/jobs/')){const job=jobs.get(path.slice(10));json(res,job?200:404,job??{error:'Job not found'});return;}
    // Recent results, newest first, so the page can reopen and switch between them.
    if(path==='/api/results'){
      const list=[];
      for(const {name,time} of (await results()).slice(0,8)){
        try{const {summary}=JSON.parse(await readFile(resolve(outputDir,name,'source-index.json'),'utf8'));list.push({name,time,base:`/result/${name}/`,bounds:summary.bounds,area:summary.area,buildings:summary.buildings,model:summary.model});}
        catch{/* A half-written result is skipped. */}
      }
      json(res,200,list);return;
    }
    if(path==='/api/search'){
      const query=(url.searchParams.get('q')??'').trim().slice(0,200),language=url.searchParams.get('lang')==='zh'?'zh':'en';
      if(!query){json(res,400,{error:'Empty search'});return;}
      json(res,200,await search(query,language));return;
    }
    const result=path.match(/^\/result\/([\w-]+)\/([^/]+)$/);
    if(result&&files.has(result[2])){await file(res,resolve(outputDir,result[1],result[2]));return;}
    const leaflet=path.match(/^\/vendor\/(leaflet\.js|leaflet\.css)$/);if(leaflet){await file(res,resolve(root,'node_modules/leaflet/dist',leaflet[1]));return;}
    const three=path.match(/^\/vendor\/three\/(.+)$/);if(three&&threeFiles.includes(three[1])){await file(res,resolve(root,'node_modules/three',three[1]));return;}
    const name=path==='/'?'index.html':path.slice(1);if(webFiles.includes(name)){await file(res,resolve(root,'web',name));return;}
    json(res,404,{error:'Not found'});
  }catch(e){json(res,e.code==='ENOENT'?404:400,{error:e.message});}
});}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.MAPCAST_PORT??process.env.PORT??4173);createServer().listen(port,'127.0.0.1',()=>console.log(`Mapcast: http://127.0.0.1:${port}`));
}
