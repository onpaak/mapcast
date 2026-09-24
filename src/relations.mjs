import {insidePolygon} from './spatial.mjs';
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
export function joinRings(parts){
  const pending=parts.map(p=>p.map(c=>[...c])),rings=[];
  while(pending.length){
    const chain=pending.shift();if(chain.length<2)throw new Error('Relation member has insufficient coordinates');
    while(!same(chain[0],chain.at(-1))){
      const matches=[];
      pending.forEach((p,i)=>{if(same(chain.at(-1),p[0]))matches.push({i,reverse:false});else if(same(chain.at(-1),p.at(-1)))matches.push({i,reverse:true});});
      if(matches.length!==1)throw new Error('Relation has missing or ambiguous ring connections');
      const {i,reverse}=matches[0],next=pending.splice(i,1)[0];if(reverse)next.reverse();chain.push(...next.slice(1));
    }
    if(chain.length<4)throw new Error('Relation ring has fewer than three vertices');rings.push(chain);
  }return rings;
}
export function relationPolygons(relation,ways,nodes){
  if(relation.tags?.type!=='multipolygon')throw new Error('Only multipolygon building relations supported');
  const outer=[],inner=[];
  for(const m of relation.members??[]){
    if(m.type!=='way'||!['outer','inner',''].includes(m.role??''))throw new Error('Unsupported building relation member or role');
    const way=ways.get(m.ref),geometry=m.geometry??way?.geometry??way?.nodes?.map(id=>nodes.get(id));
    if(!geometry||geometry.some(c=>!c||!Number.isFinite(c.lon)||!Number.isFinite(c.lat)))throw new Error(`Missing relation member geometry: way/${m.ref}`);
    (m.role==='inner'?inner:outer).push(geometry.map(c=>[c.lon,c.lat]));
  }
  const polygons=joinRings(outer).map(r=>[r]);if(!polygons.length)throw new Error('Relation has no outer rings');
  for(const hole of joinRings(inner)){
    const candidates=polygons.filter(p=>hole.every(v=>insidePolygon(v,p[0])));
    if(candidates.length!==1)throw new Error('Inner ring does not belong to exactly one outer ring');candidates[0].push(hole);
  }
  return polygons;
}
