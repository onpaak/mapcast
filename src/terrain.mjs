import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {project} from './geometry.mjs';

export const TERRAIN_SOURCE={name:'Open-Meteo Elevation API',model:'Copernicus DEM 2021 GLO-90',resolutionMeters:90,attribution:'Elevation: Copernicus DEM GLO-90 via Open-Meteo',url:'https://open-meteo.com/en/docs/elevation-api',license:'CC BY 4.0'};

export async function downloadTerrain(bounds,{cacheDir='cache',fetchImpl=fetch,endpoint='https://api.open-meteo.com/v1/elevation'}={}){
  const [west,south,east,north]=bounds,width=Math.abs(project(east,south,[west,south])[0]),depth=Math.abs(project(west,north,[west,south])[1]);
  const cols=Math.min(25,Math.max(3,Math.ceil(width/90)+1)),rows=Math.min(25,Math.max(3,Math.ceil(depth/90)+1));
  const key=createHash('sha256').update(`terrain-v1\n${endpoint}\n${bounds.join(',')}\n${cols}x${rows}`).digest('hex').slice(0,20),file=join(cacheDir,`terrain-${key}.json`);
  try{return {...JSON.parse(await readFile(file,'utf8')),cacheHit:true,cacheFile:file};}catch(error){if(error.code!=='ENOENT')throw error;}
  const coordinates=[];for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)coordinates.push([west+(east-west)*col/(cols-1),south+(north-south)*row/(rows-1)]);
  const elevations=[];
  for(let start=0;start<coordinates.length;start+=100){
    const batch=coordinates.slice(start,start+100),url=new URL(endpoint);url.searchParams.set('latitude',batch.map(p=>p[1].toFixed(7)).join(','));url.searchParams.set('longitude',batch.map(p=>p[0].toFixed(7)).join(','));
    let response;try{response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'Mapcast/0.1'},signal:AbortSignal.timeout(35000)});}catch(error){throw new Error(`Cannot reach the elevation service (${error.cause?.code??error.name??'network error'})`,{cause:error});}
    if(!response.ok)throw new Error(`Elevation service HTTP ${response.status}`);const body=await response.json();if(!Array.isArray(body.elevation)||body.elevation.length!==batch.length)throw new Error('高程服务返回的采样数量不正确');elevations.push(...body.elevation.map(Number));
  }
  if(elevations.some(value=>!Number.isFinite(value)))throw new Error('Elevation service returned invalid values');
  const datum=elevations[Math.floor(rows/2)*cols+Math.floor(cols/2)],terrain={bounds:[...bounds],cols,rows,elevations,datum,source:TERRAIN_SOURCE,downloadedAt:new Date().toISOString()};
  await mkdir(cacheDir,{recursive:true});await writeFile(file,JSON.stringify(terrain,null,2));return {...terrain,cacheHit:false,cacheFile:file};
}

export function prepareGameTerrain(input,{strength=.55,maxRelief=120,smoothPasses=2}={}){
  const raw=[...input.elevations],rawMin=Math.min(...raw),rawMax=Math.max(...raw),rawRelief=rawMax-rawMin,scale=rawRelief>0?Math.min(strength,maxRelief/rawRelief):1;let values=[...raw];
  const at=(array,col,row)=>array[Math.max(0,Math.min(input.rows-1,row))*input.cols+Math.max(0,Math.min(input.cols-1,col))];
  for(let pass=0;pass<smoothPasses;pass++)values=values.map((_,index)=>{const col=index%input.cols,row=Math.floor(index/input.cols);return (at(values,col,row)*4+at(values,col-1,row)+at(values,col+1,row)+at(values,col,row-1)+at(values,col,row+1))/8;});
  const gameElevations=values.map(value=>input.datum+(value-input.datum)*scale),gameMin=Math.min(...gameElevations),gameMax=Math.max(...gameElevations);
  return {...input,rawElevations:raw,gameElevations,elevations:gameElevations,terrainPreset:{name:'game-environment-v1',strength,maxRelief,smoothPasses,appliedScale:scale,rawMinElevation:rawMin,rawMaxElevation:rawMax,rawRelief,gameMinElevation:gameMin,gameMaxElevation:gameMax,gameRelief:gameMax-gameMin}};
}

export function terrainHeight(terrain,lon,lat){
  if(!terrain?.elevations?.length)return 0;const [w,s,e,n]=terrain.bounds,x=Math.max(0,Math.min(terrain.cols-1,(lon-w)/(e-w)*(terrain.cols-1))),y=Math.max(0,Math.min(terrain.rows-1,(lat-s)/(n-s)*(terrain.rows-1))),x0=Math.floor(x),x1=Math.min(terrain.cols-1,x0+1),y0=Math.floor(y),y1=Math.min(terrain.rows-1,y0+1),tx=x-x0,ty=y-y0,at=(col,row)=>terrain.elevations[row*terrain.cols+col]-terrain.datum;
  return (at(x0,y0)*(1-tx)+at(x1,y0)*tx)*(1-ty)+(at(x0,y1)*(1-tx)+at(x1,y1)*tx)*ty;
}

export function terrainHeightLocal(terrain,origin,x,z){
  const metersPerLat=6371008.8*Math.PI/180,lat=origin[1]-z/metersPerLat,lon=origin[0]+x/(metersPerLat*Math.cos(origin[1]*Math.PI/180));return terrainHeight(terrain,lon,lat);
}

function closest(point,segment){
  const dx=segment.b[0]-segment.a[0],dz=segment.b[1]-segment.a[1],length2=dx*dx+dz*dz,t=length2?Math.max(0,Math.min(1,((point[0]-segment.a[0])*dx+(point[1]-segment.a[1])*dz)/length2)):0;return {point:[segment.a[0]+dx*t,segment.a[1]+dz*t],distance:Math.hypot(point[0]-segment.a[0]-dx*t,point[1]-segment.a[1]-dz*t),dx,dz};
}

export function roadbedHeightLocal(terrain,origin,x,z,segments){
  let nearest;
  for(const segment of segments){const candidate=closest([x,z],segment);if(!nearest||candidate.distance<nearest.distance)nearest={...candidate,segment};}
  if(!nearest)return terrainHeightLocal(terrain,origin,x,z);
  const length=Math.hypot(nearest.dx,nearest.dz)||1,ux=-nearest.dz/length,uz=nearest.dx/length,half=nearest.segment.width/2+2.2,q=nearest.point;
  const samples=[terrainHeightLocal(terrain,origin,q[0],q[1]),terrainHeightLocal(terrain,origin,q[0]+ux*half,q[1]+uz*half),terrainHeightLocal(terrain,origin,q[0]-ux*half,q[1]-uz*half)];
  return Math.max(...samples)+.04;
}

export function terrainMesh(terrain,origin){
  const positions=[],normals=[];
  const vertex=(col,row)=>{const [w,s,e,n]=terrain.bounds,lon=w+(e-w)*col/(terrain.cols-1),lat=s+(n-s)*row/(terrain.rows-1),[x,z]=project(lon,lat,origin);return [x,terrain.elevations[row*terrain.cols+col]-terrain.datum,z];};
  const tri=(a,b,c)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal),n=normal.map(q=>q/length);positions.push(...a,...b,...c);for(let i=0;i<3;i++)normals.push(...n);};
  for(let row=0;row<terrain.rows-1;row++)for(let col=0;col<terrain.cols-1;col++){const a=vertex(col,row),b=vertex(col+1,row),c=vertex(col+1,row+1),d=vertex(col,row+1);tri(a,b,c);tri(a,c,d);}
  return {positions,normals};
}
