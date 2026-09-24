import {extrude} from '../geometry.mjs';
import {insidePolygon} from '../spatial.mjs';
import {stableSeed} from '../architecture.mjs';
import {canopyObstacles} from '../shop-canopy.mjs';
import {acUnit,vendingMachine,VENDING_WIDTH} from '../street-props.mjs';
import {edgeFrame,facadeProfiles,groundCell,upperCell,curtainCell} from '../facade-atlas.mjs';
import {BIN} from './materials.mjs';

// Atlas cell for a bay-floor: upper floors vary their lit windows, ground floors add a base.
// A raised section's lowest floor is an upper floor too. Curtain walls light whole floors,
// about a third of them, with the odd dark bay.
export const atlasCell=(building,floor,key)=>building.glass
  ?curtainCell(stableSeed(`${building.id}:floor:${floor}`)%100<35&&stableSeed(key)%100>=10)
  :floor>0||building.elevated
  ?upperCell(building.atlasRow,stableSeed(key))
  :groundCell(building.atlasRow,{brick:building.brickBase,seed:stableSeed(key)});

// A painted bay: loggia recess or a flat atlas cell, with an occasional AC unit under the window.
export function buildAtlasBay(city,building,edgeInfo,bay,out){
  const {atlas,u,n,a,bw}=edgeInfo,{floor,left,right,y,top,balcony,cellKey}=bay;
  if(balcony){
    atlas.loggia(out.facadeMesh,{left,right,bottom:y,top,l:left+.21,r:right-.21,floor:y+.16,parapet:y+.98,head:top-(building.residential?building.facade.head:.48),depth:1.1,seed:stableSeed(cellKey)});
    return;
  }
  atlas.front(out.facadeMesh,atlasCell(building,floor,cellKey),{left,right,bottom:y,top});
  // Split AC units hang under some upper windows up to the 8th floor; office bands and
  // curtain walls leave no wall below the sill, and towers do not carry units hundreds of metres up.
  // Counted from the ground, so raised building sections high up get none.
  const ac=stableSeed(cellKey+':ac'),storey=floor+Math.round(building.base/building.floorHeight);
  if(!city.lite&&storey>0&&storey<=8&&!building.office&&!building.glass&&ac%100<7){
    out.add(out.propMesh,acUnit({a,u,n,along:(left+right)/2+(ac%3-1)*bw*.12,y:y+.1}));
    city.state.streetProps.acUnits++;
  }
}

// A modelled street-facing bay: wall pieces around a recessed window or the entrance door,
// plus vending machines on busier streets.
export function buildModelledBay(city,building,edgeInfo,bay,out){
  const {street,state}=city,{id,source,floors,facade,residential,office,industrial,retail,mixedShop,front}=building;
  const {edge,a,u,n,bw,door,geometry}=edgeInfo,{box,panel,reveal}=geometry,{floor,col,left,right,y,top,entrance,cellKey}=bay;
  const width=entrance?Math.min(1.15,bw*.7):Math.min(office?1.45:residential?facade.windowWidth:1.05,bw*.54);
  const l=(left+right-width)/2,r=l+width;
  const bottom=entrance?0:industrial?Math.max(.45,top-1.7):y+(office?.28:residential?facade.sill:.85);
  const upper=entrance?Math.min(2.3,top-.25):top-(office?.28:residential?facade.head:.48);
  const baseTop=floor===0?Math.min(.6,top):y;
  panel(left,l,y,baseTop,0,BIN.base);panel(r,right,y,baseTop,0,BIN.base);
  panel(left,l,baseTop,top,0,BIN.wall);panel(r,right,baseTop,top,0,BIN.wall);
  panel(l,r,y,Math.min(bottom,baseTop),0,BIN.base);panel(l,r,Math.max(y,baseTop),bottom,0,BIN.wall);panel(l,r,upper,top,0,BIN.wall);
  reveal(l,r,bottom,upper,-.18);

  // Vending machines belong to busier streets: blocks of three storeys or more, or shops.
  const vend=stableSeed(cellKey+':vend');
  if(floor===0&&!entrance&&!industrial&&(floors>=3&&!building.quiet||retail||mixedShop)&&!(edge===front&&Math.abs(col-door)<=1)&&vend%100<6){
    // Pairs when the bay is wide enough.
    const gap=VENDING_WIDTH/2+.02;
    for(const along of bw>=2*VENDING_WIDTH+.3&&vend%5<2?[(left+right)/2-gap,(left+right)/2+gap]:[(left+right)/2]){
      const probe=vendingMachine({a,u,n,along}),base=street.baseAt(probe.footprint),machine=vendingMachine({a,u,n,along,base:base??0});
      if(base===undefined||!street.fits(machine.footprint))continue;
      out.add(out.vendMesh,machine.mesh);street.propBlocks.push(...canopyObstacles([machine.footprint]));
      state.streetProps.vendingMachines.push({sourceId:id,edge,bay:col,footprint:machine.footprint});
    }
  }

  if(entrance){
    // Full-height independent door leaf with frame, threshold, handle and a bell plate.
    box(l,r,0,upper,-.10,-.18,BIN.door);
    box(l-.08,l,0,upper+.08,.025,-.24,BIN.metal);box(r,r+.08,0,upper+.08,.025,-.24,BIN.metal);
    box(l-.08,r+.08,upper,upper+.08,.025,-.24,BIN.metal);
    box(l,r,0,.035,-.06,-.24,BIN.metal);
    box(r-.19,r-.12,.96,1.18,-.065,-.10,BIN.joint);
    box(r-.26,r-.12,1.07,1.10,-.035,-.065,BIN.metal);
    box(r+.10,Math.min(right,r+.20),1.18,1.40,.025,.005,BIN.metal);
    state.layouts.push({sourceId:id,objectName:source.name,edge,bay:col,bottom:0,window:false,doorType:'solid',bounds:[l,r,0,upper]});
    return;
  }
  const depth=-.18,windowSeed=stableSeed(`${id}:${edge}:${floor}:${col}`);
  const glassBin=windowSeed%19===0?BIN.warmGlass:windowSeed%3===0?BIN.unlitGlass:BIN.glass;
  panel(l,r,bottom,upper,depth,glassBin);
  panel(l,l+.065,bottom,upper,depth+.06,BIN.metal);panel(r-.065,r,bottom,upper,depth+.06,BIN.metal);
  panel(l,r,bottom,bottom+.07,depth+.06,BIN.metal);panel(l,r,upper-.07,upper,depth+.06,BIN.metal);
  panel((l+r)/2-.025,(l+r)/2+.025,bottom,upper,depth+.065,BIN.metal);
  // Narrow joints stay between modules; they never cross glazing.
  if(col>0)panel(left,left+.018,y,top,.003,BIN.joint);
  panel(left,right,top-.018,top,.003,BIN.joint);
}

// Courtyard walls face into the hole. Residential, office and retail courtyards get atlas
// windows; other families keep a plain 0.2 m wall.
export function buildCourtyardWalls(building,out){
  const {id,holes,floors,floorHeight,height,atlasRow,residential,office,retail}=building;
  const atlasCourtyard=residential||office||retail;
  for(const hole of holes)for(let i=0;i<hole.length-1;i++){
    const a=hole[i],b=hole[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<.01)continue;
    let n=[-(b[1]-a[1])/d,(b[0]-a[0])/d];
    if(insidePolygon([(a[0]+b[0])/2+n[0]*.1,(a[1]+b[1])/2+n[1]*.1],hole))n=n.map(v=>-v);
    if(!atlasCourtyard){out.emit(extrude([a,b,[b[0]+n[0]*.2,b[1]+n[1]*.2],[a[0]+n[0]*.2,a[1]+n[1]*.2]],height));continue;}
    const {front:face}=edgeFrame(a,[(b[0]-a[0])/d,(b[1]-a[1])/d],n.map(v=>-v));
    const bays=Math.max(1,Math.floor(d/facadeProfiles[atlasRow].bayWidth)),bw=d/bays;
    for(let f=0;f<floors;f++)for(let col=0;col<bays;col++)
      face(out.facadeMesh,atlasCell(building,f,`${id}:hole:${i}:${f}:${col}`),{left:col*bw,right:(col+1)*bw,bottom:f*floorHeight,top:(f+1)*floorHeight});
  }
}
