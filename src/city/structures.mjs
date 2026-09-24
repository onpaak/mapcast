import {extrude} from '../geometry.mjs';
import {BIN} from './materials.mjs';

// Structures with no floors or windows: towers and masts, spherical sections, spires, and
// thin columns and fins. Ordinary buildings, however small, keep their facades.

const numeric=v=>/^\d+(\.\d+)?(\s*m)?$/.test(String(v))?parseFloat(v):NaN;
const planArea=ring=>{const p=ring.slice(0,-1);return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;};

const TOWERS=['tower','communications_tower','mast','chimney'];
// 'sphere' for building:shape=sphere; 'spire' for a pointed section (tagged, or a small
// pyramidal / conical one); 'column' for antennas, masts and sections under 8 m²; 'shaft' for
// towers (building=tower or a man_made tower, their sections included); otherwise null.
export function structureKind(tags,ring){
  const low=key=>String(tags[key]??'').toLowerCase(),isPart=tags['building:part']!==undefined,part=low('building:part');
  const tower=low('building')==='tower'||TOWERS.includes(low('man_made'));
  if(low('building:shape')==='sphere')return 'sphere';
  if(isPart||tower){
    if(part==='spire')return 'spire';
    if(['antenna','mast','column'].includes(part))return 'column';
    if(['pyramidal','cone'].includes(low('roof:shape'))&&planArea(ring)<80)return 'spire';
    if(isPart&&planArea(ring)<8)return 'column';
  }
  return tower?'shaft':null;
}

// A low-poly ellipsoid filling the section: as wide as the footprint, as tall as the section.
function sphere(ring,height){
  const points=ring.slice(0,-1),c=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  const r=Math.max(...points.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1]))),ry=height/2,SEG=16,RINGS=10;
  const at=(i,j)=>{const t=Math.PI*j/RINGS,f=2*Math.PI*i/SEG;return [c[0]+r*Math.sin(t)*Math.cos(f),ry-ry*Math.cos(t),c[1]+r*Math.sin(t)*Math.sin(f)];};
  const positions=[],normals=[];
  const tri=(a,b,d)=>{
    const u=b.map((v,k)=>v-a[k]),v=d.map((x,k)=>x-a[k]);let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const m=[(a[0]+b[0]+d[0])/3-c[0],(a[1]+b[1]+d[1])/3-ry,(a[2]+b[2]+d[2])/3-c[1]];
    if(n[0]*m[0]+n[1]*m[1]+n[2]*m[2]<0){[b,d]=[d,b];n=n.map(x=>-x);}
    const l=Math.hypot(...n);if(l<1e-9)return;
    positions.push(...a,...b,...d);for(let k=0;k<3;k++)normals.push(...n.map(x=>x/l));
  };
  for(let j=0;j<RINGS;j++)for(let i=0;i<SEG;i++){
    const a=at(i,j),b=at(i+1,j),d=at(i+1,j+1),e=at(i,j+1);
    if(j>0)tri(a,b,d);if(j<RINGS-1)tri(a,d,e);
  }
  return {positions,normals};
}

// Plain metal or concrete: a shaft or column is the extruded footprint, a sphere fills its
// section, and a spire's last roof:height metres (a third of it when untagged) taper to a point.
export function buildStructure(building,emit){
  const {ring,height,structure}=building,tags=building.source.extras.osmTags??{};
  const bin=/metal|steel/.test(`${tags['building:material']??''} ${tags['building:facade:material']??''} ${tags['roof:material']??''}`)?BIN.metal:BIN.wall;
  if(structure==='sphere'){emit(sphere(ring,height),bin);return;}
  if(structure==='column'||structure==='shaft'){emit(extrude(ring,height),bin);return;}
  const taper=Math.min(height,numeric(tags['roof:height'])||height/3),shaft=height-taper;
  if(shaft>.05)emit(extrude(ring,shaft),bin);
  const points=ring.slice(0,-1),c=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]),apex=[c[0],height,c[1]];
  const positions=[],normals=[];
  points.forEach((p,i)=>{
    const q=points[(i+1)%points.length];let a=[p[0],shaft,p[1]],b=[q[0],shaft,q[1]];
    const u=b.map((v,k)=>v-a[k]),v=apex.map((x,k)=>x-a[k]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    // Face outwards, away from the centre.
    if(n[0]*((p[0]+q[0])/2-c[0])+n[2]*((p[1]+q[1])/2-c[1])<0){[a,b]=[b,a];n=n.map(x=>-x);}
    const l=Math.hypot(...n);if(l<1e-9)return;
    positions.push(...a,...b,...apex);for(let k=0;k<3;k++)normals.push(...n.map(x=>x/l));
  });
  emit({positions,normals},bin);
}
