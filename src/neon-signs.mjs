import {png} from './png.mjs';
import {glyph,kanaGlyphs,verticalForm} from './pixel-glyphs.mjs';
import {extrude} from './geometry.mjs';
import {shopSignFace} from './shop-signs.mjs';

import catalog from './sign-catalog.mjs';

// Fictional signage rendered from the sign catalog (src/sign-catalog.mjs): generic trade
// words and pixel pictograms, not real businesses. One 512-wide atlas pair (colour with
// alpha, emission) serves every sign.
export const signCatalog=catalog;
const KINDS=['front','vertical','square','tower','rooftop'];

// Placement needs at least one entry of each kind; ids must be unique.
export function validateCatalog(pack){
 if(!Array.isArray(pack))throw new Error('Sign catalog must be an array of entries');
 const ids=new Set();
 for(const e of pack){
  if(!KINDS.includes(e.kind))throw new Error(`Sign ${e.id}: unknown kind "${e.kind}"`);
  if(ids.has(e.id))throw new Error(`Sign ${e.id}: duplicate id`);ids.add(e.id);
  if(!schemes[e.scheme])throw new Error(`Sign ${e.id}: unknown scheme "${e.scheme}"`);
  if(e.kind==='tower'?!e.sections?.length:!e.text)throw new Error(`Sign ${e.id}: missing ${e.kind==='tower'?'sections':'text'}`);
 }
 const missing=KINDS.filter(kind=>!pack.some(e=>e.kind===kind));
 if(missing.length)throw new Error(`Sign catalog needs at least one entry of each kind; missing ${missing.join(', ')}`);
 return pack;
}

// Lightboxes: bright panel with ink and accent; neon: tube colours on a dark board or bare frame.
// frame: plain (thin metal), thick (painted border), bulbs (marquee chaser lights), cap (colour bands).
const schemes={
 green:{panel:[60,196,118],ink:[250,255,245],accent:[255,244,120],tube:[90,255,150]},
 yellow:{panel:[255,188,64],ink:[70,34,18],accent:[196,40,30],tube:[255,180,60]},
 cream:{panel:[250,236,200],ink:[196,38,36],accent:[236,146,40],tube:[255,236,200]},
 cyan:{panel:[80,206,238],ink:[18,30,62],accent:[255,255,255],tube:[80,230,255]},
 red:{panel:[218,48,44],ink:[255,240,222],accent:[255,216,90],tube:[255,64,58]},
 magenta:{panel:[236,70,170],ink:[255,240,250],accent:[120,236,255],tube:[255,72,190]},
 violet:{panel:[150,96,236],ink:[250,245,255],accent:[255,200,90],tube:[176,108,255]}
};
const WIDTH=512,KANA=2,LATIN=3,ROOF_KANA=3,ROOF_LATIN=4,TOWER={kana:3,latin:4,icon:2};
const FRAME_WIDTH={plain:2,thick:4,bulbs:6,cap:2};
const frameOf=entry=>entry.kind==='rooftop'?0:FRAME_WIDTH[entry.frame??'plain'];
const tokens=text=>text.match(/\{[a-z]+\}|./gu)??[];
// Kana, hanzi and icons carry their own margins; 5×7 Latin letters need a gap.
const wide=ch=>ch in kanaGlyphs||ch.startsWith('{');

function layout(text,{kana,latin,icon=kana,vertical}){
 const list=tokens(text),marks=[];let pen=0;
 for(const raw of list){
  const ch=vertical?verticalForm(raw):raw;
  if(ch===' '){pen+=wide(list[0])?8*kana:3*latin;continue;}
  const bitmap=glyph(ch),scale=ch.startsWith('{')?icon:wide(ch)?kana:latin,w=bitmap[0].length*scale,h=bitmap.length*scale;
  marks.push({bitmap,offset:pen,scale,w,h});
  pen+=(vertical?h:w)+(wide(ch)?0:latin);
 }
 const trailing=list.length&&!wide(list.at(-1))?latin:0;
 return {marks,length:pen-trailing,thickness:Math.max(0,...marks.map(m=>vertical?m.w:m.h))};
}

// Tower sections stack top to bottom: big vertical text or icons, or small:… horizontal lines.
function towerSections(entry){
 return entry.sections.map(section=>section.startsWith('small:')?{small:true,text:layout(section.slice(6),{kana:1,latin:1})}:{small:false,text:layout(section,{...TOWER,vertical:true})});
}

function entrySize(entry){
 const f=frameOf(entry)*2;
 if(entry.kind==='tower'){
  const parts=towerSections(entry),across=Math.max(...parts.map(p=>p.small?p.text.length:p.text.thickness));
  return [Math.max(40,across+f+8),parts.reduce((s,p)=>s+(p.small?p.text.thickness:p.text.length)+8,0)+f+4];
 }
 const t=layout(entry.text,entry.kind==='rooftop'?{kana:ROOF_KANA,latin:ROOF_LATIN}:{kana:KANA,latin:LATIN,vertical:entry.kind==='vertical'});
 if(entry.kind==='vertical')return [Math.max(32,t.thickness+f+6),t.length+f+8];
 if(entry.kind==='rooftop')return [t.length+12,Math.max(44,t.thickness+8)];
 if(entry.kind==='square'){const side=Math.max(t.length,t.thickness)+f+8;return [side,side];}
 return [t.length+f+16,Math.max(32,t.thickness+f+6)];
}

// Ink mask in entry-local pixels (1 ink, 2 accent) plus separator rows for towers.
function inkMask(entry,r){
 const ink=new Uint8Array(r.w*r.h),rules=[];
 const stamp=(m,x0,y0)=>m.bitmap.forEach((row,gy)=>row.forEach((value,gx)=>{if(!value)return;for(let dy=0;dy<m.scale;dy++)for(let dx=0;dx<m.scale;dx++){
  const px=Math.round(x0+gx*m.scale+dx),py=Math.round(y0+gy*m.scale+dy);if(px>=0&&py>=0&&px<r.w&&py<r.h)ink[py*r.w+px]=value;}}));
 if(entry.kind==='tower'){
  let y=frameOf(entry)+6;
  towerSections(entry).forEach((part,i,all)=>{
   if(part.small){for(const m of part.text.marks)stamp(m,(r.w-part.text.length)/2+m.offset,y);y+=part.text.thickness+8;}
   else{for(const m of part.text.marks)stamp(m,(r.w-m.w)/2,y+m.offset);y+=part.text.length+8;}
   if(i<all.length-1)rules.push(Math.round(y-5));
  });
  return {ink,rules};
 }
 const vertical=entry.kind==='vertical',text=layout(entry.text,entry.kind==='rooftop'?{kana:ROOF_KANA,latin:ROOF_LATIN}:{kana:KANA,latin:LATIN,vertical});
 for(const m of text.marks){
  const along=(vertical?r.h:r.w)/2-text.length/2+m.offset,across=((vertical?r.w:r.h)-(vertical?m.w:m.h))/2;
  stamp(m,vertical?across:along,vertical?along:across);
 }
 return {ink,rules};
}

// Shelf packing, tallest first, so atlas placement is deterministic.
function pack(entries){
 const sized=entries.map(e=>{try{return {entry:e,size:entrySize(e)};}catch(error){throw new Error(`Sign ${e.id}: ${error.message}`);}}).sort((a,b)=>b.size[1]-a.size[1]||a.entry.id.localeCompare(b.entry.id));
 const placed={};let x=0,y=0,shelf=0;
 for(const {entry,size:[w,h]} of sized){
  if(x+w>WIDTH){x=0;y+=shelf+2;shelf=0;}
  placed[entry.id]={x,y,w,h};x+=w+2;shelf=Math.max(shelf,h);
 }
 // The atlas is 512 wide and grows in powers of two as the catalog gets bigger.
 const used=y+shelf;if(used>2048)throw new Error('Sign atlas overflow');
 return {placed,height:used<=512?512:used<=1024?1024:2048};
}

export function signAtlas(catalog=signCatalog){
 validateCatalog(catalog);
 const {placed:rects,height:HEIGHT}=pack(catalog),entries={};
 const rgba=new Uint8Array(WIDTH*HEIGHT*4),glow=new Uint8Array(WIDTH*HEIGHT*4);
 const clamp=c=>c.map(v=>Math.max(0,Math.min(255,Math.round(v))));
 const put=(x,y,c,light=[0,0,0],alpha=255)=>{rgba.set([...clamp(c),alpha],(y*WIDTH+x)*4);glow.set([...clamp(light),255],(y*WIDTH+x)*4);};
 for(const entry of catalog){
  const r=rects[entry.id],scheme=schemes[entry.scheme],vertical=entry.kind==='vertical'||entry.kind==='tower',frame=entry.kind==='rooftop'?'none':entry.frame??'plain',fw=frameOf(entry);
  const {ink,rules}=inkMask(entry,r);
  const near=(x,y)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<r.w&&ny<r.h&&ink[ny*r.w+nx])return true;}return false;};
  // Marquee bulbs sit on the frame's centre line every 5 px; alternate bulbs are dimmer.
  const bulb=(x,y)=>{const b=Math.min(x,y,r.w-1-x,r.h-1-y);if(Math.abs(b-2.5)>1.2)return 0;const along=b===Math.min(x,r.w-1-x)?y:x,phase=Math.round((along-2.5)/5);return Math.abs(along-2.5-phase*5)<=1?(phase%2?1:2):0;};
  for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){
   const noise=((Math.imul(r.x+x+3,73856093)^Math.imul(r.y+y+11,19349663))>>>0)%7-3,on=ink[y*r.w+x],b=Math.min(x,y,r.w-1-x,r.h-1-y),X=r.x+x,Y=r.y+y;
   const metal=[44,46,50].map(v=>v+noise),lightbox=entry.style==='lightbox';
   if(frame==='plain'&&b<2){put(X,Y,metal);continue;}
   if(frame==='thick'&&b<4){const paint=lightbox?scheme.ink:scheme.tube;put(X,Y,b===3?metal:paint.map(v=>v*.9+noise),b===3?[0,0,0]:paint.map(v=>v*(lightbox?.5:.8)));continue;}
   if(frame==='bulbs'&&b<6){const lit=bulb(x,y);put(X,Y,lit?[255,236,176]:[30,28,32].map(v=>v+noise),lit===2?[255,214,130]:lit===1?[110,90,55]:[0,0,0]);continue;}
   if(frame==='cap'&&(b<2||(vertical?y<fw+6||y>=r.h-fw-6:x<fw+6||x>=r.w-fw-6))){put(X,Y,b<2?metal:scheme.accent.map(v=>v*.9+noise),b<2?[0,0,0]:scheme.accent.map(v=>v*.55));continue;}
   if(rules.some(ry=>Math.abs(y-ry)<1)){const c=lightbox?scheme.ink:scheme.tube;put(X,Y,c.map(v=>v*.8),c.map(v=>v*(lightbox?.1:.6)));continue;}
   if(lightbox){
    const shade=1-.12*Math.abs((vertical?x/r.w:y/r.h)-.5)*2,color=on===2?scheme.accent:scheme.ink;
    if(on)put(X,Y,color,color.map(v=>v*(Math.max(...color)>200?.9:.08)));
    else put(X,Y,scheme.panel.map(v=>v*shade+noise),scheme.panel.map(v=>v*.85*shade));
   }
   else{
    // Tube core is whiter than its colour; a one-pixel halo fakes the bloom a PS2 would paint in.
    const tube=on===2?scheme.accent:scheme.tube,core=tube.map(v=>v+(255-v)*.45),halo=!on&&near(x,y);
    if(on)put(X,Y,core,tube);
    else if(halo)put(X,Y,entry.style==='cutout'?[64,64,70]:scheme.tube.map(v=>v*.35+18),scheme.tube.map(v=>v*.28));
    else if(entry.style==='cutout')put(X,Y,[0,0,0],[0,0,0],0);
    else put(X,Y,[24,22,30].map(v=>v+noise));
   }
  }
  entries[entry.id]={...entry,...r,aspect:r.w/r.h,uv:uvOf(r,HEIGHT)};
 }
 return {
  color:{name:`Neon_signs_${WIDTH}x${HEIGHT}`,width:WIDTH,height:HEIGHT,rgba,png:png(WIDTH,HEIGHT,rgba)},
  emissive:{name:`Neon_signs_emissive_${WIDTH}x${HEIGHT}`,width:WIDTH,height:HEIGHT,rgba:glow,png:png(WIDTH,HEIGHT,glow)},
  entries
 };
}

const uvOf=(r,height)=>({u0:(r.x+.5)/WIDTH,u1:(r.x+r.w-.5)/WIDTH,v0:(r.y+.5)/height,v1:(r.y+r.h-.5)/height});

export const signsOfKind=(atlas,kind)=>Object.values(atlas.entries).filter(e=>e.kind===kind);

// Rooftop channel letters: an alpha-cut face set back from the front edge on a steel frame.
export function rooftopSign({a,u,n,center,width,height,roof,uv,setback=1.2}){
 const lift=.7,left=center-width/2,right=center+width/2,base=[a[0]-n[0]*setback,a[1]-n[1]*setback];
 const face=shopSignFace(base,u,n,left,right,roof+lift,roof+lift+height,uv,0);
 if(!face)return null;
 const p=(x,d)=>[a[0]+u[0]*x-n[0]*d,a[1]+u[1]*x-n[1]*d],beam=(l,r,bottom,top)=>extrude([p(l,setback+.06),p(r,setback+.06),p(r,setback+.16),p(l,setback+.16)],top-bottom,bottom);
 const posts=[left+.15,center,right-.15].map(x=>beam(x-.05,x+.05,roof,roof+lift+height));
 const rails=[roof+lift-.08,roof+lift+height*.5].map(y=>beam(left,right,y,y+.08));
 const frame={positions:[...posts,...rails].flatMap(m=>m.positions),normals:[...posts,...rails].flatMap(m=>m.normals)};
 return {face,frame,footprint:[p(left,setback-.02),p(right,setback-.02),p(right,setback+.18),p(left,setback+.18)]};
}
