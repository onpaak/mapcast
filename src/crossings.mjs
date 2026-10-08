import {distanceToSegment,insidePolygon,strip} from './spatial.mjs';

// Zebra crossings painted where OpenStreetMap maps a marked crossing on a road. Nothing is
// inferred: a crossing node must say it is marked, and it must lie on a carriageway.
// The paint is white bars running with the traffic, 0.5 m wide every 1 m across the whole
// carriageway, 3 m deep.
export const CROSSING_DEPTH=3,BAR=.5,PITCH=1,PAINT_Y=.04;

// True when the tags describe a crossing with painted markings.
export function crossingMarked(tags={}){
  if(tags.highway!=='crossing'&&!tags.crossing&&tags.railway!=='crossing')return false;
  if(tags.railway==='crossing'||tags.railway==='level_crossing')return false;
  const markings=String(tags['crossing:markings']??'');
  if(markings)return markings!=='no';
  return ['zebra','marked','uncontrolled','traffic_signals'].includes(String(tags.crossing))||tags.crossing_ref==='zebra';
}
export function isCrossingNode(tags={}){return tags.highway==='crossing'||Boolean(tags.crossing)&&!tags.railway;}

// points: [{id, point, tags}] in scene metres. segments: road segments {a, b, width, road}.
// Returns one object holding every crossing's bars, and a record per crossing.
export function zebraCrossings(points,segments,material){
  const positions=[],normals=[],records=[],placed=[];
  const strips=segments.map(s=>({s,ring:strip(s.a,s.b,s.width)})).filter(x=>x.ring);
  for(const {id,point,tags} of points){
    if(!crossingMarked(tags)){records.push({sourceId:id,status:'skipped',reason:'not marked as painted'});continue;}
    // The road it lies on: the nearest centre line, within half a metre.
    let best;for(const s of segments){const d=distanceToSegment(point,s.a,s.b);if(d<.5&&(!best||d<best.d))best={s,d};}
    if(!best){records.push({sourceId:id,status:'skipped',reason:'not on a generated carriageway'});continue;}
    const {s}=best,L=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),u=[(s.b[0]-s.a[0])/L,(s.b[1]-s.a[1])/L],n=[-u[1],u[0]];
    const t0=(point[0]-s.a[0])*u[0]+(point[1]-s.a[1])*u[1],half=s.width/2-.3;
    if(half<1){records.push({sourceId:id,status:'skipped',reason:'carriageway too narrow'});continue;}
    // The band must stay off any other road's carriageway (the junction itself): slide it up to
    // 3 m along the road, away from the junction, and give up beyond that.
    const band=t=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[s.a[0]+u[0]*(t+i*CROSSING_DEPTH/2)+n[0]*j*half,s.a[1]+u[1]*(t+i*CROSSING_DEPTH/2)+n[1]*j*half]);
    const clear=t=>band(t).every(p=>!strips.some(x=>x.s.road!==s.road&&insidePolygon(p,x.ring)));
    const t=[0,.5,-.5,1,-1,1.5,-1.5,2,-2,2.5,-2.5,3,-3].map(d=>t0+d).find(clear);
    if(t===undefined){records.push({sourceId:id,status:'skipped',reason:'falls inside a junction'});continue;}
    if(placed.some(p=>p.road===s.road&&Math.abs(p.t-t)<CROSSING_DEPTH+.5&&Math.abs(p.base-s.a[0])<1e-6)){records.push({sourceId:id,status:'skipped',reason:'duplicate of a nearby crossing'});continue;}
    placed.push({road:s.road,t,base:s.a[0]});
    const count=Math.max(1,Math.floor((2*half+PITCH-BAR)/PITCH)),start=-((count-1)*PITCH)/2;
    for(let k=0;k<count;k++){
      const o=start+k*PITCH,c=(along,across)=>[s.a[0]+u[0]*(t+along)+n[0]*(o+across),PAINT_Y,s.a[1]+u[1]*(t+along)+n[1]*(o+across)];
      const q=[c(-CROSSING_DEPTH/2,-BAR/2),c(CROSSING_DEPTH/2,-BAR/2),c(CROSSING_DEPTH/2,BAR/2),c(-CROSSING_DEPTH/2,BAR/2)];
      // Face up whichever way the corners wind.
      const up=(q[1][2]-q[0][2])*(q[2][0]-q[0][0])-(q[1][0]-q[0][0])*(q[2][2]-q[0][2])>0;
      for(const i of up?[0,1,2,0,2,3]:[0,2,1,0,3,2]){positions.push(...q[i]);normals.push(0,1,0);}
    }
    records.push({sourceId:id,status:'generated',road:s.road,bars:count,center:[s.a[0]+u[0]*t,s.a[1]+u[1]*t],radius:Math.max(CROSSING_DEPTH/2,half)});
  }
  const generated=records.filter(r=>r.status==='generated');
  const objects=positions.length?[{name:'ZebraCrossings',positions,normals,material,extras:{kind:'mapped-zebra-crossings',sourceIds:generated.map(r=>r.sourceId),sceneModule:'Roads'}}]:[];
  return {objects,records};
}
