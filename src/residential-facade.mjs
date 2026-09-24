import {stableSeed} from './architecture.mjs';
import {insidePolygon,polygonsOverlap,strip} from './spatial.mjs';
const profiles=[
 {name:'slender-windows',bayWidth:3.2,windowWidth:1.05,sill:.85,head:.48,balconies:'edges'},
 {name:'wide-windows',bayWidth:3.6,windowWidth:1.75,sill:.95,head:.55,balconies:'none'},
 {name:'grouped-loggias',bayWidth:3.4,windowWidth:1.25,sill:.8,head:.45,balconies:'paired'},
 // Square panel-block windows, listed twice so they make up about two in five residential blocks.
 {name:'square-windows',bayWidth:3.0,windowWidth:1.2,sill:1.0,head:.8,balconies:'none'},
 {name:'square-windows',bayWidth:3.0,windowWidth:1.2,sill:1.0,head:.8,balconies:'none'}
];
export function residentialFacade(id){return profiles[stableSeed(`${id}:residential-layout`)%profiles.length];}
export function residentialBalcony(profile,bay,bays){
 if(bays<5)return false;
 if(profile.balconies==='edges')return bay===1||bay===bays-2;
 if(profile.balconies==='paired')return bay%5===1||bay%5===2;
 return false;
}
export function balconyFits(ring,holes,a,b,out,left,right){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.01)return false;
 const u=[(b[0]-a[0])/length,(b[1]-a[1])/length],point=(x,d)=>[a[0]+u[0]*x-out[0]*d,a[1]+u[1]*x-out[1]*d];
 // Include backing-wall clearance beyond the 1.15 m recess.
 const box=[point(left,.02),point(right,.02),point(right,1.4),point(left,1.4)];
 if(!box.every(p=>insidePolygon(p,ring))||holes.some(h=>polygonsOverlap(box,h)))return false;
 for(let i=0;i<ring.length-1;i++){const boundary=strip(ring[i],ring[i+1],.001);if(boundary&&polygonsOverlap(box,boundary))return false;}
 return true;
}
