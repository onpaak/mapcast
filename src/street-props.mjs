import {png} from './png.mjs';

// Street clutter for the cyberpunk layer: wall AC units, vending machines and
// standing lightboxes. AC units and metal share a small atlas; vending machines have
// their own texture pair so it can be swapped via texture overrides (docs/textures.md).
const CELLS={acFront:{x:0,y:0,w:64,h:48},acSide:{x:64,y:0,w:32,h:48},metal:{x:96,y:0,w:32,h:48}};
// One white vending machine, front art 256×384 (2:3, matching a 1.22×1.83 m face).
// Replace Vending_machines_512.png via overrides; tools/vending-texture.mjs builds one from photos.
export const VENDING_LAYOUT={name:'Vending_machines_512',emissiveName:'Vending_machines_emissive_512',size:512,
 front:{x:0,y:0,w:256,h:384},side:{x:256,y:0,w:32,h:384},top:{x:288,y:0,w:32,h:32}};
const cellUV=(c,w,h)=>({u0:(c.x+.5)/w,u1:(c.x+c.w-.5)/w,v0:(c.y+.5)/h,v1:(c.y+c.h-.5)/h});
export const propCells={acFront:cellUV(CELLS.acFront,128,64),acSide:cellUV(CELLS.acSide,128,64),metal:cellUV(CELLS.metal,128,64)};
const V=VENDING_LAYOUT;
export const vendingCells={front:cellUV(V.front,V.size,V.size),side:cellUV(V.side,V.size,V.size),top:cellUV(V.top,V.size,V.size)};

function canvas(width,height){
 const rgba=new Uint8Array(width*height*4),glow=new Uint8Array(width*height*4);
 const clamp=c=>c.map(v=>Math.max(0,Math.min(255,Math.round(v))));
 const put=(x,y,c,light=[0,0,0])=>{rgba.set([...clamp(c),255],(y*width+x)*4);glow.set([...clamp(light),255],(y*width+x)*4);};
 const noise=(x,y)=>((Math.imul(x+5,73856093)^Math.imul(y+13,19349663))>>>0)%9-4;
 const paint=(cell,fn)=>{for(let y=0;y<cell.h;y++)for(let x=0;x<cell.w;x++){const [c,l]=fn(x,y,noise(cell.x+x,cell.y+y));put(cell.x+x,cell.y+y,c,l);}};
 return {rgba,glow,paint};
}

export function propsAtlas(){
 const {rgba,paint}=canvas(128,64);
 // AC unit: fan grille on the right, louvres on the left, rust at the base.
 paint(CELLS.acFront,(x,y,n)=>{
  const casing=[200,200,192].map(v=>v+n-(y>40?(y-40)*3:0)),r=Math.hypot(x-42,y-24);
  if(x===0||y===0||x===63||y===47)return [casing.map(v=>v-40)];
  if(r<17)return [r%4<1.2||Math.abs(x-42)<1||Math.abs(y-24)<1?[120,122,120]:[40,42,44].map(v=>v+n)];
  if(r<18.5)return [casing.map(v=>v-30)];
  if(x>5&&x<22&&y>8&&y<40)return [y%4===0?casing.map(v=>v-45):casing];
  return [y>44&&x%7<2?[128,84,52]:casing];
 });
 paint(CELLS.acSide,(x,y,n)=>[[186,186,178].map(v=>v+n-(x===0||y===0?30:0)-(y>8&&y<40&&x>4&&x<28&&y%4===0?40:0))]);
 paint(CELLS.metal,(x,y,n)=>[[58,60,64].map(v=>v+n)]);
 return {name:'Street_props_128x64',width:128,height:64,rgba,png:png(128,64,rgba)};
}

// Placeholder art for a white machine: lit top band and drink display, buttons, coin
// panel, dispenser. Painted on a 64×128 design grid scaled up to the 256×384 front.
export function vendingAtlas(){
 const {rgba,glow,paint}=canvas(V.size,V.size),white=[222,224,218];
 const cans=[[220,40,40],[40,120,220],[250,210,60],[60,180,90],[240,240,240],[160,70,200],[250,130,40]];
 const design=(x,y,n)=>{
  const body=white.map(v=>v+n);
  if(x<2||x>61)return [body.map(v=>v*.8)];
  if(y>=3&&y<9)return [[240,240,236],[210,214,220]];
  if(y>=12&&y<62){
   const row=Math.floor((y-12)/17),ry=(y-12)%17,col=Math.floor((x-4)/8),rx=(x-4)%8;
   if(x>=4&&x<60&&ry>=2&&ry<13&&rx>=1&&rx<6){const c=cans[(row*3+col)%cans.length];return [c.map(v=>v+n),c.map(v=>v*.55)];}
   if(ry>=14)return [[70,72,76],[40,40,44]];
   return [[228,234,240],[190,200,212]];
  }
  if(y>=63&&y<69)return x>=4&&x<60&&(x-4)%8<5?[[250,120,60],[220,90,40]]:[body.map(v=>v*.7)];
  if(y>=74&&y<98&&x>=42&&x<58)return y>=77&&y<82&&x>=45&&x<55?[[80,255,120],[50,200,90]]:[[70,72,76].map(v=>v+n)];
  if(y>=104&&y<118&&x>=8&&x<40)return [[18,18,20]];
  if(y>=122)return [[34,34,36]];
  return [body];
 };
 paint(V.front,(x,y,n)=>design(Math.floor(x*64/V.front.w),Math.floor(y*128/V.front.h),n));
 paint(V.side,(x,y,n)=>[white.map(v=>v*(x<2?.7:.9)+n)]);
 paint(V.top,(x,y,n)=>[white.map(v=>v*.8+n)]);
 return {
  color:{name:V.name,width:V.size,height:V.size,rgba,png:png(V.size,V.size,rgba)},
  emissive:{name:V.emissiveName,width:V.size,height:V.size,rgba:glow,png:png(V.size,V.size,glow)}
 };
}

// Box in an edge-local frame (x along the wall, d outward, y up). faces maps
// front/back/left/right/top/bottom to atlas UV rects; null faces are skipped.
// Front and back read left to right from outside so sign text is never mirrored.
export function boxMesh({a,u,n,x0,x1,d0,d1,y0,y1,faces}){
 const mesh={positions:[],normals:[],texcoords:[]},P=(x,y,d)=>[a[0]+u[0]*x+n[0]*d,y,a[1]+u[1]*x+n[1]*d];
 const rightward=u[0]*n[1]-u[1]*n[0]>0,N=[n[0],0,n[1]],U=[u[0],0,u[1]];
 const quad=(corners,normal,uv,flip)=>{
  if(!uv)return;
  const [l,r]=flip?[uv.u1,uv.u0]:[uv.u0,uv.u1],uvs=[[l,uv.v1],[r,uv.v1],[r,uv.v0],[l,uv.v0]],p=corners.map(c=>P(...c));
  const e1=p[1].map((v,i)=>v-p[0][i]),e2=p[2].map((v,i)=>v-p[0][i]);
  const facing=(e1[1]*e2[2]-e1[2]*e2[1])*normal[0]+(e1[2]*e2[0]-e1[0]*e2[2])*normal[1]+(e1[0]*e2[1]-e1[1]*e2[0])*normal[2];
  for(const i of facing>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]){mesh.positions.push(...p[i]);mesh.normals.push(...normal);mesh.texcoords.push(...uvs[i]);}
 };
 quad([[x0,y0,d1],[x1,y0,d1],[x1,y1,d1],[x0,y1,d1]],N,faces.front,!rightward);
 quad([[x0,y0,d0],[x1,y0,d0],[x1,y1,d0],[x0,y1,d0]],N.map(v=>-v),faces.back,rightward);
 quad([[x1,y0,d1],[x1,y0,d0],[x1,y1,d0],[x1,y1,d1]],U,faces.right,false);
 quad([[x0,y0,d0],[x0,y0,d1],[x0,y1,d1],[x0,y1,d0]],U.map(v=>-v),faces.left,false);
 quad([[x0,y1,d1],[x1,y1,d1],[x1,y1,d0],[x0,y1,d0]],[0,1,0],faces.top,false);
 quad([[x0,y0,d0],[x1,y0,d0],[x1,y0,d1],[x0,y0,d1]],[0,-1,0],faces.bottom,false);
 return mesh;
}

const plan=(a,u,n,x0,x1,d0,d1)=>[[x0,d0],[x1,d0],[x1,d1],[x0,d1]].map(([x,d])=>[a[0]+u[0]*x+n[0]*d,a[1]+u[1]*x+n[1]*d]);

// Split AC unit hung below a window sill.
export function acUnit({a,u,n,along,y}){
 const c=propCells;
 return boxMesh({a,u,n,x0:along-.4,x1:along+.4,d0:.02,d1:.3,y0:y,y1:y+.55,faces:{front:c.acFront,left:c.acSide,right:c.acSide,top:c.acSide,bottom:c.metal}});
}

// Vending machine standing against the wall on the pavement.
export const VENDING_WIDTH=1.22;
export function vendingMachine({a,u,n,along,base=0}){
 const c=vendingCells,x0=along-VENDING_WIDTH/2,x1=along+VENDING_WIDTH/2,d0=.06,d1=.8;
 return {mesh:boxMesh({a,u,n,x0,x1,d0,d1,y0:base,y1:base+1.83,faces:{front:c.front,left:c.side,right:c.side,top:c.top}}),footprint:plan(a,u,n,x0,x1,d0,d1)};
}

// Free-standing lightbox column beside a shop door: metal body about 1.2 m tall,
// sign faces front and back at the top so short pictograms still read at eye level.
export function standingSign({a,u,n,along,offset,sign,base=0}){
 const width=.5,faceHeight=Math.min(1.05,(width-.04)/sign.aspect),top=Math.max(1.2,.14+faceHeight),x0=along-width/2,x1=along+width/2,d0=offset,d1=offset+.3;
 const metal=propCells.metal,body=boxMesh({a,u,n,x0,x1,d0:d0+.005,d1:d1-.005,y0:base,y1:base+top+.04,faces:{front:metal,back:metal,left:metal,right:metal,top:metal}});
 const faces=boxMesh({a,u,n,x0:x0+.02,x1:x1-.02,d0,d1,y0:base+top-faceHeight,y1:base+top,faces:{front:sign.uv,back:sign.uv}});
 return {body,faces,footprint:plan(a,u,n,x0,x1,d0,d1),height:base+top+.04};
}

