import {png} from './png.mjs';
import {glyph} from './pixel-glyphs.mjs';
import {distanceToSegment,polygonsOverlap} from './spatial.mjs';
import {placeLamp} from './street-lamp.mjs';
import {canopyObstacles} from './shop-canopy.mjs';
import {PAVEMENT_TOP} from './ps2.mjs';

// Bus stops where OpenStreetMap maps them (highway=bus_stop, or a bus platform node), and
// nowhere else. Each gets a glass shelter on the pavement at the kerb, or only the stop's flag
// pole where the pavement has no room for a shelter or the map says shelter=no.
// Built in a local frame: x along the kerb, y up, z away from the road, with z = 0 at the
// shelter's front edge. Placed like the street lamps, by translation and a yaw about y, so
// every stop shares one mesh per part.

export const isBusStopNode=(tags={})=>tags.highway==='bus_stop'||tags.public_transport==='platform'&&tags.bus==='yes';

export const BUS_SHELTER={length:4,depth:1.3,height:2.4};
// A mapped stop snaps to the nearest road within REACH, standing KERB_GAP back from its edge.
// Stops mapped within MERGE of one already placed on the same side are the same stop mapped
// twice (a stop and its platform); a stop may slide up to 6 m along the kerb to find room.
const REACH=25,KERB_GAP=.3,MERGE=18,SHIFTS=[0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6];

const mesh=()=>({positions:[],normals:[],texcoords:[]});
// A quad from four corners in order round the face, wound to face `normal`, with uvs per corner.
function quad(m,c,normal,uv=[[0,0],[1,0],[1,1],[0,1]]){
  const e1=c[1].map((v,i)=>v-c[0][i]),e2=c[2].map((v,i)=>v-c[0][i]),n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
  const order=n[0]*normal[0]+n[1]*normal[1]+n[2]*normal[2]>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
  for(const i of order){m.positions.push(...c[i]);m.normals.push(...normal);m.texcoords.push(...uv[i]);}
}
// Box with planar uvs at `scale` metres per tile.
function box(m,[x0,y0,z0],[x1,y1,z1],scale=1){
  const u=(a,b)=>[a/scale,b/scale];
  quad(m,[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],[0,0,-1],[u(x0,y0),u(x1,y0),u(x1,y1),u(x0,y1)]);
  quad(m,[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1],[u(x0,y0),u(x1,y0),u(x1,y1),u(x0,y1)]);
  quad(m,[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0],[u(z0,y0),u(z1,y0),u(z1,y1),u(z0,y1)]);
  quad(m,[[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],[1,0,0],[u(z0,y0),u(z1,y0),u(z1,y1),u(z0,y1)]);
  quad(m,[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],[0,1,0],[u(x0,z0),u(x1,z0),u(x1,z1),u(x0,z1)]);
  quad(m,[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0],[u(x0,z0),u(x1,z0),u(x1,z1),u(x0,z1)]);
}
// Poster cell i of the 128×192 window poster atlas (four 64×96 posters), as corner uvs for a
// quad listed bottom-left, bottom-right, top-right, top-left; flip mirrors it for the far face.
const posterUV=(i,flip=false)=>{const x0=(i%2*64+.5)/128,x1=(i%2*64+63.5)/128,y0=(Math.floor(i/2)*96+.5)/192,y1=(Math.floor(i/2)*96+95.5)/192;return flip?[[x1,y1],[x0,y1],[x0,y0],[x1,y0]]:[[x0,y1],[x1,y1],[x1,y0],[x0,y0]];};
export const BUS_STOP_POSTERS=4;

// The stop flag: dark blue plate, white rim, a bus pictogram and BUS. No route numbers or names.
export function busStopFlagTexture(){
  const S=64,rgba=new Uint8Array(S*S*4),set=(x,y,c)=>rgba.set([...c,255],(y*S+x)*4);
  const blue=[30,62,128],white=[232,236,240];
  for(let y=0;y<S;y++)for(let x=0;x<S;x++)set(x,y,x<3||x>60||y<3||y>60?white:blue);
  // Bus side view, 40×22 pixels: body, window band, door and wheels.
  for(let y=0;y<22;y++)for(let x=0;x<40;x++){
    const X=12+x,Y=8+y,body=y<17&&(x>0&&x<39||y>0),win=y>=3&&y<=8&&x>=3&&x<=36&&(x-3)%7<5,door=x>=31&&x<=35&&y>=10&&y<=16,wheel=y>=15&&(Math.hypot(x-9,y-17)<4||Math.hypot(x-31,y-17)<4);
    if(wheel)set(X,Y,[20,24,30]);else if(body)set(X,Y,win||door?blue:white);
  }
  [...'BUS'].forEach((ch,i)=>glyph(ch).forEach((row,y)=>row.forEach((v,x)=>{if(v)for(let d=0;d<4;d++)set(15+i*12+x*2+(d&1),40+y*2+(d>>1),white);})));
  return {name:'BusStop_flag_64',width:S,height:S,rgba,png:png(S,S,rgba)};
}
// Timetable: a lit white panel under a blue header, with grey rows.
export function busStopTimetableTexture(){
  const W=32,H=64,rgba=new Uint8Array(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const row=y>6&&y<60&&x>3&&x<28&&y%5<2&&(x<14||y%10<2),c=y<6?[30,62,128]:row?[120,124,130]:[228,230,224];rgba.set([...c,255],(y*W+x)*4);}
  return {name:'BusStop_timetable_32x64',width:W,height:H,rgba,png:png(W,H,rgba)};
}

const parts=()=>({steel:mesh(),glass:mesh(),roof:mesh(),strip:mesh(),ad:mesh(),flag:mesh(),table:mesh()});
// The flag pole at x: the sign faces along the kerb both ways, a lit timetable below it.
function flagPole(P,x){
  const both=s=>s>0?[[1,1],[0,1],[0,0],[1,0]]:[[0,1],[1,1],[1,0],[0,0]];
  box(P.steel,[x-.035,0,.25],[x+.035,2.95,.32]);
  for(const s of [1,-1])quad(P.flag,[[x+s*.04,2.25,.06],[x+s*.04,2.25,.51],[x+s*.04,2.85,.51],[x+s*.04,2.85,.06]],[s,0,0],both(s));
  box(P.steel,[x-.045,1.15,.19],[x+.045,1.65,.38]);
  for(const s of [1,-1])quad(P.table,[[x+s*.047,1.2,.21],[x+s*.047,1.2,.36],[x+s*.047,1.6,.36],[x+s*.047,1.6,.21]],[s,0,0],both(s));
}
// Glass shelter: three rear posts, a thin roof with a light strip under its front edge, a
// glass back, a double-sided lightbox ad (poster cell `poster`) at one end and the flag pole
// beyond the other.
export function busShelterParts(poster=0){
  const P=parts(),L=BUS_SHELTER.length/2,D=BUS_SHELTER.depth,H=BUS_SHELTER.height;
  for(const x of [-L+.06,0,L-.06])box(P.steel,[x-.04,0,D-.12],[x+.04,H,D-.04]);
  box(P.roof,[-L-.05,H,-.08],[L+.05,H+.1,D+.04],2);
  box(P.steel,[-L-.05,H-.04,-.08],[L+.05,H,-.02]);
  quad(P.strip,[[-L+.1,H-.041,-.06],[L-.1,H-.041,-.06],[L-.1,H-.041,.06],[-L+.1,H-.041,.06]],[0,-1,0]);
  for(const [a,b] of [[-L+.1,-.04],[.04,L-.1]]){
    quad(P.glass,[[a,.12,D-.08],[b,.12,D-.08],[b,H-.05,D-.08],[a,H-.05,D-.08]],[0,0,-1]);
    box(P.steel,[a,.08,D-.1],[b,.14,D-.06]);box(P.steel,[a,H-.08,D-.1],[b,H-.04,D-.06]);
  }
  const x=L-.06;box(P.steel,[x-.08,.18,.06],[x+.08,2.08,D-.12]);
  quad(P.ad,[[x-.081,.28,.14],[x-.081,.28,D-.2],[x-.081,1.98,D-.2],[x-.081,1.98,.14]],[-1,0,0],posterUV(poster));
  quad(P.ad,[[x+.081,.28,.14],[x+.081,.28,D-.2],[x+.081,1.98,D-.2],[x+.081,1.98,.14]],[1,0,0],posterUV(poster,true));
  flagPole(P,-L-.6);
  return P;
}
export function busStopPoleParts(){const P=parts();flagPole(P,0);return P;}
// Local plan footprint of each kind: [x0, x1, z0, z1].
const FOOTPRINT={shelter:[-BUS_SHELTER.length/2-.7,BUS_SHELTER.length/2+.06,0,BUS_SHELTER.depth],pole:[-.2,.2,.15,.55]};
// Plan ring of a stop at o whose back points along unit b (local +x is b turned clockwise).
export function busStopFootprint(kind,o,b){
  const u=[b[1],-b[0]],[x0,x1,z0,z1]=FOOTPRINT[kind];
  return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>[o[0]+u[0]*x+b[0]*z,o[1]+u[1]*x+b[1]*z]);
}

const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const clearOf=(blocks,ring)=>{const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];return !blocks.some(o=>o.bounds[0]<=box[2]&&o.bounds[2]>=box[0]&&o.bounds[1]<=box[3]&&o.bounds[3]>=box[1]&&polygonsOverlap(ring,o.ring));};

// sources: [{id, point, tags}] in scene metres. roads: [{path, width}]. street: the concrete
// city's street context (pavement, roads, buildings and props already placed). obstacles: plan
// rings of lamp and signal poles. materials: {steel, glass, roof, strip, ad, flag, table}.
// Returns scene objects (one per part per stop, instanced) and one record per mapped stop.
export function placeBusStops(sources,{street,roads,obstacles=[],materials}){
  const segments=roads.flatMap(r=>r.path.slice(1).map((b,i)=>({a:r.path[i],b,width:r.width})));
  const objects=[],records=[],placed=[],pole=busStopPoleParts(),shelters=new Map();
  const shelterParts=poster=>{if(!shelters.has(poster))shelters.set(poster,busShelterParts(poster));return shelters.get(poster);};
  for(const {id,point:p,tags} of sources){
    const skip=reason=>records.push({sourceId:id,status:'skipped',reason});
    if(tags.indoor==='yes'||tags.location==='underground'||Number(tags.level??0)!==0){skip('indoor or not at ground level');continue;}
    let best;for(const s of segments){const d=distanceToSegment(p,s.a,s.b);if(d<=REACH&&(!best||d<best.d))best={s,d};}
    if(!best){skip(`no generated road within ${REACH} m`);continue;}
    const {s}=best,len=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);if(len<.5){skip('no road direction to stand along');continue;}
    const u=[(s.b[0]-s.a[0])/len,(s.b[1]-s.a[1])/len],n=[-u[1],u[0]],t=(p[0]-s.a[0])*u[0]+(p[1]-s.a[1])*u[1],off=(p[0]-s.a[0])*n[0]+(p[1]-s.a[1])*n[1];
    // The side of the road the stop is mapped on; both when it sits on the carriageway.
    const sides=Math.abs(off)>s.width/2?[Math.sign(off)]:[1,-1];
    const twin=side=>placed.find(q=>Math.hypot(q.mapped[0]-p[0],q.mapped[1]-p[1])<MERGE&&q.back[0]*n[0]*side+q.back[1]*n[1]*side>.5);
    const free=sides.filter(side=>!twin(side));
    if(!free.length){records.push({sourceId:id,status:'merged',with:twin(sides[0]).sourceId});continue;}
    const kinds=tags.shelter==='no'?['pole']:['shelter','pole'];let spot;
    search:for(const kind of kinds)for(const side of free)for(const d of SHIFTS){
      const o=[s.a[0]+u[0]*(t+d)+n[0]*side*(s.width/2+KERB_GAP),s.a[1]+u[1]*(t+d)+n[1]*side*(s.width/2+KERB_GAP)],back=[n[0]*side,n[1]*side],ring=busStopFootprint(kind,o,back);
      if(street.baseAt(ring)!==PAVEMENT_TOP||!street.fits(ring)||!clearOf(street.canopyBlocks,ring)||obstacles.some(r=>polygonsOverlap(ring,r)))continue;
      spot={kind,o,back,shift:d,ring};break search;
    }
    if(!spot){skip('no room on the pavement beside the road');continue;}
    street.propBlocks.push(...canopyObstacles([spot.ring]));
    const poster=hash(id)%BUS_STOP_POSTERS,P=spot.kind==='shelter'?shelterParts(poster):pole;
    const origin=[spot.o[0],PAVEMENT_TOP,spot.o[1]],yaw=Math.atan2(spot.back[0],spot.back[1]),index=placed.length;
    for(const [part,m] of Object.entries(P)){
      if(!m.positions.length)continue;
      const assetKey=spot.kind==='shelter'?(part==='ad'?`bus-shelter-ad-${poster}`:`bus-shelter-${part}`):`bus-stop-pole-${part}`;
      objects.push({name:`BusStop_${index}_${part}`,...placeLamp(m,origin,yaw),texcoords:[...m.texcoords],material:materials[part],extras:{assetKey,instanceOrigin:origin,instanceYaw:yaw,sourceId:id,busStop:spot.kind,sceneModule:'StreetProps'}});
    }
    placed.push({sourceId:id,mapped:p,back:spot.back});
    records.push({sourceId:id,status:'generated',kind:spot.kind,position:spot.o,shift:spot.shift,...(tags.shelter==='no'?{kindSource:'OSM shelter=no'}:spot.kind==='pole'?{kindSource:'no room for a shelter'}:{})});
  }
  return {objects,records};
}
