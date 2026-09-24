import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {downloadMapArea} from '../src/map-api.mjs';
import {fromOverpass} from '../src/osm.mjs';
import {generate} from '../src/scene.mjs';
import {sourceReport} from '../src/source-report.mjs';

// Re-import raw caches: auditing old GeoJSON cannot reveal importer omissions.
const results=[];
for(const folder of process.argv.slice(2)){
  const previous=JSON.parse(await readFile(`${folder}/area.geojson`,'utf8'));
  if(!previous.selectionBounds)throw new Error(`Missing selectionBounds: ${folder}`);
  const cached=await downloadMapArea(previous.selectionBounds,{offline:true});
  const data=fromOverpass(cached.raw,{bounds:previous.selectionBounds,provenance:cached.provenance});
  const report=sourceReport(data,generate(data)).index;
  const before=new Set(previous.features.map(f=>String(f.id))),after=new Set(data.features.map(f=>String(f.id)));
  const result={folder,cacheFile:cached.cacheFile,bounds:previous.selectionBounds,
    scope:'Checks received OSM data only; cannot measure objects absent from the source response.',
    buildings:report.summary.buildingDiagnostics,
    addedFeatures:[...after].filter(id=>!before.has(id)),removedFeatures:[...before].filter(id=>!after.has(id)),
    importIssues:report.importIssues,
    skippedFeatures:report.features.filter(f=>!f.generated&&f.kind!=='excluded').map(f=>({id:f.featureId,kind:f.kind,reasons:f.skipReasons})),
    incompleteRelations:cached.provenance.relationCompletionFailures??[]};
  results.push(result);
  console.log(JSON.stringify({folder,buildings:report.summary.buildings,added:result.addedFeatures.length,removed:result.removedFeatures.length,importIssues:result.importIssues.length,skipped:result.skippedFeatures.length}));
}
if(!results.length)throw new Error('Provide generated output folders to audit');
await mkdir('output/validation',{recursive:true});
await writeFile('output/validation/completeness.json',JSON.stringify(results,null,2));
