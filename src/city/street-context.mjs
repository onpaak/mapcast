import {strip,insidePolygon,polygonsOverlap} from '../spatial.mjs';
import {canopyObstacles} from '../shop-canopy.mjs';
import {PAVEMENT_TOP} from '../ps2.mjs';

// Shared street state for placing things beside buildings: road segments, obstacle lists
// that grow as signs and props are placed, and the pavement slab surface.
export function createStreetContext(base,scene,sources){
  const footprints=sources.map(o=>o.extras.footprint);
  const roadObjects=base.objects.filter(o=>o.extras?.path);
  const roads=roadObjects.flatMap(o=>o.extras.path.slice(1).map((p,i)=>[o.extras.path[i],p]));
  const roadRings=roadObjects.flatMap(o=>o.extras.path.slice(1).map((b,i)=>strip(o.extras.path[i],b,o.extras.width+.3))).filter(Boolean);
  const roadFaces=[];
  for(const object of scene.objects.filter(o=>o.extras?.path||o.name.startsWith('Junction_'))){
    const p=object.positions;
    for(let i=0;i<p.length;i+=9)roadFaces.push([[p[i],p[i+2]],[p[i+3],p[i+5]],[p[i+6],p[i+8]]]);
  }
  const groundObstacles=()=>canopyObstacles([...footprints,...roadRings,...roadFaces]);

  // Pavement top faces as plan triangles, to stand props on the slab.
  const pavement=scene.objects.filter(o=>/^(Sidewalk|Walkway)/.test(o.name)).flatMap(o=>{
    const triangles=[],p=o.positions;
    for(let i=0;i<p.length;i+=9)if(o.normals[i+1]>.9&&p[i+1]>PAVEMENT_TOP-.01)triangles.push([[p[i],p[i+2]],[p[i+3],p[i+5]],[p[i+6],p[i+8]]]);
    return triangles;
  });
  const propBlocks=groundObstacles();

  // Building volumes, for walls hidden behind a neighbour or another section of the same building.
  const volumes=sources.map(o=>{
    const ring=o.extras.footprint,xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
    return {source:o,ring,holes:o.extras.holes??[],min:o.extras.minHeight??0,top:o.extras.height,box:[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)]};
  });

  return {
    roads,
    // True when another volume draws this same wall: its outline runs along a→b (it holds the
    // point just inside, not the point just outside), it starts no higher, and it is taller,
    // or equally tall with the lower id. Drawing both would z-fight.
    sharesWall(source,a,b,n){
      const base=source.extras.minHeight??0,top=source.extras.height,id=String(source.extras.sourceId);
      return [.15,.5,.85].every(t=>{
        const m=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],out=[m[0]+n[0]*.3,m[1]+n[1]*.3],inner=[m[0]-n[0]*.3,m[1]-n[1]*.3];
        return volumes.some(v=>v.source!==source&&v.min<=base+.1&&(v.top>top+.05||Math.abs(v.top-top)<=.05&&String(v.source.extras.sourceId)<id)&&
          inner[0]>=v.box[0]&&inner[0]<=v.box[2]&&inner[1]>=v.box[1]&&inner[1]<=v.box[3]&&
          insidePolygon(inner,v.ring)&&!insidePolygon(out,v.ring)&&!v.holes.some(h=>insidePolygon(inner,h)));
      });
    },
    // Absolute height up to which the outside of wall a→b (outward normal n) is filled by
    // neighbouring volumes that reach down to this building's base; 0 when it is open.
    // A neighbour whose own wall runs within 2.5 m in front does not count: that wall may be
    // left out for this one (see behind), and both drawn is safer than neither.
    coveredTo(source,a,b,n){
      const base=source.extras.minHeight??0;let covered=Infinity;
      for(const t of [.15,.5,.85]){
        const m=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],q=[m[0]+n[0]*.3,m[1]+n[1]*.3],far=[m[0]+n[0]*2.5,m[1]+n[1]*2.5];let height=0;
        for(const v of volumes){
          if(v.source===source||v.min>base+.1||v.top<=height||q[0]<v.box[0]||q[0]>v.box[2]||q[1]<v.box[1]||q[1]>v.box[3])continue;
          if([q,far].every(p=>insidePolygon(p,v.ring)&&!v.holes.some(h=>insidePolygon(p,h))))height=v.top;
        }
        covered=Math.min(covered,height);if(!covered)return 0;
      }
      return covered;
    },
    // Absolute height up to which a taller volume, starting no higher, stands just behind wall
    // a→b (within 1.5 m inside it): a tower rising almost flush with its podium's wall. That
    // stretch of wall is left to the tower; drawn, it would cut through the tower's facade.
    behind(source,a,b,n){
      const base=source.extras.minHeight??0,top=source.extras.height;let height=Infinity;
      for(const t of [.15,.5,.85]){
        const q=[a[0]+(b[0]-a[0])*t-n[0]*1.5,a[1]+(b[1]-a[1])*t-n[1]*1.5];let best=0;
        for(const v of volumes){
          if(v.source===source||v.min>base+.1||v.top<=top+.05||v.top<=best||q[0]<v.box[0]||q[0]>v.box[2]||q[1]<v.box[1]||q[1]>v.box[3])continue;
          if(insidePolygon(q,v.ring)&&!v.holes.some(h=>insidePolygon(q,h)))best=v.top;
        }
        height=Math.min(height,best);if(!height)return 0;
      }
      return height;
    },
    // Each list only grows: canopies, ground-floor blades, upper-storey signs, pavement props.
    canopyBlocks:groundObstacles(),
    bladeBlocks:groundObstacles(),
    // Upper-storey signs only compete with buildings and each other; above head height they
    // may overhang the carriageway, as real vertical signs do.
    signBlocks:canopyObstacles(footprints),
    propBlocks,
    // Base height for a prop footprint: on the slab when every corner and the centre are on it,
    // on the ground when none are; straddling the kerb edge returns undefined (not placed).
    baseAt(ring){
      const c=[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length];
      const on=[...ring,c].map(q=>pavement.some(t=>insidePolygon(q,[...t,t[0]]))),count=on.filter(Boolean).length;
      return count===on.length?PAVEMENT_TOP:count===0?0:undefined;
    },
    // True when a point lies inside a ground-level building footprint.
    inBuilding(p){
      return volumes.some(v=>v.min<=.1&&p[0]>=v.box[0]&&p[0]<=v.box[2]&&p[1]>=v.box[1]&&p[1]<=v.box[3]&&insidePolygon(p,v.ring)&&!v.holes.some(h=>insidePolygon(p,h)));
    },
    // True when a point lies on a road strip (with its kerb margin) or a junction surface.
    onCarriageway(p){
      return roadRings.some(r=>insidePolygon(p,r))||roadFaces.some(t=>insidePolygon(p,[...t,t[0]]));
    },
    // True when a pavement footprint overlaps no building, road or earlier prop.
    fits(ring){
      const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
      return !propBlocks.some(o=>o.bounds[0]<=box[2]&&o.bounds[2]>=box[0]&&o.bounds[1]<=box[3]&&o.bounds[3]>=box[1]&&polygonsOverlap(ring,o.ring));
    }
  };
}

// Low-rise neighbourhoods (villages, suburbs): the buildings within 80 m average under three
// storeys. They keep only shop signage.
export function lowRiseFlags(sources){
  const centres=sources.map(o=>{
    const r=o.extras.footprint.slice(0,-1);
    return [r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length,Math.max(1,Math.round(o.extras.height/3))];
  });
  return centres.map(([x,z])=>{
    const near=centres.filter(c=>Math.hypot(c[0]-x,c[1]-z)<80);
    return near.reduce((s,c)=>s+c[2],0)/near.length<3;
  });
}
