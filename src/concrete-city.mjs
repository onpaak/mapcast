import {extrude} from './geometry.mjs';
import {insidePolygon,distanceToSegment} from './spatial.mjs';
import {stylePS2} from './ps2.mjs';
import {residentialBalcony,balconyFits} from './residential-facade.mjs';
import {surfaceUV,compactMaterials} from './concrete-materials.mjs';
import {publicHallEdge} from './public-hall.mjs';
import {edgeFrame} from './facade-atlas.mjs';
import {createCityMaterials,BIN,BIN_COUNT,KIT_BINS} from './city/materials.mjs';
import {createStreetContext,lowRiseFlags} from './city/street-context.mjs';
import {planBuilding} from './city/building-plan.mjs';
import {edgeGeometry} from './city/edge-geometry.mjs';
import {buildShopfrontBay} from './city/shopfront.mjs';
import {buildAtlasBay,buildModelledBay,buildCourtyardWalls} from './city/facade-bays.mjs';
import {placeEdgeSigns} from './city/edge-signs.mjs';
import {placeRoofEquipment} from './city/roof-equipment.mjs';
import {buildStructure} from './city/structures.mjs';
import {placeStreetFurniture} from './street-furniture.mjs';

// The concrete-city preset: replaces each OSM building's plain extrusion with a PS2-style
// facade and adds the neon street layer. Street-facing ground floors are modelled around
// their openings; everything else is a flat quad carrying the painted facade atlas.
//
// options.billboardSlots: how many atlas slots hold distinct artwork (default all).
// options.detail: 'full' (default) or 'lite' — every facade from the atlas (no modelled
// ground floors or shopfronts) and no street props; signs, billboards and lamps remain.
export function concreteCity(base,{billboardSlots,detail='full'}={}){
  const lite=detail==='lite';
  // Every building is rebuilt below, so the PS2 pass skips its own building details.
  const scene=stylePS2(base,{buildingDetails:false}),sources=base.objects.filter(o=>o.name.startsWith('Building_'));
  scene.objects=scene.objects.filter(o=>!o.name.startsWith('Building_'));
  const materials=createCityMaterials(scene,{billboardSlots});
  const street=createStreetContext(base,scene,sources),lowRise=lowRiseFlags(sources);
  // Records gathered while building, written to metadata.json at the end.
  const state={
    layouts:[],frontages:[],families:[],canopies:[],windowPosters:[],
    shopSigns:[],shopBlades:[],streetSigns:[],rooftopSigns:[],billboards:[],
    streetProps:{acUnits:0,vendingMachines:[],standingSigns:[]},
    rooftopEquipment:[],placedTowers:[],placedRoofSigns:[],groundFloorKit:[]
  };
  const city={scene,materials,street,state,lite};
  for(const [index,source] of sources.entries())buildBuilding(city,{...planBuilding(source,street.roads),quiet:lowRise[index]});
  // Mapped street furniture goes in after the buildings, so it yields to their shop props.
  const furniture=lite?{objects:[],records:[]}:placeStreetFurniture(base.furniture??[],{street,materials:materials.furniture,paths:base.objects.flatMap(o=>o.extras?.path?[o.extras.path]:o.extras?.walkingPath?[o.extras.walkingPath]:[])});
  scene.objects.push(...furniture.objects);
  for(const r of furniture.records)if(r.status==='skipped')(scene.metadata.omissions??=[]).push({id:r.sourceId,reason:`Street furniture (${r.kind}) left out: ${r.reason}`});

  scene.metadata={...scene.metadata,style:'concrete-city-reference-v1',entranceLayouts:state.layouts,generationPreset:{...scene.metadata.generationPreset,name:'concrete-city-reference-v1'},sceneModules:scene.objects.reduce((a,o)=>(a[o.extras.sceneModule]=(a[o.extras.sceneModule]??0)+1,a),{})};
  compactMaterials(scene);
  Object.assign(scene.metadata,{
    style:'ps2-neon-concrete-v14',frontages:state.frontages,entranceAccess:[],shopCanopies:state.canopies,concreteFamilies:state.families,
    entranceAccessSummary:{},entranceAccessEnabled:false,shopSigns:state.shopSigns,shopBlades:state.shopBlades,streetSigns:state.streetSigns,
    rooftopSigns:state.rooftopSigns,billboards:state.billboards,detail:lite?'lite':'full',windowPosters:state.windowPosters,streetProps:state.streetProps,rooftopEquipment:state.rooftopEquipment,
    groundFloorKit:state.groundFloorKit,groundFloorKitSummary:state.groundFloorKit.reduce((a,k)=>{const key=k.state?`${k.kind}-${k.state}`:k.kind;a[key]=(a[key]??0)+1;return a;},{}),
    streetFurniture:furniture.records,streetFurnitureSummary:furniture.records.reduce((a,r)=>{a[r.kind]??={generated:0,skipped:0};a[r.kind][r.status]++;return a;},{})
  });
  scene.metadata.generationPreset.name='ps2-neon-concrete-v14';
  const buildingMaterials=new Set(scene.objects.filter(o=>o.name.startsWith('Building_')).map(o=>o.material));
  const buildingTextures=new Set([...buildingMaterials].flatMap(i=>scene.materials[i].pbrMetallicRoughness.baseColorTexture?[scene.materials[i].pbrMetallicRoughness.baseColorTexture.index]:[]));
  scene.metadata.textureReuse={buildingInstances:sources.length,sharedBuildingTextures:buildingTextures.size,sharedBuildingMaterials:buildingMaterials.size,totalTextures:scene.textures.length};
  return scene;
}

function buildBuilding(city,building){
  const {scene,materials,state}=city,{source,id,ring,seed,facade,base}=building;
  // Geometry is built from y=0 and raised to the section's base at the end.
  const firstObject=scene.objects.length;
  state.families.push({sourceId:id,objectName:source.name,...building.assignment,layout:building.structure??(building.residential?facade.name:building.family),...(building.glass?{facade:'curtain-wall'}:{}),appearanceSource:'procedural-interpretation'});

  // Output meshes: modelled geometry sorted into material bins, the atlas facade, and props.
  const empty=()=>({positions:[],normals:[],texcoords:[]});
  const bins=Array.from({length:BIN_COUNT},()=>({positions:[],normals:[]}));
  const out={
    emit:(mesh,bin=BIN.wall)=>{bins[bin].positions.push(...mesh.positions);bins[bin].normals.push(...mesh.normals);},
    add:(target,mesh)=>{for(const key of ['positions','normals','texcoords'])target[key].push(...mesh[key]);},
    facadeMesh:empty(),propMesh:empty(),vendMesh:empty(),standingFaces:{lightbox:empty(),neon:empty()}
  };

  // Slender sections (columns, spires) are plain shafts; everything else is a full building.
  if(building.structure)buildStructure(building,out.emit);
  else buildMass(city,building,out);

  const palette=materials.palette(seed);
  const extras={...source.extras,sceneModule:'Buildings',concreteFamily:building.family,familyAssignment:building.assignment.assignment,familyEvidence:building.assignment.evidence,styleFamily:building.styleFamily};
  // Glass bins tile every 1.5 m, walls every 3 m, ground-floor kit paint every 4 m; the offset
  // varies texture placement per building.
  const glassBins=[BIN.glass,BIN.unlitGlass,BIN.warmGlass,BIN.displayGlass];
  bins.forEach((mesh,bin)=>{if(mesh.positions.length)scene.objects.push({name:source.name+'_Concrete_'+bin,...surfaceUV(mesh,ring[0],glassBins.includes(bin)?1.5:KIT_BINS.includes(bin)?4:3,(seed%8)/8),material:palette[bin],extras});});
  if(out.facadeMesh.positions.length)scene.objects.push({name:source.name+'_FacadeAtlas',...out.facadeMesh,material:building.glass?materials.curtainMaterial:materials.facadeMaterial(seed),extras:{...extras,...(building.glass?{curtainWall:true}:{facadeAtlasRow:building.atlasRow})}});
  const propExtras={sourceId:id,sceneModule:'StreetProps',inferred:true};
  if(out.propMesh.positions.length)scene.objects.push({name:'StreetProps_'+id,...out.propMesh,material:materials.propsMaterial,extras:propExtras});
  if(out.vendMesh.positions.length)scene.objects.push({name:`StreetProps_${id}_Vending`,...out.vendMesh,material:materials.vendingMaterial,extras:propExtras});
  for(const [style,mesh] of Object.entries(out.standingFaces))if(mesh.positions.length)scene.objects.push({name:`StreetProps_${id}_Lightbox_${style}`,...mesh,material:materials.signMaterials[style],extras:{...propExtras,fictionalSign:true}});
  if(base){
    for(const o of scene.objects.slice(firstObject))o.positions=o.positions.map((v,i)=>i%3===1?v+base:v);
    for(const record of [...state.billboards,...state.rooftopSigns])if(record.sourceId===id){record.bottom+=base;record.top+=base;}
  }
}

// Roof, courtyard walls, facades edge by edge, stair core and rooftop equipment.
function buildMass(city,building,out){
  const {street,state,lite}=city,{source,id,ring,lengths,holes,height,floors,floorHeight,facade,front,base}=building;
  // Keep the source roof (including courtyard holes) but replace every facade.
  for(let i=0;i<source.positions.length;i+=9)if(source.normals[i+1]>.5)out.emit({positions:source.positions.slice(i,i+9).map((v,j)=>j%3===1?v-base:v),normals:source.normals.slice(i,i+9)},BIN.roof);
  buildCourtyardWalls(building,out);

  for(let edge=0;edge<ring.length-1;edge++){
    const a=ring[edge],b=ring[edge+1],len=lengths[edge];if(len<.05)continue;
    const u=[(b[0]-a[0])/len,(b[1]-a[1])/len];let n=[-u[1],u[0]];
    if(insidePolygon([(a[0]+b[0])/2+n[0]*.04,(a[1]+b[1])/2+n[1]*.04],ring))n=n.map(v=>-v);
    // Party walls: the part of this wall filled by a neighbour (or another section) needs no facade.
    const hidden=Math.max(0,street.coveredTo(source,a,b,n)-base);if(hidden>=height-.05||street.sharesWall(source,a,b,n))continue;
    const geometry=edgeGeometry({ring,lengths,edge,a,u,n,emit:out.emit}),{box,panel}=geometry;
    if(building.family==='simple-mass'){box(0,len,hidden,height);continue;}
    if(building.publicHall){
      if(len>=3&&height>=3){
        const openings=publicHallEdge({length:len,height,front:edge===front,box,panel,recessFits:(l,r)=>balconyFits(ring,holes,a,b,n,l,r)});
        for(const opening of openings){
          state.frontages.push({sourceId:id,edge,...opening});
          if(opening.type==='public-entrance')state.layouts.push({sourceId:id,objectName:source.name,edge,bay:opening.bay,bottom:0,window:false,doorType:'solid-double',bounds:opening.bounds});
        }
      }else{box(0,len,0,height);box(0,len,height,height+.25,0,-.25);}
      continue;
    }

    const {industrial,office,residential,retail,mixedShop}=building;
    const bays=Math.max(1,Math.floor(len/(industrial?4.5:office?2.5:residential?facade.bayWidth:3.2))),bw=len/bays,door=Math.floor(bays/2);
    const edgeInfo={edge,a,b,u,n,len,bays,bw,door,geometry,atlas:edgeFrame(a,u,n),isStreet:!hidden&&building.isStreetEdge(edge)};
    // Bays with a taller tower standing just behind them are left to the tower's facade.
    const behind=Array.from({length:bays},(_,col)=>street.behind(source,[a[0]+u[0]*col*bw,a[1]+u[1]*col*bw],[a[0]+u[0]*(col+1)*bw,a[1]+u[1]*(col+1)*bw],n)-base);
    edgeInfo.open=col=>!(behind[col]>0);
    // Towers use the dense tower-grid facade and curtain walls are flush: no recessed loggias.
    const balconyBays=Array.from({length:bays},(_,col)=>residential&&!building.highRise&&!building.glass&&residentialBalcony(facade,col,bays)&&balconyFits(ring,holes,a,b,n,col*bw+.21,(col+1)*bw-.21));
    for(let floor=0;floor<floors;floor++)for(let col=0;col<bays;col++){
      const left=col*bw,right=(col+1)*bw,y=floor*floorHeight,top=(floor+1)*floorHeight,entrance=edge===front&&floor===0&&col===door;
      if(top<=Math.max(hidden,behind[col])+.01)continue;
      const shopBay=mixedShop&&col!==door&&Math.abs(col-door)<=Math.min(2,source.extras.containedShops.length);
      const bay={floor,col,left,right,y,top,entrance,shopBay,balcony:floor>0&&balconyBays[col],cellKey:`${id}:${edge}:${floor}:${col}`};
      if(!lite&&!building.elevated&&!building.plainFacade&&edge===front&&floor===0&&(retail||industrial||shopBay)&&bw>1.2&&top>2)buildShopfrontBay(city,building,edgeInfo,bay,out);
      // Upper floors and non-street ground floors are painted atlas cells; industrial
      // ground floors keep their high modelled windows on every side. Curtain walls and
      // towers run their painted facade down to the pavement, entrance included.
      else if(bay.balcony||floor>0||lite||building.plainFacade||!edgeInfo.isStreet&&!industrial)buildAtlasBay(city,building,edgeInfo,bay,out);
      else buildModelledBay(city,building,edgeInfo,bay,out);
    }
    placeEdgeSigns(city,building,edgeInfo,out);
    // Office fins and a deeper cornice, or a plain parapet; curtain walls get a metal coping.
    // All of them stop where the wall is left to a tower behind it.
    const {open}=edgeInfo,runs=[];
    for(let col=0;col<bays;col++)if(open(col)){const l=col*bw,r=col===bays-1?len:(col+1)*bw;if(runs.length&&runs.at(-1)[1]===l)runs.at(-1)[1]=r;else runs.push([l,r]);}
    if(building.glass)for(const [l,r] of runs)box(l,r,height,height+.25,0,-.25,BIN.metal);
    else if(office){
      for(let c=0;c<=bays;c++)if(c>0&&open(c-1)||c<bays&&open(c))box(Math.max(0,c*bw-.12),Math.min(len,c*bw+.12),0,height,.14,-.1);
      for(const [l,r] of runs)box(l,r,height-.5,height+.35,.16,-.25);
    }
    else for(const [l,r] of runs)box(l,r,height,height+.25,0,-.25);
  }

  // Stair core on the roof when it fits well inside the footprint.
  const points=ring.slice(0,-1),center=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  const core=[[center[0]-1.6,center[1]-1.2],[center[0]+1.6,center[1]-1.2],[center[0]+1.6,center[1]+1.2],[center[0]-1.6,center[1]+1.2]];
  const coreFits=building.family!=='simple-mass'&&core.every(p=>insidePolygon(p,ring)&&!holes.some(hole=>insidePolygon(p,hole))&&ring.slice(1).every((q,i)=>distanceToSegment(p,ring[i],q)>.3));
  if(coreFits)out.emit(extrude(core,1.8,height));
  placeRoofEquipment(city,building,out,coreFits?core:null);
}
