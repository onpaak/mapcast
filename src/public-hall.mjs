// Concrete structural bays stay inside the source footprint. Recess depth is
// selected by the caller after checking the actual building and courtyard rings.
export function publicHallEdge({length,height,front,recessFits,box,panel}){
 const bays=Math.max(1,Math.floor(length/4.2)),width=length/bays,entryBay=Math.floor(bays/2),tiers=Math.max(1,Math.ceil(height/9)),tierHeight=height/tiers,openings=[];
 for(let tier=0;tier<tiers;tier++)for(let bay=0;bay<bays;bay++){
  const left=bay*width,right=(bay+1)*width,y=tier*tierHeight,top=(tier+1)*tierHeight,entry=front&&tier===0&&bay===entryBay;
  const pier=Math.min(.55,width*.2),l=left+pier,r=right-pier,upper=top-Math.min(1,tierHeight*.2),bottom=entry?0:front?y+.45:Math.max(y+.45,upper-1.5),depth=front&&recessFits(l,r)?-.85:-.18;
  box(left,l,y,top);box(r,right,y,top);box(l,r,y,bottom);box(l,r,upper,top);
  // Deep reveals enclose the opening rather than leaving holes beside the glass.
  box(l,l+.10,bottom,upper,0,depth-.08,1);box(r-.10,r,bottom,upper,0,depth-.08,1);
  box(l,r,upper-.08,upper,0,depth-.08,1);if(!entry)box(l,r,bottom,bottom+.10,0,depth-.08);
  if(entry){
   const doorWidth=Math.min(1.8,r-l-.22),dl=(l+r-doorWidth)/2,dr=dl+doorWidth,doorTop=Math.min(2.4,upper-.25);
   box(l,dl,0,upper,depth,depth-.16);box(dr,r,0,upper,depth,depth-.16);
   box(dl,dr,0,doorTop,depth+.025,depth-.1,9);
   panel(dl,dr,doorTop+.22,upper,depth,2);box(dl,dr,doorTop,doorTop+.22,depth+.03,depth-.12);
   box(dl-.06,dl,0,doorTop+.06,depth+.08,depth-.10,3);box(dr,dr+.06,0,doorTop+.06,depth+.08,depth-.10,3);
   box(dl,dr,doorTop,doorTop+.06,depth+.08,depth-.1,3);
   box((dl+dr)/2-.025,(dl+dr)/2+.025,0,doorTop,depth+.06,depth+.03,3);
   for(const x of [(dl+dr)/2-.14,(dl+dr)/2+.10])box(x,x+.04,1,1.3,depth+.12,depth+.07,3);
   openings.push({type:'public-entrance',bay,bounds:[dl,dr,0,doorTop],depth});
  }else{
   panel(l,r,bottom,upper,depth,2);
   for(const x of [l,(l+r)/2-.035,r-.07])panel(x,x+.07,bottom,upper,depth+.02,3);
   panel(l,r,bottom,bottom+.07,depth+.02,3);panel(l,r,upper-.07,upper,depth+.02,3);
   if(front)panel(l,r,y+(upper-y)*.55,y+(upper-y)*.55+.065,depth+.025,3);
   openings.push({type:front?'hall-high-window':'hall-clerestory',bay,bounds:[l,r,bottom,upper],depth});
  }
  if(bay>0)panel(left,left+.018,y,top,.003,4);
 }
 box(0,length,height,height+.25,0,-.25);
 return openings;
}
