import {png} from '../png.mjs';
import {polygonsOverlap,strip,distanceToSegment} from '../spatial.mjs';
import {stableSeed} from '../architecture.mjs';
import {placeEdgeSigns} from './edge-signs.mjs';

// Designed building models: two composed studies, the slab on pilotis (A) and the ribbed tower
// (C), fitted to a building's rectangle. Their parts are fixed; only the bay count and the floor
// count follow the footprint, so nothing is random. They replace about half of the plain
// residential buildings that suit them (chosen by building id) and share the city's finishes.
//
// Local frame for both: x along the rectangle's long side, z across it (+z towards the nearest
// road), y up, centred on the rectangle.

// ---------- surfaces ----------
// Material slots of a model, mapped to city materials by createCityMaterials().designed(seed).
export const SLOT={wall:0,cast:1,steel:2,glass:3,lit:4,roof:5,recess:6,display:7,fascia:8,shutter:9};
const SLOTS=10;
const hash=(x,y,k=0)=>((Math.imul(x+71,73856093)^Math.imul(y+83,19349663)^Math.imul(k+9,83492791))>>>0);
// Calm board-formed concrete: faint board joints every 0.75 m and a tone per board, but no
// stains or tie holes that would line up into a visible grid.
export function boardTexture(){
  const s=128,rgba=new Uint8Array(s*s*4);
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){let n=hash(x,y)%9-4;n+=hash(3,Math.floor(y/32))%7-3;n+=hash(Math.floor(x/7),y)%5-2;if(y%32===0)n-=5;rgba.set([150+n,150+n,150+n,255],(y*s+x)*4);}
  return {name:'Designed_board_concrete_128',width:s,height:s,rgba,png:png(s,s,rgba)};
}

// ---------- geometry ----------
const parts=()=>Array.from({length:SLOTS},()=>({positions:[],normals:[],texcoords:[]}));
// Quad wound to face n; planar uvs at 3 m per tile, like the city's modelled parts.
function quad(m,c,n){
  const e1=c[1].map((v,i)=>v-c[0][i]),e2=c[2].map((v,i)=>v-c[0][i]),f=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
  const ax=Math.abs(n[0]),ay=Math.abs(n[1]),az=Math.abs(n[2]);
  for(const i of f[0]*n[0]+f[1]*n[1]+f[2]*n[2]>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]){const p=c[i];m.positions.push(...p);m.normals.push(...n);m.texcoords.push((ax>ay&&ax>az?p[2]:p[0])/3,-(ay>ax&&ay>az?p[2]:p[1])/3);}
}
// Box from a centre, three unit axes and half sizes along them.
function obox(m,c,axes,h){
  const corner=q=>c.map((v,i)=>v+axes[0][i]*q[0]*h[0]+axes[1][i]*q[1]*h[1]+axes[2][i]*q[2]*h[2]);
  for(let k=0;k<3;k++)for(const s of [1,-1]){
    const [i,j]=[[1,2],[0,2],[0,1]][k],at=(u,v)=>{const q=[0,0,0];q[k]=s;q[i]=u;q[j]=v;return corner(q);};
    quad(m,[at(-1,-1),at(1,-1),at(1,1),at(-1,1)],axes[k].map(v=>v*s));
  }
}
const X=[1,0,0],Y=[0,1,0],Z=[0,0,1];
const box=(P,k,[w,h,d],[x,y,z])=>obox(P[k],[x,y,z],[X,Y,Z],[w/2,h/2,d/2]);
// A member from a to b, its width along x.
function beam(P,k,a,b,w,d){
  const v=b.map((q,i)=>q-a[i]),l=Math.hypot(...v),e1=v.map(q=>q/l),e3=[0,-e1[2],e1[1]],n3=Math.hypot(...e3)||1;
  obox(P[k],a.map((q,i)=>(q+b[i])/2),[X,e1,e3.map(q=>q/n3)],[w/2,l/2,d/2]);
}
// Glass with three mullions and a transom, on a wall facing +z (side 1) or -z (side -1).
function window(P,x,y,z,w,h,lit,side){
  box(P,lit?SLOT.lit:SLOT.glass,[w,h,.06],[x,y,z]);
  for(const i of [-1,0,1])box(P,SLOT.steel,[.055,h,.10],[x+i*w/2,y,z+side*.04]);
  box(P,SLOT.steel,[w,.055,.10],[x,y+h*.23,z+side*.04]);
}
// The same on a wall facing +x.
function sideWindow(P,x,y,z,w,h,lit){
  box(P,lit?SLOT.lit:SLOT.glass,[.06,h,w],[x,y,z]);
  for(const i of [-1,0,1])box(P,SLOT.steel,[.10,h,.055],[x+.04,y,z+i*w/2]);
  box(P,SLOT.steel,[.10,.055,w],[x+.04,y+h*.23,z]);
}
function stairs(P,x,z,y,rise,run,width,dir){
  const count=Math.ceil(rise/.18),step=run/count;
  for(let i=0;i<count;i++)box(P,SLOT.cast,[width,.19,step+.015],[x,y+rise*(i+1)/count-.095,z+dir*(i+.5)*step]);
  for(const dx of [-width/2+.12,width/2-.12])beam(P,SLOT.wall,[x+dx,y,z],[x+dx,y+rise,z+dir*run],.22,.25);
  for(const dx of [-width/2+.08,width/2-.08]){beam(P,SLOT.steel,[x+dx,y+1,z],[x+dx,y+rise+1,z+dir*run],.06,.06);for(let i=0;i<=3;i++)box(P,SLOT.steel,[.055,1,.055],[x+dx,y+rise*i/3+.5,z+dir*run*i/3]);}
}

// ---------- A: slab housing on pilotis ----------
export const SLAB={endWall:2.2,stairTower:4.4,bay:3.5,base:4,floor:3.25,minLength:20,minDepth:7,maxDepth:18};
export const slabFloors=height=>Math.max(2,Math.min(12,Math.round((height-4.75)/SLAB.floor)));
// A blank end wall, a body of deep balconies between fins over an open ground storey with a dark
// wall set back behind its piers, and an open switchback stair tower at the other end.
// Returns the parts and the height of its roof.
export function slabA({length:L,depth:D,floors:F,seed=0}){
  const P=parts(),{endWall:E,stairTower:S,base,floor:fh}=SLAB,Lb=L-E-S,n=Math.max(2,Math.round(Lb/SLAB.bay)),bw=Lb/n,x0=-L/2+E,x1=x0+Lb,mid=(x0+x1)/2;
  const Ds=D-1.2,b=Math.min(2.3,Math.max(1.2,Ds*.2)),core=Ds-2*b,top=base+F*fh;
  box(P,SLOT.cast,[L-.4,.45,D],[0,.225,0]);
  const cols=Math.max(2,Math.round(Lb/6));
  for(let k=0;k<cols;k++)for(const s of [-1,1])box(P,SLOT.wall,[1,3.6,1.45],[x0+(k+.5)*Lb/cols,2.25,s*(core/2+.2)]);
  const back=core-1.6;box(P,SLOT.recess,[Lb,3.55,back],[mid,2.225,0]);
  for(const s of [-1,1]){window(P,mid,1.75,s*(back/2+.04),Math.min(4,Lb*.2),2.5,false,s);for(const dx of [-.3,.3])box(P,SLOT.steel,[1.1,2.2,.08],[mid+dx*Lb,1.55,s*(back/2+.04)]);}
  box(P,SLOT.recess,[Lb,top-base,core],[mid,(base+top)/2,0]);
  for(let f=0;f<F;f++){
    const y=base+f*fh;
    box(P,SLOT.wall,[Lb+.6,.5,Ds],[mid+.2,y+.25,0]);box(P,SLOT.recess,[Lb+.58,.02,Ds-.02],[mid+.2,y-.011,0]);
    for(const s of [-1,1]){
      box(P,SLOT.wall,[Lb+.8,.9,.55],[mid+.2,y+.85,s*(Ds/2-.45)]);
      for(let j=0;j<n;j++){
        // Glass 0.3 m back inside a concrete surround: a deep opening.
        const x=x0+(j+.5)*bw,w=bw-.55,h=1.95,cy=y+2.05,face=s*(core/2+.3);
        window(P,x,cy,s*(core/2+.07),w,h,hash(j,f,seed)%9===2,s);
        for(const e of [-1,1])box(P,SLOT.cast,[w+.4,.2,.3],[x,cy+e*(h/2+.1),face-s*.15]);
        for(const e of [-1,1])box(P,SLOT.cast,[.2,h,.3],[x+e*(w/2+.1),cy,face-s*.15]);
        box(P,SLOT.recess,[w,.02,.28],[x,cy+h/2-.011,face-s*.15]);
      }
      for(let j=0;j<=n;j++)box(P,SLOT.cast,[.48,2.75,b-.6],[x0+j*bw,y+1.88,s*(core/2+.1+(b-.6)/2)]);
    }
  }
  box(P,SLOT.wall,[Lb+.6,.75,Ds],[mid+.2,top+.25,0]);box(P,SLOT.recess,[Lb+.58,.02,Ds-.02],[mid+.2,top-.136,0]);box(P,SLOT.roof,[Lb-.6,.08,Ds-1.3],[mid,top+.66,0]);
  box(P,SLOT.wall,[E,top+1.4,Ds-.6],[-L/2+E/2,(.45+top+1.85)/2,0]);box(P,SLOT.cast,[E+.1,.35,Ds-.5],[-L/2+E/2,top+2.03,0]);
  const k=Math.min(1,(Ds-.6)/11.2),tx=x1;
  for(const s of [-1,1])box(P,SLOT.wall,[.6,top+.6,.8],[tx+2,(.45+top+1.05)/2,s*(Ds/2-1.2)]);
  box(P,SLOT.wall,[.45,top+.6,3.5*k],[tx+4,(.45+top+1.05)/2,-3.3*k]);
  for(let f=0;f<=F+1;f++){
    const y=f===0?.5:base+.5+(f-1)*fh,rise=f===0?2:fh/2;
    box(P,SLOT.wall,[4.25,.3,1.6],[tx+2,y-.15,-4.1*k]);
    if(f<=F){stairs(P,tx+1.1,-3.4*k,y,rise,3.5*k,1.5,1);box(P,SLOT.wall,[3.5,.25,1.6],[tx+1.95,y+rise-.125,.9*k]);stairs(P,tx+2.8,.1*k,y+rise,rise,3.5*k,1.5,-1);}
  }
  box(P,SLOT.wall,[4.8,.55,Ds-.6],[tx+2.1,top+.9,0]);
  box(P,SLOT.wall,[Math.min(4.4,Lb*.25),2,Math.min(4,core)],[mid+2,top+1.55,-Math.min(1,core/4)]);
  box(P,SLOT.wall,[1.3,3.25,1.6],[mid-3.8,top+2.15,-Math.min(2.1,core/2-.8)]);
  return {parts:P,roof:top+.625,floorHeight:fh,bays:n};
}

// ---------- C: ribbed tower ----------
export const TOWER={core:3.5,bay:3.7,base:4.5,floor:3.3,minDepth:12,maxLength:32,maxAspect:1.7,minHeight:18};
export const towerFloors=height=>Math.max(4,Math.min(30,Math.round((height-TOWER.base-1.3)/TOWER.floor)));
// A blind service core at -x rising above a heavy crown, full-height ribs with deep windows
// between them, corner piers, and either a glazed lobby under an entrance slab or a row of shops
// under one fascia.
export function towerC({length:L,depth:D,floors:F,seed=0,shops=false}){
  const P=parts(),{core:C,base,floor:fh}=TOWER,top=base+F*fh;
  const xb0=-L/2+C-.3,xb1=L/2,Wb=xb1-xb0,xm=(xb0+xb1)/2,n=Math.max(2,Math.round(Wb/TOWER.bay)),bw=Wb/n;
  const bodyD=D-3,zc=-.25,sides=Math.max(2,Math.round(bodyD/4.3));
  box(P,SLOT.cast,[L,.55,D],[0,.275,0]);
  for(const x of [xb0+1.2,xb1-1.2])for(const s of [-1,1])box(P,SLOT.wall,[1.65,base-.5,1.65],[x,.55+(base-.5)/2,s*(D/2-1.6)]);
  box(P,SLOT.recess,[Wb-2.4,base-.5,bodyD-1],[xm,.55+(base-.5)/2,zc]);
  const front=zc+(bodyD-1)/2;
  if(shops){
    for(let j=0;j<n;j++){const x=xb0+(j+.5)*bw,w=bw-.7;if(x-w/2<xb0+1.2||x+w/2>xb1-1.2)continue;box(P,hash(j,0,seed+3)%3===0?SLOT.shutter:SLOT.display,[w,2.6,.08],[x,1.95,front+.05]);}
    box(P,SLOT.fascia,[Wb-2.2,.7,.3],[xm,base-.95,front+.15]);
    const sd=(bodyD-1)/sides;
    for(let j=0;j<sides;j++)box(P,hash(j,1,seed+3)%3===0?SLOT.shutter:SLOT.display,[.08,2.6,sd-.7],[xb1-1.15,1.95,zc-(bodyD-1)/2+(j+.5)*sd]);
    box(P,SLOT.fascia,[.3,.7,bodyD-1],[xb1-1.05,base-.95,zc]);
  }else{
    const lw=Math.min(3,Wb*.25);window(P,xm,1.8,front+.04,lw,2.5,false,1);box(P,SLOT.steel,[1.1,2.2,.08],[xm+lw/2+1.2,1.65,front+.04]);
    const ew=Math.min(7.7,Wb*.6),ex=xm+1.3;box(P,SLOT.wall,[ew,.75,5.1],[ex,base-.55,D/2+1]);box(P,SLOT.wall,[.8,base-.9,2],[ex+ew/2-.6,(base-.9)/2+.55,D/2+2.6]);
  }
  box(P,SLOT.recess,[Wb-1.9,top-base,bodyD],[xm,(base+top)/2,zc]);
  for(let f=0;f<F;f++){
    const y=base+f*fh;
    box(P,SLOT.wall,[Wb,.7,D-.5],[xm,y+.35,0]);
    for(const s of [-1,1])for(let j=0;j<n;j++)window(P,xb0+(j+.5)*bw,y+1.85,zc+s*(bodyD/2+.07),bw-1.35,2.22,hash(j,f*2+(s>0?0:1),seed)%9===2,s);
    for(let j=0;j<sides;j++)sideWindow(P,xb1-.88,y+1.85,zc-bodyD/2+(j+.5)*bodyD/sides,bodyD/sides-1.6,2.15,hash(j,f,seed+7)%9===2);
  }
  const H=top-base+.75;
  for(let j=0;j<=n;j++)for(const s of [-1,1])box(P,SLOT.cast,[.72,H,1.5],[xb0+j*bw,base+H/2,s*(D/2-.75)]);
  for(let j=0;j<=sides;j++)box(P,SLOT.wall,[1.1,H,.62],[xb1-.55,base+H/2,zc-bodyD/2+j*bodyD/sides]);
  box(P,SLOT.wall,[Wb+.5,1.6,D+.2],[xm,top+.5,0]);box(P,SLOT.roof,[Wb-1.6,.08,D-2.2],[xm,top+1.34,0]);
  box(P,SLOT.wall,[Math.min(5,Wb*.4),2.4,Math.min(4.5,bodyD*.5)],[xm+.9,top+2.5,-1.1]);
  const cz=-1.3,cd=Math.min(D-1,D*.6),ch=top+5;
  for(const x of [-L/2+.78,-L/2+C-.78])box(P,SLOT.wall,[1.55,ch-.55,cd],[x,.55+(ch-.55)/2,cz]);
  box(P,SLOT.steel,[.45,ch-.55,cd-1.15],[-L/2+C/2,.55+(ch-.55)/2,cz-.55]);
  box(P,SLOT.wall,[C+.15,.75,cd+.8],[-L/2+C/2,ch+.37,cz]);
  return {parts:P,roof:top+1.3,floorHeight:fh,bays:n};
}

// ---------- which buildings ----------
// Smallest-area rectangle around a ring: centre c, long axis u, length and depth.
export function rectangle(ring){
  const pts=ring.slice(0,-1);let best;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.5)continue;
    const u=[(b[0]-a[0])/l,(b[1]-a[1])/l],s=pts.map(p=>p[0]*u[0]+p[1]*u[1]),t=pts.map(p=>-p[0]*u[1]+p[1]*u[0]);
    const s0=Math.min(...s),s1=Math.max(...s),t0=Math.min(...t),t1=Math.max(...t),area=(s1-s0)*(t1-t0);
    if(!best||area<best.area){const cs=(s0+s1)/2,ct=(t0+t1)/2,c=[u[0]*cs-u[1]*ct,u[1]*cs+u[0]*ct];best=s1-s0>=t1-t0?{c,u,length:s1-s0,depth:t1-t0,area}:{c,u:[-u[1],u[0]],length:t1-t0,depth:s1-s0,area};}
  }
  return best;
}
const ringArea=r=>Math.abs(r.slice(0,-1).reduce((s,p,i,a)=>{const q=a[(i+1)%a.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
// The rectangle's corners, counter-clockwise from (-x,-z), grown by `grow` metres.
export const rectangleRing=({c,u,length,depth},grow=0)=>{const n=[-u[1],u[0]],L=length/2+grow,D=depth/2+grow;return [[-L,-D],[L,-D],[L,D],[-L,D],[-L,-D]].map(([x,z])=>[c[0]+u[0]*x+n[0]*z,c[1]+u[1]*x+n[1]*z]);};
// Shared lookups for designedChoice: every building footprint and road, as built.
export function designedContext(base){
  const paths=base.objects.filter(o=>o.extras?.path).map(o=>o.extras.path);
  return {
    footprints:base.objects.filter(o=>o.name.startsWith('Building_')&&o.extras.footprint).map(o=>({id:o.extras.sourceId,ring:o.extras.footprint})),
    roads:base.objects.filter(o=>o.extras?.path).flatMap(o=>o.extras.path.slice(1).map((b,i)=>strip(o.extras.path[i],b,o.extras.width))).filter(Boolean),
    segments:paths.flatMap(p=>p.slice(1).map((b,i)=>[p[i],b]))
  };
}
// The model a planned building gets, or null. Plain residential buildings only, at ground
// level, without a courtyard, at least 70% of their rectangle, the rectangle clear of roads. A
// tall, roughly square one becomes tower C, which keeps its shops and may stand against a
// neighbour when the footprint fills 90% of its rectangle; a long one becomes slab A, which must
// stand free and have no shops. Half of them change, by building id.
export function designedChoice(source,building,context){
  const id=source.extras.sourceId,ring=source.extras.footprint;
  if(building.family!=='residential'||building.glass||building.structure||building.base>0||source.extras.outlineId!==undefined||source.extras.holes?.length)return null;
  if(stableSeed(`${id}:designed`)%2)return null;
  const rect=rectangle(ring);if(!rect)return null;
  const fill=ringArea(ring)/rect.area;if(fill<.7)return null;
  const {length:L,depth:D}=rect,h=source.extras.height,shops=Boolean(source.extras.containedShops?.length);
  const style=D>=TOWER.minDepth&&L<=TOWER.maxLength&&L/D<=TOWER.maxAspect&&h>=TOWER.minHeight?'tower-c'
    :!shops&&L>=SLAB.minLength&&D>=SLAB.minDepth&&D<=SLAB.maxDepth?'slab-a':null;
  if(!style)return null;
  const joined=context.footprints.some(f=>f.id!==id&&polygonsOverlap(rectangleRing(rect,1.5),f.ring));
  if(joined&&!(style==='tower-c'&&fill>=.9))return null;
  if(context.roads.some(r=>polygonsOverlap(rectangleRing(rect),r)))return null;
  // The blind end (the tower's service core, the slab's end wall) goes to the end farther from
  // any road; the front (+z) faces the nearest road, mirroring the model when needed.
  const toRoad=p=>Math.min(Infinity,...context.segments.map(([a,b])=>distanceToSegment(p,a,b)));
  const end=s=>[rect.c[0]+rect.u[0]*s*L/2,rect.c[1]+rect.u[1]*s*L/2];
  if(toRoad(end(-1))<toRoad(end(1)))rect.u=[-rect.u[0],-rect.u[1]];
  const n=[-rect.u[1],rect.u[0]],side=s=>[rect.c[0]+n[0]*s*D/2,rect.c[1]+n[1]*s*D/2];
  return {style,rect,mirror:toRoad(side(-1))<toRoad(side(1)),shops,joined,floors:style==='tower-c'?towerFloors(h):slabFloors(h)};
}

// ---------- building it ----------
// Emits the model as scene objects, then hangs the usual street signs, billboards and rooftop
// letters on the rectangle's edges, at the model's own bay joints. Sign housings go to out.
export function buildDesigned(city,building,out){
  const {scene,materials,street}=city,{source,seed,designed}=building,{style,rect,floors,shops}=designed;
  const model=(style==='tower-c'?towerC:slabA)({length:rect.length,depth:rect.depth,floors,seed,shops});
  // Mirrored models flip local z, and each triangle's winding with it.
  const mats=materials.designed(seed),{c,u}=rect,n=designed.mirror?[u[1],-u[0]]:[-u[1],u[0]];
  const extras={...source.extras,sceneModule:'Buildings',designedModel:style};
  model.parts.forEach((m,k)=>{
    if(!m.positions.length)return;
    const positions=[],normals=[];
    for(let i=0;i<m.positions.length;i+=3){const [x,y,z]=m.positions.slice(i,i+3),[a,b,d]=m.normals.slice(i,i+3);positions.push(c[0]+u[0]*x+n[0]*z,y,c[1]+u[1]*x+n[1]*z);normals.push(u[0]*a+n[0]*d,b,u[1]*a+n[1]*d);}
    const texcoords=[...m.texcoords];
    if(designed.mirror)for(let t=0;t<positions.length/3;t+=3)for(const [arr,w] of [[positions,3],[normals,3],[texcoords,2]])for(let k2=0;k2<w;k2++){const i1=(t+1)*w+k2,i2=(t+2)*w+k2;[arr[i1],arr[i2]]=[arr[i2],arr[i1]];}
    scene.objects.push({name:`${source.name}_Designed_${k}`,positions,normals,texcoords,material:mats[k],extras});
  });
  // Signs: the rectangle stands in for the footprint, the model's floors and roof for the plan's.
  const ring=rectangleRing(designed.mirror?{...rect,u:[-u[0],-u[1]]}:rect),signed={...building,ring,holes:[],height:model.roof,floors:style==='tower-c'?floors:floors+1,floorHeight:model.floorHeight,retail:false,mixedShop:shops,front:2};
  for(let edge=0;edge<4;edge++){
    const a=ring[edge],b=ring[edge+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),eu=[(b[0]-a[0])/len,(b[1]-a[1])/len],en=[eu[1],-eu[0]];
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],facing=street.roads.some(([p,q])=>{const d=distanceToSegment(mid,p,q);if(d>25)return false;const t=[q[0]-p[0],q[1]-p[1]],l2=t[0]*t[0]+t[1]*t[1]||1,s=Math.max(0,Math.min(1,((mid[0]-p[0])*t[0]+(mid[1]-p[1])*t[1])/l2));return (p[0]+t[0]*s-mid[0])*en[0]+(p[1]+t[1]*s-mid[1])*en[1]>.1;});
    const bays=edge%2===0?model.bays:Math.max(2,Math.round(len/4.3));
    placeEdgeSigns(city,signed,{edge,a,b,u:eu,n:en,len,bays,bw:len/bays,isStreet:facing,open:()=>true},out);
  }
}
