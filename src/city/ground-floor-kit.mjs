import {stableSeed} from '../architecture.mjs';
import {BIN} from './materials.mjs';

// Ground-floor kit: roller shutters, a steel service door, louvred vents and a wall-mounted
// meter cabinet, fitted into the openings of modelled ground-floor bays. Walls, reveals and
// their finish stay the building's own; the kit only adds what sits inside an opening.
// Coordinates are edge-local as in edgeGeometry: x along the edge, y up, d outward
// (negative is into the wall). Parts keep their physical size: a shutter adds slats to fill
// its opening, while doors, vents and cabinets never stretch.

export const SLAT_PITCH=.077;
export const DOOR={width:.98,height:2.08};
export const VENT={width:1.1,height:.63};
export const CABINET={width:.76,height:.98,depth:.234,bottom:.89};
const RAIL=.064;

// Curtain walls and towers (plainFacade), offices and raised sections keep their ground floors.
export const kitAllowed=building=>!building.plainFacade&&!building.office&&!building.elevated;

// World normal for an edge-local direction (ny up, nd outward).
const normal=(n,ny,nd)=>{const l=Math.hypot(ny,nd);return [n[0]*nd/l,ny/l,n[1]*nd/l];};

// Wall panels of one bay around rectangular openings, split at baseTop into base and wall
// finish like the plain modelled bays. holes: [{l,r,bottom,top}].
export function wallAround({panel},{left,right,y,top,baseTop},holes){
  const xs=[...new Set([left,right,...holes.flatMap(h=>[h.l,h.r])])].sort((a,b)=>a-b);
  const ys=[...new Set([y,top,...(baseTop>y&&baseTop<top?[baseTop]:[]),...holes.flatMap(h=>[h.bottom,h.top])])].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const x=(xs[i-1]+xs[i])/2,yy=(ys[j-1]+ys[j])/2;
    if(holes.some(h=>x>h.l&&x<h.r&&yy>h.bottom&&yy<h.top))continue;
    panel(xs[i-1],xs[i],ys[j-1],ys[j],0,ys[j]<=baseTop+1e-6?BIN.base:BIN.wall);
  }
}

// Roller shutter in the opening l..r, bottom..head. curtain is the curtain's lower edge
// (bottom when closed). A 'surface' housing projects above the head, for loading doors; a
// 'concealed' one sits in the wall and shows only a lip, leaving room for fascia and canopy.
// Each slat is a real folded profile; slat ends run into the side tracks.
export function rollerShutter({box,quad},n,{l,r,bottom,head,curtain=bottom,housing='concealed'}){
  const closed=curtain<=bottom+1e-6,top=housing==='concealed'?head-.06:head,cl=l+.035,cr=r-.035;
  box(l,l+RAIL,bottom,head,.03,-.1,BIN.zinc);box(r-RAIL,r,bottom,head,.03,-.1,BIN.zinc);
  // Dark backing closes the few millimetres between slats.
  quad([[cl,curtain,-.03],[cr,curtain,-.03],[cr,top,-.03],[cl,top,-.03]],normal(n,0,1),BIN.recess);
  const count=Math.max(1,Math.ceil((top-curtain)/SLAT_PITCH)),pitch=(top-curtain)/count;
  for(let i=0;i<count;i++){
    const y0=curtain+i*pitch,h=pitch-.004;
    // Front of the fold: lower bevel, flat face, upper bevel, as (y, d) points.
    const profile=[[y0,-.017],[y0+.014,0],[y0+h-.014,-.004],[y0+h,-.019]];
    for(let k=1;k<profile.length;k++){
      const [ya,da]=profile[k-1],[yb,db]=profile[k],dy=yb-ya,dd=db-da;
      quad([[cl,ya,da],[cr,ya,da],[cr,yb,db],[cl,yb,db]],normal(n,-dd,dy),i<2?BIN.zinc:BIN.shutter);
    }
  }
  box(cl,cr,curtain,curtain+.042,.008,-.03,BIN.zinc);
  // A closed curtain is locked to the floor.
  if(closed)box((l+r)/2-.022,(l+r)/2+.022,bottom+.056,bottom+.104,.008,0,BIN.metal);
  if(housing==='concealed')box(l,r,head-.06,head,.02,-.12,BIN.zinc);
  else{
    box(l-.12,r+.12,head,head+.268,.167,-.02,BIN.shutter);
    box(l-.14,r+.14,head+.268,head+.296,.19,-.02,BIN.zinc);
  }
}

// Steel service door in the opening l..l+DOOR.width from bottom; the caller cuts the opening
// and its reveal. Frame proud of the wall, recessed leaf, kick plate and a handle. The leaf,
// plate and rebate are single faces: their edges sit inside the frame.
export function serviceDoor({box,panel},{l,bottom}){
  const r=l+DOOR.width,top=bottom+DOOR.height;
  panel(l,r,bottom,top,-.09,BIN.recess);
  box(l,l+.034,bottom,top,.027,-.083,BIN.zinc);box(r-.034,r,bottom,top,.027,-.083,BIN.zinc);
  box(l+.034,r-.034,top-.034,top,.027,-.083,BIN.zinc);
  panel(l+.052,r-.052,bottom+.046,top-.046,-.047,BIN.serviceDoor);
  panel(l+.068,r-.068,bottom+.044,bottom+.249,-.04,BIN.zinc);
  const x=r-.13;box(x-.013,x+.013,bottom+.992,bottom+1.067,-.024,-.047,BIN.metal);
}

// Louvred vent filling the opening l..r, bottom..top: frame band, dark back and slanted
// blades whose front edge sits lower, as in the reviewed study.
export function louvredVent({panel,quad},n,{l,r,bottom,top}){
  const f=.036;
  panel(l,r,bottom,top,-.06,BIN.recess);
  panel(l,l+f,bottom,top,-.005,BIN.zinc);panel(r-f,r,bottom,top,-.005,BIN.zinc);
  panel(l+f,r-f,bottom,bottom+f,-.005,BIN.zinc);panel(l+f,r-f,top-f,top,-.005,BIN.zinc);
  const count=Math.max(3,Math.floor((top-bottom-2*f)/.1)),pitch=(top-bottom-2*f)/count;
  for(let i=0;i<count;i++){
    const yc=bottom+f+(i+.5)*pitch,front=[yc-.022,-.01],back=[yc+.022,-.055];
    quad([[l+f,front[0],front[1]],[r-f,front[0],front[1]],[r-f,back[0],back[1]],[l+f,back[0],back[1]]],normal(n,front[1]-back[1],back[0]-front[0]),BIN.zinc);
  }
}

// Wall-mounted meter cabinet centred on x, bottom at y: enamel casing with a top cap, a door
// in a dark shadow gap, lock plate, vent grille and a small lit indicator, the details as
// single faces. It projects CABINET.depth.
export function meterCabinet({box,panel},{x,y}){
  box(x-.37,x+.37,y,y+.946,.17,0,BIN.enamel);
  box(x-.385,x+.385,y+.946,y+.98,.234,0,BIN.zinc);
  panel(x-.34,x+.34,y+.029,y+.928,.18,BIN.recess);
  panel(x-.325,x+.325,y+.042,y+.914,.19,BIN.serviceDoor);
  panel(x-.255,x+.115,y+.13,y+.27,.195,BIN.recess);
  panel(x+.246,x+.272,y+.443,y+.518,.195,BIN.metal);
  panel(x+.196,x+.223,y+.784,y+.793,.195,BIN.indicator);
}

// Shutter state for a shop display window or loading door, or null for an open shopfront.
// Display windows with a poster keep their glass. Vacant shops are shuttered.
export function shutterState(building,{edge,col,loading,poster}){
  const s=stableSeed(`${building.id}:shutter:${edge}:${col}`)%100;
  if(loading)return s<30?'raised':'closed';
  if(poster)return null;
  if(building.vacant)return 'closed';
  return s<12?'raised':s<25?'closed':null;
}

// Kit piece for a plain modelled ground-floor bay, or null: about 5% service doors, 10%
// cellar vents and 8% meter cabinets. Checked against the opening: a door needs width and
// headroom, a cellar vent room under the sill, a cabinet a pier.
export function bayKit(building,edgeInfo,bay,{l,r,bottom}){
  const {edge,bw,door}=edgeInfo,{col,left,right,y,top,cellKey}=bay,s=stableSeed(cellKey+':kit')%100;
  if(s<5&&bw>=DOOR.width+.5&&top-y>=DOOR.height+.3&&!(edge===building.front&&Math.abs(col-door)<=1)){
    const l=(left+right-DOOR.width)/2,transom=top-y-DOOR.height>=.85;
    return {kind:'service-door',door:{l,r:l+DOOR.width,bottom:y,top:y+DOOR.height},vent:transom?{l,r:l+DOOR.width,bottom:y+DOOR.height+.12,top:Math.min(y+DOOR.height+.12+VENT.height,top-.2)}:null};
  }
  if(s>=5&&s<15){
    const width=Math.min(VENT.width,r-l-.1),vb=y+.25,vt=Math.min(vb+VENT.height,bottom-.15);
    if(width>=.6&&vt-vb>=.3)return {kind:'cellar-vent',vent:{l:(l+r-width)/2,r:(l+r+width)/2,bottom:vb,top:vt}};
  }
  if(s>=15&&s<23&&y+CABINET.bottom+CABINET.height<=top-.2){
    // Clear of the window by 22 cm and of the bay edge by 6 cm.
    const side=stableSeed(cellKey+':cabinet')%2,pier=side?right-r:l-left,half=CABINET.width/2;
    if(pier>=CABINET.width+.28)return {kind:'meter-cabinet',cabinet:{x:side?r+.22+half:l-.22-half,y:y+CABINET.bottom}};
  }
  return null;
}
