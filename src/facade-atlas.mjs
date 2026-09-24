import {png} from './png.mjs';

// PS2-style facades: one bay × one floor per 64 px cell, windows painted into the
// texture instead of modelled. Street-facing ground floors keep real geometry.
// Layout (8×8 cells, 512×512): rows 0-6 are window profiles; columns 0-3 are upper
// floor variants, 4-7 ground floor variants. Row 7 holds loggia, plain wall and curtain wall cells.
const CELL=64,GRID=8,FLOOR=3,BASE=.6;
export const facadeProfiles=[
 {name:'slender-windows',bayWidth:3.2,windowWidth:1.05,sill:.85,head:.48},
 {name:'wide-windows',bayWidth:3.6,windowWidth:1.75,sill:.95,head:.55},
 {name:'grouped-loggias',bayWidth:3.4,windowWidth:1.25,sill:.8,head:.45},
 {name:'plain-window-block',bayWidth:3.4,windowWidth:1.65,sill:.9,head:.5},
 {name:'office',bayWidth:2.5,windowWidth:1.45,sill:.28,head:.28},
 // Small square punched windows of prefabricated panel blocks.
 {name:'square-windows',bayWidth:3.0,windowWidth:1.2,sill:1.0,head:.8},
// High-rise towers: plain concrete with a row of three small windows per bay, each lit or dark
 // on its own, so a tower reads as a dense field of lit windows at night.
 {name:'tower-grid',bayWidth:3.0,sill:.95,head:.95,grid:true}
];
// Tower cells: which of the three windows are lit ('c' cool white, 'w' warm, '-' dark).
const TOWER_PATTERNS=['---','c--','-wc','cc-'];
const TOWER_WINDOWS=[[4,18],[25,39],[46,60]];
export const facadeVariants=['dark','curtain','lit-warm','lit-cool'];
const groundVariants=[{base:'concrete',lit:false},{base:'concrete',lit:true},{base:'brick',lit:false},{base:'brick',lit:true}];
const LOGGIA_ROW=7,PLAIN=[LOGGIA_ROW,4],RECESS=[LOGGIA_ROW,5],CURTAIN=[[LOGGIA_ROW,6],[LOGGIA_ROW,7]];
// Atlas wall is painted brighter than the ground tiles; these tints bring it back to
// Weathered concrete / Warm plaster / Cool concrete so atlas faces match modelled ones.
// The palette is a neutral cool grey rather than beige.
export const facadeTints=[[.84,.84,.83,1],[.96,.94,.9,1],[.72,.79,.86,1]];
const WALL=[172,172,168],DARK_BASE=[90,93,81],BRICK=[158,116,91];

// About a fifth of windows are lit, mostly cool fluorescent white with some warm lamps.
// By day the lit cells read as dim interiors because renderers scale facade emission down.
export function facadeVariant(seed){const r=seed%100;return r<7?2:r<20?3:r<40?1:0;}
export function facadeRow(name){const row=facadeProfiles.findIndex(p=>p.name===name);return row<0?0:row;}
export function groundCell(row,{brick,seed}){return [row,4+(brick?2:0)+(seed%100<15?1:0)];}
// Towers light about a third of their windows (see TOWER_PATTERNS).
export function towerVariant(seed){const r=seed%100;return r<35?0:r<60?1:r<82?2:3;}
export function upperCell(row,seed){return [row,facadeProfiles[row]?.grid?towerVariant(seed):facadeVariant(seed)];}
export function loggiaCell(seed){return [LOGGIA_ROW,facadeVariant(seed)];}
export const plainCell=PLAIN;
// Curtain wall cell for glass buildings: dark glass, or lit by the office lights behind it.
export function curtainCell(lit){return CURTAIN[lit?1:0];}

// UV rectangle for one cell, inset half a texel so nearest sampling never bleeds.
export function cellUV([row,col]){
 const size=CELL*GRID,x=col*CELL,y=row*CELL;
 return {u0:(x+.5)/size,u1:(x+CELL-.5)/size,v0:(y+.5)/size,v1:(y+CELL-.5)/size};
}

// Window rectangle in cell pixels, mirroring the modelled facade proportions.
export function windowPixels(profile){
 if(profile.grid)return {left:TOWER_WINDOWS[0][0],right:TOWER_WINDOWS[2][1],top:Math.round(profile.head/FLOOR*CELL),bottom:Math.round(CELL-profile.sill/FLOOR*CELL)};
 const width=Math.min(profile.windowWidth,profile.bayWidth*.54)/profile.bayWidth*CELL;
 return {left:Math.round((CELL-width)/2),right:Math.round((CELL+width)/2),top:Math.round(profile.head/FLOOR*CELL),bottom:Math.round(CELL-profile.sill/FLOOR*CELL)};
}

function paintCell(set,ox,oy,{win,variant,base,door,recess}){
 for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++){
  const noise=((Math.imul(ox+x+7,73856093)^Math.imul(oy+y+19,19349663))>>>0)%11-5;
  const foot=Math.pow(y/63,6)*14;
  // Rain streaks run down from each sill.
  const streak=win&&!door&&x>win.left&&x<win.right&&y>win.bottom?Math.max(0,Math.sin((ox+x)*.9)-.3)*(1-(y-win.bottom)/(CELL-win.bottom))*22:0;
  let c=WALL.map(v=>v+noise-foot-streak),light=[0,0,0];
  if(recess)c=c.map(v=>v*.62-y*.25);
  else if(x===0||y===CELL-1)c=c.map(v=>v-34);
  else if(x===1||y===CELL-2)c=c.map(v=>v+10);
  const baseTop=CELL-Math.round(BASE/FLOOR*CELL);
  if(base&&y>=baseTop){
   c=base==='brick'?((y-baseTop)%5===0||(x+(Math.floor((y-baseTop)/5)%2)*6)%12===0?[112,98,82]:BRICK.map(v=>v+noise)):DARK_BASE.map(v=>v+noise);
   if(y===baseTop)c=c.map(v=>v+26);
  }
  if(win){
   const {left,right,top,bottom}=win,inside=x>=left&&x<right&&y>=top&&y<bottom;
   if(inside){
    const frame=x<left+2||x>=right-2||y<top+2||y>=bottom-2,mullion=door?Math.abs(x-door)<1:Math.abs(x-(left+right-1)/2)<1;
    if(frame||mullion)c=[150,152,146].map(v=>v+noise*.4-(x<left+2||y<top+2?18:0));
    else{
     const t=(y-top)/(bottom-top),reflect=10*Math.max(0,1-Math.abs((x-left)-(y-top)*.8-6)/5);
     c=[35,53,60].map(v=>v+reflect+noise*.2);
     if(y<top+4)c=c.map(v=>v*.6);
     if(variant==='curtain'&&(x<left+2+(right-left)*.28||x>=right-2-(right-left)*.22))c=[146,132,108].map(v=>v*(.85+.15*Math.sin(x*1.7))+noise*.3);
     // Lit windows are near-white: a soft warm white and a cool fluorescent white.
     if(variant==='lit-warm')light=[255,238,210].map(v=>v*(.8+.2*t));
     if(variant==='lit-cool')light=[222,234,248].map(v=>v*(.95-.2*t));
     if(light[0])c=light.map(v=>v*.42+noise*.3);
    }
   }
   else if(!door&&(y===bottom||y===bottom+1)&&x>=left-1&&x<=right)c=[196,190,176].map(v=>v+noise*.3-(y===bottom+1?40:0));
   else if(!recess&&x>=left-1&&x<right+1&&y===top-1)c=c.map(v=>v-26);
  }
  set(ox+x,oy+y,c,light);
 }
}

// Tower cell: mid-grey concrete with floor and bay joints and three small windows. The
// wall is a little darker than the low-rise blocks; at night lighting, not the albedo,
// makes towers read as dark masses behind their lit windows.
function paintTowerCell(set,ox,oy,{pattern,base}){
 const top=Math.round(.95/FLOOR*CELL),bottom=CELL-top,baseTop=CELL-Math.round(BASE/FLOOR*CELL);
 for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++){
  const noise=((Math.imul(ox+x+7,73856093)^Math.imul(oy+y+19,19349663))>>>0)%9-4;
  let c=[134,136,138].map(v=>v+noise-(x===0||y===CELL-1?26:0)),light=[0,0,0];
  if(base&&y>=baseTop)c=DARK_BASE.map(v=>v*.9+noise);
  const w=TOWER_WINDOWS.findIndex(([l,r])=>x>=l&&x<r);
  if(w>=0&&y>=top&&y<bottom){
   const edge=x===TOWER_WINDOWS[w][0]||x===TOWER_WINDOWS[w][1]-1||y===top||y===bottom-1,kind=pattern[w];
   if(edge)c=[158,160,158].map(v=>v+noise*.4);
   else if(kind==='-')c=[18,24,32].map(v=>v+noise*.3+(y-top<3?-6:0));
   else{light=kind==='c'?[222,234,248]:[255,238,210];c=light.map(v=>v*.5+noise*.3);}
  }
  set(ox+x,oy+y,c,light);
 }
}

// Curtain wall cell: one bay of glass between metal mullions, over a dark spandrel panel
// at the floor slab. Lit cells show office ceiling lights; the spandrels stay dark, so
// a lit tower reads as bands of floors at night.
function paintCurtainCell(set,ox,oy,{lit}){
 const spandrel=CELL-9;
 for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++){
  const noise=((Math.imul(ox+x+7,73856093)^Math.imul(oy+y+19,19349663))>>>0)%7-3;
  let c,light=[0,0,0];
  if(x<2||y===0)c=[122,130,136].map(v=>v+noise*.4-(x===1?14:0));
  else if(y>=spandrel)c=(y===spandrel?[104,112,118]:[46,54,60]).map(v=>v+noise*.4);
  else if(x===32)c=[108,116,122].map(v=>v+noise*.4);
  else{
   // Glass is a little lighter at the top; engines add the real reflections. Lit cells look
   // the same by day; only their emission, ceiling lights over dimmer desks, differs.
   const t=(y-1)/(spandrel-1);
   c=[64,86,102].map((v,i)=>v+(1-t)*[18,20,22][i]+noise*.3);
   if(lit){light=[222,234,248].map(v=>v*(y>=3&&y<=4?.9:y<=8?.75:.62-.16*t));c=c.map((v,i)=>v*.9+light[i]*.08);}
  }
  set(ox+x,oy+y,c,light);
 }
}

export function facadeAtlas(){
 const size=CELL*GRID,rgba=new Uint8Array(size*size*4),glow=new Uint8Array(size*size*4);
 const clamp=c=>c.map(v=>Math.max(0,Math.min(255,Math.round(v))));
 const set=(x,y,c,light)=>{rgba.set([...clamp(c),255],(y*size+x)*4);glow.set([...clamp(light),255],(y*size+x)*4);};
 facadeProfiles.forEach((profile,row)=>{
  if(profile.grid){
   TOWER_PATTERNS.forEach((pattern,col)=>paintTowerCell(set,col*CELL,row*CELL,{pattern}));
   ['---','--w','---','w--'].forEach((pattern,i)=>paintTowerCell(set,(4+i)*CELL,row*CELL,{pattern,base:true}));
   return;
  }
  const win=windowPixels(profile);
  facadeVariants.forEach((variant,col)=>paintCell(set,col*CELL,row*CELL,{win,variant}));
  groundVariants.forEach((g,i)=>paintCell(set,(4+i)*CELL,row*CELL,{win,variant:g.lit?'lit-warm':'dark',base:g.base}));
 });
 // Loggia back wall: balcony door beside a window, in the recess shade.
 const loggia={left:8,right:56,top:6,bottom:CELL,door:24};
 facadeVariants.forEach((variant,col)=>paintCell(set,col*CELL,LOGGIA_ROW*CELL,{win:loggia,variant,recess:true}));
 paintCell(set,PLAIN[1]*CELL,PLAIN[0]*CELL,{});
 paintCell(set,RECESS[1]*CELL,RECESS[0]*CELL,{recess:true});
 CURTAIN.forEach(([row,col],lit)=>paintCurtainCell(set,col*CELL,row*CELL,{lit}));
 return {
  color:{name:'Facade_atlas_512',width:size,height:size,rgba,png:png(size,size,rgba)},
  emissive:{name:'Facade_atlas_emissive_512',width:size,height:size,rgba:glow,png:png(size,size,glow)}
 };
}

// Faces in an edge-local frame: x along the edge from a, y up, d outward along n.
export function edgeFrame(a,u,n){
 const rightward=u[0]*n[1]-u[1]*n[0]>0;
 const point=(x,y,d)=>[a[0]+u[0]*x+n[0]*d,y,a[1]+u[1]*x+n[1]*d];
 const face=(mesh,corners,uvs,normal)=>{
  const p=corners.map(c=>point(...c)),e1=p[1].map((v,i)=>v-p[0][i]),e2=p[2].map((v,i)=>v-p[0][i]);
  const cross=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
  const order=cross[0]*normal[0]+cross[1]*normal[1]+cross[2]*normal[2]>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
  for(const i of order){mesh.positions.push(...p[i]);mesh.normals.push(...normal);mesh.texcoords.push(...uvs[i]);}
 };
 // Front face at depth d; UVs sample the cell as if it spanned the frame (whole bay-floor).
 const front=(mesh,cell,{left,right,bottom,top,d=0},frame={left,right,bottom,top})=>{
  const uv=cellUV(cell),map=(x,y)=>{const s=(x-frame.left)/(frame.right-frame.left),t=(frame.top-y)/(frame.top-frame.bottom);return [uv.u0+(rightward?s:1-s)*(uv.u1-uv.u0),uv.v0+t*(uv.v1-uv.v0)];};
  face(mesh,[[left,bottom,d],[right,bottom,d],[right,top,d],[left,top,d]],[map(left,bottom),map(right,bottom),map(right,top),map(left,top)],[n[0],0,n[1]]);
 };
 const whole=cell=>{const uv=cellUV(cell);return [[uv.u0,uv.v1],[uv.u1,uv.v1],[uv.u1,uv.v0],[uv.u0,uv.v0]];};
 // Recessed loggia: flush surround, parapet, and a five-sided cavity (~20 triangles).
 const loggia=(mesh,{left,right,bottom,top,l,r,floor,parapet,head,depth,seed})=>{
  const frame={left,right,bottom,top};
  front(mesh,PLAIN,{left,right:l,bottom,top},frame);front(mesh,PLAIN,{left:r,right,bottom,top},frame);
  front(mesh,PLAIN,{left:l,right:r,bottom:head,top},frame);
  front(mesh,PLAIN,{left:l,right:r,bottom,top:parapet},frame);
  face(mesh,[[l,parapet,0],[r,parapet,0],[r,parapet,-.14],[l,parapet,-.14]],whole(RECESS),[0,1,0]);
  front(mesh,loggiaCell(seed),{left:l,right:r,bottom:floor,top:head,d:-depth});
  face(mesh,[[l,floor,-depth],[l,floor,0],[l,head,0],[l,head,-depth]],whole(RECESS),[u[0],0,u[1]]);
  face(mesh,[[r,floor,0],[r,floor,-depth],[r,head,-depth],[r,head,0]],whole(RECESS),[-u[0],0,-u[1]]);
  face(mesh,[[l,head,0],[r,head,0],[r,head,-depth],[l,head,-depth]],whole(RECESS),[0,-1,0]);
  face(mesh,[[l,floor,-.14],[r,floor,-.14],[r,floor,-depth],[l,floor,-depth]],whole(RECESS),[0,1,0]);
 };
 return {front,loggia};
}
