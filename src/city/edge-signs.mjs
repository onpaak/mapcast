import {insidePolygon,polygonsOverlap} from '../spatial.mjs';
import {stableSeed} from '../architecture.mjs';
import {canopyObstacles} from '../shop-canopy.mjs';
import {shopBlade} from '../shop-blade.mjs';
import {rooftopSign} from '../neon-signs.mjs';
import {billboardCells,rooftopBillboard} from '../billboards.mjs';
import {BIN} from './materials.mjs';

const signExtras=id=>({sourceId:id,sceneModule:'Buildings',fictionalSign:true});

// Upper-storey signage on one street edge: a tall tower sign, smaller vertical signs at bay
// joints, and on the front edge of taller blocks a billboard or rooftop letters. Curtain walls
// and towers carry only the rooftop ones.
export function placeEdgeSigns(city,building,edgeInfo,out){
  const street=edgeInfo.isStreet&&building.floors>=3&&!building.industrial&&!building.plainFacade;
  const towerJoint=street&&!building.quiet?placeTowerSign(city,building,edgeInfo,out):-1;
  if(street&&(!building.quiet||building.retail||building.mixedShop))placeVerticalSigns(city,building,edgeInfo,out,towerJoint);
  const onRoof=edgeInfo.edge===building.front&&building.height>=12&&edgeInfo.len>=8&&!building.industrial&&!building.quiet;
  const billboarded=onRoof&&placeBillboard(city,building,edgeInfo,out);
  if(onRoof&&!billboarded)placeRooftopLetters(city,building,edgeInfo,out);
}

// One tall tower sign per shop front, hung at an end joint so towers line up down the
// street; it shrinks to fit the building, or is skipped below about 0.95 m wide.
// Returns the joint it hangs on, or -1.
function placeTowerSign(city,building,edgeInfo,out){
  const {scene,materials,street,state}=city,{id,source,retail,mixedShop,floorHeight,height}=building,{edge,a,u,n,bays,bw}=edgeInfo;
  const towerSeed=stableSeed(`${id}:tower:${edge}`);
  if(bays<3||towerSeed%100>=(retail||mixedShop?85:12))return -1;
  const bottom=floorHeight+.3;
  const sized=materials.signs.tower.map(sign=>({sign,width:Math.min(1.3,(height-.3-bottom)*sign.w/sign.h)})).filter(t=>t.width>=.95);
  if(!sized.length)return -1;
  // Walk the candidates from a seeded start, skipping designs already hung within 40 m.
  const joint=towerSeed%2?1:bays-1;
  if(!edgeInfo.open(joint-1)||!edgeInfo.open(joint))return -1;
  const anchor=[a[0]+u[0]*joint*bw,a[1]+u[1]*joint*bw],first=stableSeed(`${id}:tower-art:${edge}`);
  const order=sized.map((_,i)=>sized[(first+i)%sized.length]);
  const {sign,width}=order.find(t=>!state.placedTowers.some(p=>p.id===t.sign.id&&Math.hypot(p.at[0]-anchor[0],p.at[1]-anchor[1])<40))??order[0];
  const top=bottom+width*sign.h/sign.w;
  const tower=shopBlade({a,u,n,along:joint*bw,bottom,top,uv:sign.uv,obstacles:street.signBlocks,end:.16+width,start:.16,half:.09});
  if(!tower)return -1;
  out.emit(tower.housing,BIN.metal);street.signBlocks.push(...canopyObstacles([tower.footprint]));state.placedTowers.push({id:sign.id,at:anchor});
  scene.objects.push({name:source.name+`_TowerSign_${edge}`,...tower.faces,material:materials.signMaterials[sign.style],extras:signExtras(id)});
  state.streetSigns.push({sourceId:id,edge,joint,kind:'tower',text:sign.sections.join(' / '),signId:sign.id,textSource:'fictional-style-palette',footprint:tower.footprint,bottom,top});
  return joint;
}

// Vertical signs hang at bay joints above the ground floor, denser on shop buildings;
// taller blocks stagger them over two storeys.
function placeVerticalSigns(city,building,edgeInfo,out,towerJoint){
  const {scene,materials,street,state}=city,{signs,signMaterials}=materials;
  const {id,source,retail,mixedShop,floors,floorHeight,height}=building,{edge,a,u,n,bays,bw}=edgeInfo;
  for(let col=1;col<bays;col++){
    // Signs only hang on drawn wall, not on bays left to a tower behind.
    if(col===towerJoint||!edgeInfo.open(col-1)||!edgeInfo.open(col))continue;
    const key=`${id}:vsign:${edge}:${col}`;
    if(stableSeed(key)%100>=(retail||mixedShop?45:12))continue;
    // About a third are square pictogram boxes instead of text columns.
    const pick=stableSeed(key+':art'),pool=pick%10<3?signs.square:signs.vertical,sign=pool[stableSeed(key+':entry')%pool.length];
    // Three widths so neighbouring text columns do not look stamped from one mould.
    const faceWidth=sign.kind==='square'?.7:[.62,.78,.95][stableSeed(key+':size')%3];
    const bottom=(1+(floors>=5?pick%2:0))*floorHeight+.4,top=bottom+faceWidth*sign.h/sign.w;
    if(top>height-.3)continue;
    const blade=shopBlade({a,u,n,along:col*bw,bottom,top,uv:sign.uv,obstacles:street.signBlocks,end:.14+faceWidth,start:.14,half:.06});
    if(!blade)continue;
    out.emit(blade.housing,BIN.metal);street.signBlocks.push(...canopyObstacles([blade.footprint]));
    scene.objects.push({name:source.name+`_StreetSign_${edge}_${col}`,...blade.faces,material:signMaterials[sign.style],extras:signExtras(id)});
    state.streetSigns.push({sourceId:id,edge,joint:col,kind:sign.kind,text:sign.text,signId:sign.id,textSource:'fictional-style-palette',footprint:blade.footprint,bottom,top});
  }
}

// Rooftop billboards take some tall street fronts; the frame must stand fully on the roof,
// clear of courtyards and the stair core, and nearby billboards show different artwork.
// Returns true when one was placed.
function placeBillboard(city,building,edgeInfo,out){
  const {scene,materials,state}=city,{id,source,ring,holes,height}=building,{edge,a,u,n,len}=edgeInfo;
  if(stableSeed(`${id}:billboard`)%100>=22)return false;
  const width=Math.min(8,len-2),points=ring.slice(0,-1),mid=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  const core=[[mid[0]-1.7,mid[1]-1.3],[mid[0]+1.7,mid[1]-1.3],[mid[0]+1.7,mid[1]+1.3],[mid[0]-1.7,mid[1]+1.3]];
  const cells=billboardCells.slice(0,materials.billboardSlotCount),first=stableSeed(`${id}:billboard-art`);
  const at=[a[0]+u[0]*len/2,a[1]+u[1]*len/2],order=cells.map((_,i)=>(first+i)%cells.length);
  const slot=order.find(i=>!state.billboards.some(b=>b.slot===i&&Math.hypot(b.at[0]-at[0],b.at[1]-at[1])<80))??order[0];
  const board=width>=6&&rooftopBillboard({a,u,n,center:len/2,width,roof:height,uv:cells[slot]});
  if(!board||!board.footprint.every(q=>insidePolygon(q,ring)&&!holes.some(hole=>insidePolygon(q,hole)))||polygonsOverlap(board.footprint,core))return false;
  out.emit(board.frame,BIN.metal);
  scene.objects.push({name:source.name+'_Billboard',...board.face,material:materials.billboardMaterial,extras:{sourceId:id,sceneModule:'Buildings',fictionalAd:true}});
  state.billboards.push({sourceId:id,edge,slot,at,footprint:board.footprint,bottom:height+1.4,top:height+1.4+board.height,contentSource:'fictional-advertisement'});
  return true;
}

// Rooftop channel letters over the front edge of taller blocks: sparser on non-shop
// buildings, at most one within 35 m and the same design at most once per 100 m.
function placeRooftopLetters(city,building,edgeInfo,out){
  const {scene,materials,state}=city,{id,source,ring,holes,height,retail,mixedShop,office}=building,{edge,a,u,n,len}=edgeInfo;
  const roofAt=[a[0]+u[0]*len/2,a[1]+u[1]*len/2],near=d=>state.placedRoofSigns.filter(p=>Math.hypot(p.at[0]-roofAt[0],p.at[1]-roofAt[1])<d);
  if(stableSeed(`${id}:roof-sign`)%100>=(retail||mixedShop||office?28:8)||near(35).length)return;
  const signs=materials.signs.rooftop,first=stableSeed(`${id}:roof-art`),recent=near(100).map(p=>p.id);
  const sign=signs.map((_,i)=>signs[(first+i)%signs.length]).find(e=>!recent.includes(e.id))??signs[first%signs.length];
  const width=Math.min(len-2,1.7*sign.aspect),signHeight=width/sign.aspect,setback=1.2;
  const standsOnRoof=[len/2-width/2-.2,len/2+width/2+.2].every(x=>{
    const q=[a[0]+u[0]*x-n[0]*(setback+.3),a[1]+u[1]*x-n[1]*(setback+.3)];
    return insidePolygon(q,ring)&&!holes.some(hole=>insidePolygon(q,hole));
  });
  const roofSign=standsOnRoof&&signHeight>=.6&&rooftopSign({a,u,n,center:len/2,width,height:signHeight,roof:height,uv:sign.uv,setback});
  if(!roofSign)return;
  out.emit(roofSign.frame,BIN.metal);
  scene.objects.push({name:source.name+'_RooftopSign',...roofSign.face,material:materials.signMaterials.cutout,extras:signExtras(id)});
  state.placedRoofSigns.push({id:sign.id,at:roofAt});
  state.rooftopSigns.push({sourceId:id,edge,text:sign.text,signId:sign.id,textSource:'fictional-style-palette',footprint:roofSign.footprint,bottom:height+.7,top:height+.7+signHeight});
}
