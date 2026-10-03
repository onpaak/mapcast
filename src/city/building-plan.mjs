import {edgeOutward} from '../entrance-access.mjs';
import {stableSeed} from '../architecture.mjs';
import {residentialFacade} from '../residential-facade.mjs';
import {resolveConcreteFamily} from '../concrete-family.mjs';
import {facadeRow} from '../facade-atlas.mjs';
import {structureKind} from './structures.mjs';

// Buildings tagged with plain windows (schools, hotels, ...) share one simple layout.
const PLAIN_WINDOWS={name:'plain-window-block',bayWidth:3.4,windowWidth:1.65,sill:.9,head:.5,balconies:'none'};

// Everything decided once per building before any geometry: its family, storeys, facade
// profile, and which edges face a street.
export function planBuilding(source,roads){
  const id=source.extras.sourceId,tags=source.extras.osmTags??{},assignment=resolveConcreteFamily(tags),family=assignment.family;
  const industrial=family==='industrial',retail=family==='retail',publicHall=family==='public-hall',office=family==='office',residential=family==='residential';
  // Residential blocks with shops inside (OSM shop points) get shopfronts around the door.
  const mixedShop=residential&&!assignment.plainWindows&&(source.extras.containedShops?.length??0)>0;
  // A vacant shop (on the building or a shop point inside it) keeps its shutters down.
  const vacant=tags.shop==='vacant'||(source.extras.containedShops??[]).some(s=>s.shop==='vacant');
  // A raised building:part section is planned from its own base (min_height) upwards.
  const ring=source.extras.footprint,base=source.extras.minHeight??0,height=source.extras.height-base,elevated=base>0;
  const floors=industrial?1:Math.max(1,Math.round(height/3)),floorHeight=height/floors;
  const seed=stableSeed(id),facade=assignment.plainWindows?PLAIN_WINDOWS:residentialFacade(id);
  const highRise=floors>=12;
  const atlasRow=highRise?facadeRow('tower-grid'):office?facadeRow('office'):residential?facadeRow(facade.name):0;
  const lengths=ring.slice(1).map((p,i)=>Math.hypot(p[0]-ring[i][0],p[1]-ring[i][1]));
  const structure=structureKind(tags,ring);
  // Glass curtain walls only where OSM says so; the facade material wins over the building's.
  const glass=!structure&&/glass|mirror/i.test(tags['building:facade:material']??tags['building:material']??'');

  // Distance from each edge to the nearest road it faces; the closest long edge is the front.
  const roadDistance=lengths.map((_,i)=>{
    const mid=[(ring[i][0]+ring[i+1][0])/2,(ring[i][1]+ring[i+1][1])/2],out=edgeOutward(ring,i);
    let best=Infinity;
    for(const [a,b] of roads){
      const dx=b[0]-a[0],dz=b[1]-a[1],sq=dx*dx+dz*dz;if(sq<1e-8)continue;
      const t=Math.max(0,Math.min(1,((mid[0]-a[0])*dx+(mid[1]-a[1])*dz)/sq)),v=[a[0]+dx*t-mid[0],a[1]+dz*t-mid[1]],d=Math.hypot(...v);
      if(v[0]*out[0]+v[1]*out[1]>.1&&d<best)best=d;
    }
    return best;
  });
  let front=lengths.indexOf(Math.max(...lengths)),best=Infinity;
  for(let i=0;i<lengths.length;i++)if(lengths[i]>3&&roadDistance[i]<best){best=roadDistance[i];front=i;}

  return {
    source,id,assignment,family,industrial,retail,publicHall,office,residential,mixedShop,vacant,
    structure,glass,ring,holes:source.extras.holes??[],base,elevated,height,floors,floorHeight,seed,facade,highRise,atlasRow,
    brickBase:seed%3===1,lengths,front,
    // Curtain walls and towers of 12+ storeys keep one facade down to the pavement: a painted
    // ground floor (no modelled doors or shopfronts) and no signs hung on the walls.
    plainFacade:glass||highRise,
    // Modelled ground floors only where a street camera sees them; other sides use atlas cells.
    // Raised sections have no street level.
    isStreetEdge:edge=>!elevated&&(edge===front||roadDistance[edge]<25),
    styleFamily:structure?structure:family==='simple-mass'?'simple-mass':publicHall?'public-hall':industrial?'industrial':retail?'retail-frontage':office?'vertical-office':assignment.plainWindows?'plain-window-block':'recessed-balcony-residential'
  };
}
