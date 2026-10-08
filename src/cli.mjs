import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generate} from './scene.mjs';
import {encodeGLB} from './glb.mjs';
import {concreteCity} from './concrete-city.mjs';
import {renderPreview} from './preview.mjs';
import {downloadMapArea} from './map-api.mjs';
import {sourceReport} from './source-report.mjs';
import {validateBounds,downloadArea,fromOverpass} from './osm.mjs';
import {downloadTerrain} from './terrain.mjs';
import {applyTextureOverrides} from './texture-overrides.mjs';
import {BILLBOARD_LAYOUT} from './billboards.mjs';
import {validateArea,areaBounds} from './area.mjs';
const usage='Usage: node src/cli.mjs [--input area.geojson|osm.json] [--bbox west,south,east,north | --area "lon,lat lon,lat lon,lat lon,lat"] --out output/area [--provider map-api|overpass] [--cache cache] [--refresh] [--offline] [--terrain] [--textures overrides/textures] [--detail full|lite]';
try {
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(key==='--help'){console.log(usage);process.exit(0);}
    if(key==='--offline'){options.offline=true;continue;}
    if(key==='--refresh'){options.refresh=true;continue;}
    if(key==='--terrain'){options.terrain=true;continue;}
    if(!['--input','--out','--bbox','--area','--cache','--endpoint','--provider','--textures','--detail'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Invalid argument: ${key}\n${usage}`);
    options[key.slice(2)]=args[++i];
  }
  if(!options.out||(!options.input&&!options.bbox&&!options.area))throw new Error(usage);
  if(options.bbox&&options.area)throw new Error('Use either --bbox or --area, not both');
  if(options.offline&&(options.refresh||options.terrain))throw new Error('--offline cannot be combined with --refresh or --terrain');
  if(options.refresh&&options.input)throw new Error('--refresh is only for downloads');
  if(options.provider&&!['map-api','overpass'].includes(options.provider))throw new Error('Provider must be map-api or overpass');
  if(options.provider!=='overpass'&&options.endpoint)throw new Error('--endpoint applies only to Overpass');
  // --area is a convex polygon; downloads use its bounding box and the polygon clips the result.
  const area=options.area?validateArea(options.area):undefined;
  const bounds=options.bbox?validateBounds(options.bbox):area?areaBounds(area):undefined;
  let data;
  if(options.input) {
    const raw=JSON.parse(await readFile(options.input,'utf8'));
    if(raw.raw?.elements)data=fromOverpass(raw.raw,{bounds:bounds??raw.bounds,area,provenance:raw.provenance});
    else if(raw.elements)data=fromOverpass(raw,{bounds,area});
    else {if(bounds)throw new Error('--bbox and --area clipping apply only to Overpass input');data=raw;}
  }else {
    console.log('Loading OSM area...');
    const downloader=options.provider==='overpass'?downloadArea:downloadMapArea;
    const result=await downloader(bounds,{cacheDir:options.cache??'cache',refresh:options.refresh,offline:options.offline,endpoint:options.endpoint});
    console.log(`${result.cacheHit?'Cache hit':'Downloaded'}: ${result.cacheFile}`);
    data=fromOverpass(result.raw,{bounds,area,provenance:result.provenance});
  }
  if(!options.terrain){delete data.terrain;delete data.terrainError;}
  else if(bounds&&!data.terrain)try{const terrain=await downloadTerrain(bounds,{cacheDir:options.cache??'cache'});data.terrain=terrain;console.log(`${terrain.cacheHit?'Elevation cache hit':'Downloaded elevation'}: ${terrain.cacheFile}`);}catch(error){data.terrainError=error.message;data.warnings=[...(data.warnings??[]),{id:'terrain',reason:`Elevation unavailable, using flat ground: ${error.message}`}];}
  if(options.detail&&!['full','lite'].includes(options.detail))throw new Error('Detail must be full or lite');
  // A billboard override records how many of its slots hold distinct artwork.
  const texturesDir=resolve(options.textures??'overrides/textures'),billboardSlots=await readFile(resolve(texturesDir,`${BILLBOARD_LAYOUT.name}.json`),'utf8').then(t=>JSON.parse(t).unique,()=>undefined);
  const baseScene=generate(data),scene=concreteCity(baseScene,{billboardSlots,detail:options.detail}),report=sourceReport(data,baseScene),out=resolve(options.out);
  report.index.summary.architectureTypes=scene.metadata.architectureTypes;
  // Street furniture is placed by the concrete preset, after the base scene the report reads.
  if(scene.metadata.streetFurniture){
    report.index.summary.streetFurniture=scene.metadata.streetFurnitureSummary;
    for(const r of scene.metadata.streetFurniture){const entry=report.index.features.find(f=>f.featureId===String(r.sourceId));if(entry){entry.streetFurniture=r;entry.generated=r.status==='generated';entry.skipReasons=r.reason?[r.reason]:[];}}
  }
  report.index.summary.roads=report.index.features.filter(f=>f.kind==='road'&&f.generated).length;
  report.index.summary.roadNetwork=scene.metadata.roadNetwork;
  report.index.summary.environment=scene.metadata.environmentTypes;
  report.index.summary.terrain=scene.metadata.terrain?{available:true,source:scene.metadata.terrain.source.name,model:scene.metadata.terrain.source.model,cols:scene.metadata.terrain.cols,rows:scene.metadata.terrain.rows,datum:scene.metadata.terrain.datum,minElevation:scene.metadata.terrain.minElevation,maxElevation:scene.metadata.terrain.maxElevation,...scene.metadata.terrain.terrainPreset}:{available:false,error:scene.metadata.terrainError};
  report.index.summary.sceneModules=scene.metadata.sceneModules;report.index.summary.assetInstances=scene.metadata.assetInstances;report.index.summary.generationPreset=scene.metadata.generationPreset;
  // Same-named PNGs in the overrides folder replace generated textures on every run.
  const overrides=await applyTextureOverrides(scene.textures,texturesDir);
  if(overrides.length){scene.metadata.textureOverrides=overrides;for(const o of overrides)console.log(`Texture override: ${o.name} (${o.width}×${o.height})${o.warning?' — '+o.warning:''}`);}
  await mkdir(out,{recursive:true});
  const glb=encodeGLB(scene.objects,scene.materials,scene.metadata,scene.textures);
  await writeFile(resolve(out,'city.glb'),glb);
  const triangles=scene.objects.reduce((sum,o)=>sum+o.positions.length/9,0);
  report.index.summary.model={triangles:Math.round(triangles),bytes:glb.length,detail:scene.metadata.detail??'full'};
  console.log(`Model: ${Math.round(triangles).toLocaleString('en')} triangles, ${(glb.length/1e6).toFixed(1)} MB${scene.metadata.detail==='lite'?' (lite detail)':''}`);
  await rm(resolve(out,'textures'),{recursive:true,force:true});
  await mkdir(resolve(out,'textures'),{recursive:true});
  for(const t of scene.textures)await writeFile(resolve(out,'textures',t.name+'.png'),t.png);
  const previewLight={ambient:.78,direct:.4,sunDirection:[-.5,.9,-.7],skyTop:[85,98,112],skyBottom:[163,169,173],fogDistance:800};
  await writeFile(resolve(out,'preview-street.png'),renderPreview(scene,previewLight));
  const ground=scene.objects.find(o=>o.extras?.terrainGround)||scene.objects.find(o=>o.name==='Ground'),gp=ground?.positions??[],xs=gp.filter((_,i)=>i%3===0),ys=gp.filter((_,i)=>i%3===1),zs=gp.filter((_,i)=>i%3===2),span=Math.max(100,Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs)),center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...zs)+Math.max(...zs))/2],top=Math.max(...ys);
  const overview={eye:[center[0]+span*.72,top+span*.58,center[2]+span*.82],target:center,fogDistance:span*3};
  await writeFile(resolve(out,'preview-overview.png'),renderPreview(scene,{...previewLight,...overview}));
  await writeFile(resolve(out,'metadata.json'),JSON.stringify(scene.metadata,null,2));
  await writeFile(resolve(out,'source-index.json'),JSON.stringify(report.index,null,2));
  await writeFile(resolve(out,'source-map.svg'),report.svg);
  await writeFile(resolve(out,'area.geojson'),JSON.stringify(data,null,2));
  const source=scene.metadata.source;
  const terrainAttribution=scene.metadata.terrain?`\n${scene.metadata.terrain.source.attribution}\n${scene.metadata.terrain.source.url}\nElevation license: ${scene.metadata.terrain.source.license}\n`:'';
  await writeFile(resolve(out,'ATTRIBUTION.txt'),(typeof source==='string'?source+'\n':`${source.attribution}\n${source.copyrightUrl}\nData license: ${source.license}\n${source.licenseUrl}\n`)+terrainAttribution);
  console.log(`Exported ${scene.objects.length} objects to ${out}; ${scene.metadata.warnings.length} warnings`);
}catch(e){console.error(e.message,e.cause?.message??'');process.exitCode=1;}
