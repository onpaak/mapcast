import {extrude} from './geometry.mjs';
import {polygonsOverlap,strip} from './spatial.mjs';

// Decorative geometry only; all additions are inferred, never surveyed OSM objects.
export function facadeDetails(building,a,b,out,profile,buildings,roads,material){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),axis=[(b[0]-a[0])/length,(b[1]-a[1])/length];
  const height=building.extras.height,parts=new Map(),counts={};
  const blockers=[...buildings.map(x=>x.extras.footprint),...roads.map(s=>strip(s.a,s.b,s.width+.2)).filter(Boolean)];
  const point=(s,d)=>[a[0]+axis[0]*s+out[0]*d,a[1]+axis[1]*s+out[1]*d];
  function add(kind,left,right,near,far,y,h){
    // Pieces under a millimetre (rounding left-overs at the end of a wall) are skipped.
    if(right-left<1e-3||y<0||y+h>height+.5)return false;
    const ring=[point(left,near),point(right,near),point(right,far),point(left,far)];
    if(blockers.some(r=>polygonsOverlap(ring,r)))return false;
    const mesh=extrude(ring,h,y);
    if(!parts.has(kind))parts.set(kind,[]);
    parts.get(kind).push(mesh);counts[kind]=(counts[kind]??0)+1;return true;
  }
  // Short pieces allow a cornice to stop before an adjacent wing or road.
  for(let s=.2;s<length-.2;s+=3){
    const end=Math.min(s+3,length-.2);
    add('Cornice',s,end,.015,.32,height-.3,.23);
    if(profile.type==='residential'||profile.type==='retail')add('BeltCourse',s,end,.015,.16,profile.floorHeight-.13,.13);
  }
  if(['station','hospital','hotel','education'].includes(profile.type)&&length>6){
    const width=Math.min(length-1,profile.type==='station'?10:7),center=length/2,depth=profile.type==='station'?1.35:.85;
    add('EntranceCanopy',center-width/2,center+width/2,.02,depth,Math.min(3.15,height-.35),.18);
  }
  if(profile.type==='religious')for(let s=1;s<length-1;s+=Math.max(3,profile.bayWidth))add('Pilaster',s-.12,s+.12,.015,.28,.25,height-.65);
  if(['industrial','office','parking','station','sports'].includes(profile.type))return result();
  // Match window centers to the same anchored UV projection as the facade texture.
  const anchor=building.extras.footprint[0],rate=axis[0]*out[1]-axis[1]*out[0];
  const start=(a[0]-anchor[0])*out[1]-(a[1]-anchor[1])*out[0],bay=profile.bayWidth;
  const lo=Math.min(start,start+length*rate),hi=Math.max(start,start+length*rate);
  for(let k=Math.floor(lo/bay);k<=Math.ceil(hi/bay);k++){
    const s=((k+.5)*bay-start)/rate,w=bay*(profile.type==='house'?.50:.58);
    if(s-w/2<.4||s+w/2>length-.4)continue;
    for(let floor=1;floor<Math.min(profile.floors,16);floor++){
      const bottom=profile.type==='house'?46:52,y=(floor+1-bottom/64)*profile.floorHeight;
      add('WindowSill',s-w/2,s+w/2,.015,.24,y-.10,.10);
      if(['residential','hotel'].includes(profile.type)&&profile.variant%3===1&&((k%3)+3)%3===1&&floor<5){
        // Check the entire balcony envelope before emitting its slab and solid low-poly rails.
        const envelope=[point(s-w/2,.015),point(s+w/2,.015),point(s+w/2,.85),point(s-w/2,.85)];
        if(blockers.some(r=>polygonsOverlap(envelope,r)))continue;
        const base=floor*profile.floorHeight+.06;
        add('Balcony',s-w/2,s+w/2,.015,.85,base,.14);
        add('Balcony',s-w/2,s+w/2,.75,.85,base+.14,.75);
        add('Balcony',s-w/2,s-w/2+.10,.015,.75,base+.14,.75);
        add('Balcony',s+w/2-.10,s+w/2,.015,.75,base+.14,.75);
      }
    }
  }
  return result();
  function result(){return [...parts].map(([kind,meshes])=>({name:`${building.name}_${kind}`,positions:meshes.flatMap(m=>m.positions),normals:meshes.flatMap(m=>m.normals),material,extras:{sourceId:building.extras.sourceId,appearanceSource:'procedural-interpretation',detail:kind,componentCount:counts[kind]}}));}
}
