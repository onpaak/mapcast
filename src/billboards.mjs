import {png} from './png.mjs';
import {extrude} from './geometry.mjs';
import {paintBillboards} from './billboard-art.mjs';
import {shopSignFace} from './shop-signs.mjs';

// Rooftop billboards: 2:1 artwork in a 512×512 atlas of eight 256×128 slots, sampled
// with bilinear filtering for the soft look of PS2 ad textures (other atlases stay crisp).
// Replace Billboards_512.png via overrides (tools/billboard-textures.mjs builds one from
// your own images). The artwork doubles as its emissive map for floodlit nights.
export const BILLBOARD_LAYOUT={name:'Billboards_512',size:512,slot:{w:256,h:128},slots:8};
const L=BILLBOARD_LAYOUT,COLS=L.size/L.slot.w;
export const slotRect=i=>({x:(i%COLS)*L.slot.w,y:Math.floor(i/COLS)*L.slot.h,w:L.slot.w,h:L.slot.h});
export const billboardCells=Array.from({length:L.slots},(_,i)=>{const r=slotRect(i);return {u0:(r.x+.5)/L.size,u1:(r.x+r.w-.5)/L.size,v0:(r.y+.5)/L.size,v1:(r.y+r.h-.5)/L.size};});

// Placeholder ads: eight pixel-art posters with different layouts (see billboard-art.mjs).
export function placeholderBillboards(){
 const size=L.size,rgba=new Uint8Array(size*size*4);
 paintBillboards(rgba,size,slotRect);
 return {name:L.name,width:size,height:size,rgba,png:png(size,size,rgba),filter:'linear'};
}

// Billboard on a steel frame, set back from the roof edge and facing the street.
// Returns the artwork face and the metal structure (posts, braces, walkway, floodlights).
export function rooftopBillboard({a,u,n,center,width,roof,uv,setback=1.6,lift=1.4}){
 const height=width/2,left=center-width/2,right=center+width/2,bottom=roof+lift,top=bottom+height;
 const face=shopSignFace([a[0]-n[0]*setback,a[1]-n[1]*setback],u,n,left,right,bottom,top,uv,0);
 if(!face)return null;
 const p=(x,d)=>[a[0]+u[0]*x-n[0]*d,a[1]+u[1]*x-n[1]*d];
 const beam=(l,r,d0,d1,y0,y1)=>extrude([p(l,d0),p(r,d0),p(r,d1),p(l,d1)],y1-y0,y0);
 const parts=[
  beam(left,right,setback+.01,setback+.18,bottom-.05,top+.05),                // panel back
  beam(left-.3,right+.3,setback-.55,setback+.05,bottom-.18,bottom-.1),         // walkway grille
  ...[0,.5,1].flatMap(t=>{const x=left+.4+(width-.8)*t;return [
   beam(x-.08,x+.08,setback+.2,setback+.36,roof,top),                        // post
   beam(x-.05,x+.05,setback+.36,setback+1.9,roof,roof+.1),                   // foot
   beam(x-.04,x+.04,setback+.36,setback+.44,roof+.1,bottom+height*.6)];}),    // brace
  ...[.12,.5,.88].flatMap(t=>{const x=left+width*t;return [
   beam(x-.03,x+.03,setback-.9,setback+.02,top+.1,top+.16),                  // floodlight arm
   beam(x-.18,x+.18,setback-1.02,setback-.82,top-.02,top+.14)];})            // lamp head
 ];
 const frame={positions:parts.flatMap(m=>m.positions),normals:parts.flatMap(m=>m.normals)};
 return {face,frame,height,footprint:[p(left-.3,setback-1.05),p(right+.3,setback-1.05),p(right+.3,setback+1.9),p(left-.3,setback+1.9)]};
}
