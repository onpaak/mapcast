import {distanceToSegment,insidePolygon} from './spatial.mjs';

// Traffic signal poles where OpenStreetMap maps highway=traffic_signals on a road. One pole stands
// at the far side of every road leaving the signal node, just outside the junction, its head
// facing back across the junction at the traffic coming from the opposite road, on that
// traffic's kerb side. Nothing is inferred where the map has no
// signal. Built like the street lamps: one local mesh per part, placed by translation and yaw,
// with local +x the direction the head faces.

// Places that drive on the left, as [west, south, east, north] boxes. Coarse on purpose: a pole
// on the wrong kerb is a small error, and everywhere else drives on the right.
const LEFT_HAND=[[113.8,22.1,114.5,22.6],[113.5,22.1,113.6,22.25],[122.9,24,146,45.6],[-10.7,49.8,1.8,60.9],[112.9,-44,154,-10],[166,-47.5,179,-34],[103.6,1.1,104.1,1.5],[99.6,.8,119.3,7.4],[97.3,5.6,105.7,20.5],[68,6.5,89.5,35.5],[95,-11,141,6],[16.4,-35,33,-22]];
export const drivesOnLeft=([lon,lat])=>LEFT_HAND.some(([w,s,e,n])=>lon>=w&&lon<=e&&lat>=s&&lat<=n);

function box(mesh,[x0,y0,z0],[x1,y1,z1]){
  const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  for(const [f,n] of [[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]],[[3,7,6,2],[0,1,0]],[[0,1,5,4],[0,-1,0]]])
    for(const i of [0,1,2,0,2,3]){mesh.positions.push(...v[f[i]]);mesh.normals.push(...n);}
}
// A lens face on the front of the head, wound to face +x.
function lens(mesh,y){const h=.09,x=.191;for(const p of [[x,y-h,-h],[x,y+h,h],[x,y-h,h],[x,y-h,-h],[x,y+h,-h],[x,y+h,h]]){mesh.positions.push(...p);mesh.normals.push(1,0,0);}}
export const SIGNAL_HEIGHTS={red:3.3,amber:3.05,green:2.8};
export function signalMeshes(){
  const body={positions:[],normals:[]},red={positions:[],normals:[]},amber={positions:[],normals:[]},green={positions:[],normals:[]};
  box(body,[-.13,0,-.13],[.13,.18,.13]);                     // foot
  box(body,[-.06,.18,-.06],[.06,3.55,.06]);                  // pole
  box(body,[-.03,2.6,-.17],[.19,3.5,.17]);                   // head housing
  box(body,[-.05,2.52,-.26],[-.03,3.58,.26]);                // backplate
  lens(red,SIGNAL_HEIGHTS.red);lens(amber,SIGNAL_HEIGHTS.amber);lens(green,SIGNAL_HEIGHTS.green);
  return {body,red,amber,green};
}

// points: [{id, point, tags}]. segments: road segments {a, b, width, road}. onPavement(p) and
// inBuilding(p) test plan points; origin is [lon, lat] for the driving side.
// Returns the poles {position:[x,z], yaw, red:boolean, sourceId} and one record per signal.
export function placeSignals(points,segments,{onPavement,inBuilding,origin}){
  const poles=[],records=[],left=drivesOnLeft(origin);
  const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
  for(const {id,point} of points){
    const incident=segments.filter(s=>distanceToSegment(point,s.a,s.b)<.6);
    if(!incident.length){records.push({sourceId:id,status:'skipped',reason:'not on a generated carriageway'});continue;}
    // Approaches: each direction a road leaves the signal node in.
    const arms=[];
    for(const s of incident){
      const L=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);if(L<.5)continue;const u=[(s.b[0]-s.a[0])/L,(s.b[1]-s.a[1])/L];
      const t=(point[0]-s.a[0])*u[0]+(point[1]-s.a[1])*u[1];
      for(const [dir,room] of [[u,L-t],[[-u[0],-u[1]],t]])if(room>1&&!arms.some(a=>a.dir[0]*dir[0]+a.dir[1]*dir[1]>.94))arms.push({dir,width:s.width});
    }
    // Clear of the junction: past the widest road meeting here.
    const clearance=Math.max(...incident.map(s=>s.width/2))+1.2,axis=arms[0]?.dir,flip=hash(id)%2===1;let placed=0;
    for(const {dir,width} of arms){
      // The traffic this pole serves crosses the junction and drives on along dir; its kerb is on
      // its right, or its left where traffic keeps left.
      const travel=dir,right=[-travel[1],travel[0]],kerb=left?[-right[0],-right[1]]:right;
      let spot;
      for(const side of [kerb,[-kerb[0],-kerb[1]]]){
        for(let d=clearance;d<=clearance+3&&!spot;d+=.5){
          const p=[point[0]+dir[0]*d+side[0]*(width/2+.6),point[1]+dir[1]*d+side[1]*(width/2+.6)];
          if(onPavement(p)&&!inBuilding(p)&&!poles.some(q=>Math.hypot(q.position[0]-p[0],q.position[1]-p[1])<2.5))spot=p;
        }
        if(spot)break;
      }
      if(!spot)continue;
      // One road axis shows red, the crossing one green.
      const along=Math.abs(dir[0]*axis[0]+dir[1]*axis[1])>.7;
      poles.push({position:spot,yaw:Math.atan2(dir[1],-dir[0]),red:along!==flip,sourceId:id});placed++;
    }
    records.push(placed?{sourceId:id,status:'generated',poles:placed}:{sourceId:id,status:'skipped',reason:'no pavement beside its approaches'});
  }
  return {poles,records};
}
