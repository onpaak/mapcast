import {stableSeed} from '../architecture.mjs';
import {canopyObstacles,shopCanopy} from '../shop-canopy.mjs';
import {shopSignFace} from '../shop-signs.mjs';
import {shopBlade} from '../shop-blade.mjs';
import {windowPoster,posterTitles} from '../window-posters.mjs';
import {standingSign} from '../street-props.mjs';
import {BIN} from './materials.mjs';

// Face height of a projecting sign: square pictogram boxes read better larger.
const bladeHeight=sign=>sign.kind==='square'?.6:.36;

// One modelled ground-floor bay on the front edge of a shop, warehouse or mixed-use block:
// display window or door (or a loading door for warehouses), fascia, poster, shop sign with
// an optional projecting blade, canopy and a standing pavement lightbox.
export function buildShopfrontBay(city,building,edgeInfo,bay,out){
  const {scene,materials,street,state}=city,{signs,signMaterials}=materials;
  const {id,source,seed,industrial,retail}=building,{edge,a,b,u,n,bw,door,geometry}=edgeInfo,{box,panel,reveal,sillFace}=geometry;
  const {col,left,right,top,entrance,shopBay}=bay;
  const loading=industrial&&!entrance;
  // A mixed-use block's shop next to the residential door gets its own glazed door.
  const shopEntry=shopBay&&Math.abs(col-door)===1&&bw>=2;
  const entryWidth=Math.min(1.5,bw-.36);
  const l=entrance?(left+right-entryWidth)/2:left+.18,r=entrance?(left+right+entryWidth)/2:right-.18;
  const bottom=entrance||loading?0:.22,upper=Math.min(industrial?3.5:2.5,top-.45);
  const split=shopEntry?l+Math.min(1.0,(r-l)*.42):undefined;

  panel(left,l,0,top,0,BIN.wall);panel(r,right,0,top,0,BIN.wall);panel(shopEntry?split+.06:l,r,0,bottom,0,BIN.base);panel(l,r,upper,top,0,BIN.wall);
  reveal(l,r,shopEntry?0:bottom,upper,-.13,{sill:!shopEntry});
  if(shopEntry)sillFace(split+.06,r,bottom,-.13);
  if(shopEntry){panel(l,split,0,upper,-.13,BIN.glass);panel(split+.06,r,bottom,upper,-.13,BIN.displayGlass);}
  else box(l,r,bottom,upper,-.13,-.21,loading?BIN.metal:entrance?BIN.glass:BIN.displayGlass);
  // Frame, transom and a mullion, door handle or the slats of a roller door.
  box(l,l+.07,bottom,upper,-.04,-.14,BIN.metal);box(r-.07,r,bottom,upper,-.04,-.14,BIN.metal);
  box(l,r,upper-.07,upper,-.04,-.14,BIN.metal);
  if(loading){for(let sy=bottom+.18;sy<upper;sy+=.22)box(l+.07,r-.07,sy,Math.min(sy+.018,upper),-.035,-.05,BIN.joint);}
  else if(shopEntry){box(split,split+.06,0,upper,-.035,-.14,BIN.metal);box(split-.16,split-.11,.95,1.28,-.01,-.07,BIN.metal);box(l,split,0,.065,-.03,-.14,BIN.metal);}
  else if(entrance){box(r-.18,r-.13,.92,1.18,-.02,-.06,BIN.joint);box(l,r,.01,.08,-.03,-.14,BIN.metal);}
  else box((l+r)/2-.035,(l+r)/2+.035,bottom,upper,-.035,-.14,BIN.metal);

  if((retail||shopBay)&&!entrance&&stableSeed(`${id}:poster:${col}`)%3===0){
    const row=stableSeed(`${id}:poster-art:${col}`)%posterTitles.length;
    const pane=[shopEntry?split+.06:(l+r)/2+.035,r-.07,bottom,upper-.07];
    const poster=windowPoster({a,u,n,pane,row});
    if(poster){
      scene.objects.push({name:source.name+`_WindowPoster_${edge}_${col}`,...poster.mesh,material:materials.posterMaterial,extras:{sourceId:id,sceneModule:'Buildings',fictionalPoster:true}});
      state.windowPosters.push({sourceId:id,edge,bay:col,title:posterTitles[row],bounds:poster.bounds,pane,contentSource:'fictional-style-palette'});
    }
  }

  const fasciaBin=[BIN.door,BIN.fasciaTeal,BIN.fasciaCream][(seed+(col<door?0:1))%3];
  if(retail||shopBay)box(left+.12,right-.12,upper+.12,Math.min(top-.08,upper+.42),.025,.005,fasciaBin);
  if(shopEntry||retail&&entrance){
    const sign=signs.front[stableSeed(`${id}:shop:${col<door?'left':'right'}`)%signs.front.length];
    const signBottom=upper+.20,signTop=Math.min(top-.08,upper+.70);
    const signWidth=Math.min(bw-.36,(signTop-signBottom)*sign.aspect),center=(left+right)/2;
    const face=shopSignFace(a,u,n,center-signWidth/2,center+signWidth/2,signBottom,signTop,sign.uv);
    if(face){
      // Mount above the canopy (upper + .06 + .12), within this bay's solid header.
      box(center-signWidth/2-.025,center+signWidth/2+.025,signBottom-.015,signTop+.015,.03,.005,BIN.metal);
      scene.objects.push({name:source.name+`_ShopSign_${edge}_${col}`,...face,material:signMaterials[sign.style],extras:{sourceId:id,sceneModule:'Buildings',fictionalSign:true}});
      state.shopSigns.push({sourceId:id,edge,bay:col,text:sign.text,signId:sign.id,textSource:'fictional-style-palette',bounds:[center-signWidth/2,center+signWidth/2,signBottom,signTop]});
      if(stableSeed(`${id}:blade:${col}`)%3===0){
        const bladeSign=signs.blade[stableSeed(`${id}:blade-art:${col}`)%signs.blade.length],height=bladeHeight(bladeSign);
        const blade=shopBlade({a,u,n,along:left+.10,bottom:signBottom,top:signBottom+height,end:.08+height*bladeSign.aspect,uv:bladeSign.uv,obstacles:street.bladeBlocks});
        if(blade){
          out.emit(blade.housing,BIN.metal);street.bladeBlocks.push(...canopyObstacles([blade.footprint]));
          scene.objects.push({name:source.name+`_ShopBlade_${edge}_${col}`,...blade.faces,material:signMaterials[bladeSign.style],extras:{sourceId:id,sceneModule:'Buildings',fictionalSign:true}});
          state.shopBlades.push({sourceId:id,edge,bay:col,text:bladeSign.text,signId:bladeSign.id,textSource:'fictional-style-palette',footprint:blade.footprint,depth:blade.depth,bottom:signBottom,top:signBottom+height});
        }
      }
    }
    const canopy=shopCanopy(a,b,n,left+.12,right-.12,upper+.06,street.canopyBlocks);
    if(canopy){
      out.emit(canopy.mesh,fasciaBin);street.canopyBlocks.push(...canopyObstacles([canopy.footprint]));
      state.canopies.push({sourceId:id,objectName:source.name,edge,bay:col,depth:canopy.depth,footprint:canopy.footprint,base:upper+.06});
    }
    const standKey=`${id}:stand:${edge}:${col}`;
    if(stableSeed(standKey)%100<55){
      const entry=signs.standing[stableSeed(standKey+':art')%signs.standing.length];
      const probe=standingSign({a,u,n,along:l-.3,offset:1,sign:entry}),base=street.baseAt(probe.footprint);
      const stand=standingSign({a,u,n,along:l-.3,offset:1,sign:entry,base:base??0});
      if(base!==undefined&&street.fits(stand.footprint)){
        out.add(out.propMesh,stand.body);out.add(out.standingFaces[entry.style],stand.faces);street.propBlocks.push(...canopyObstacles([stand.footprint]));
        state.streetProps.standingSigns.push({sourceId:id,edge,bay:col,text:entry.text,signId:entry.id,textSource:'fictional-style-palette',footprint:stand.footprint,height:stand.height});
      }
    }
  }
  state.frontages.push({sourceId:id,edge,bay:col,type:loading?'loading-door':entrance?'street-door':'display-window',bounds:[l,r,bottom,upper],...(shopEntry?{shopDoorBounds:[l,split,0,upper]}:{})});
  if(entrance)state.layouts.push({sourceId:id,objectName:source.name,edge,bay:col,bottom:0,window:false,bounds:[l,r,0,upper]});
}
