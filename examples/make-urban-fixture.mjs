// Synthetic geometry test fixture, NOT a map of the real location.
import {writeFile} from 'node:fs/promises';
const origin=[13.4,52.52],r=Math.PI/180,R=6371008.8;
const geo=([x,z])=>[origin[0]+x/(R*r*Math.cos(origin[1]*r)),origin[1]-z/(R*r)];
const features=[];
function road(id,a,b,type){features.push({type:'Feature',id,properties:{highway:type},geometry:{type:'LineString',coordinates:[geo(a),geo(b)]}});}
road('avenue',[0,145],[0,-145],'secondary');
for(const z of [-90,0,90])road(`cross-${z}`,[-95,z],[95,z],'residential');
let count=0;
for(const side of [-1,1])for(const [start,end] of [[-138,-97],[-82,-8],[8,82],[98,138]]){
  for(let z=start;z+12<end;){
    const length=Math.min(end-z,16+(count%3)*5),inner=8.4+(count%3)*.5,outer=inner+19+(count%4)*4;
    const ring=[[side*inner,z],[side*outer,z],[side*outer,z+length],[side*inner,z+length],[side*inner,z]].map(geo);
    features.push({type:'Feature',id:`synthetic-${count}`,properties:{building:'yes','building:levels':3+count%4},geometry:{type:'Polygon',coordinates:[ring]}});
    count++;z+=length+1.6;
  }
}
await writeFile(new URL('urban-block.json',import.meta.url),JSON.stringify({type:'FeatureCollection',source:'Synthetic dense street fixture; coordinates are an arbitrary origin, NOT real OSM data',features},null,2));
console.log(`Wrote ${count} synthetic buildings and 4 roads`);
