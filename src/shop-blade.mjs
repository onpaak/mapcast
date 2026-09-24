import {extrude} from './geometry.mjs';
import {polygonsOverlap} from './spatial.mjs';
import {shopSignFace} from './shop-signs.mjs';

// Double-sided projecting sign. Defaults are the small shopfront blade; taller
// vertical signs pass a shallower depth and thicker housing.
export function shopBlade({a,u,n,along,bottom,top,uv,obstacles,end=1.18,start=.08,half=.025}){
  if(bottom<2.6||top-bottom<.18||![...a,...u,...n,along,bottom,top].every(Number.isFinite))return null;
  const p=(depth,side)=>[a[0]+u[0]*(along+side)+n[0]*depth,a[1]+u[1]*(along+side)+n[1]*depth];
  // Include the bracket and a small clearance around the housing in occupancy.
  const footprint=[p(.005,-half-.03),p(end+.02,-half-.03),p(end+.02,half+.03),p(.005,half+.03)];
  if(obstacles.some(o=>polygonsOverlap(footprint,o.ring)))return null;
  const housing=extrude([p(start,-half),p(end,-half),p(end,half),p(start,half)],top-bottom,bottom);
  const brackets=(top-bottom>1?[bottom+.15,top-.21]:[(bottom+top)/2-.03]).map(y=>extrude([p(.005,-.025),p(start,-.025),p(start,.025),p(.005,.025)],.06,y));
  const bracket={positions:brackets.flatMap(m=>m.positions),normals:brackets.flatMap(m=>m.normals)};
  const front=shopSignFace(p(start,0),n,u,0,end-start,bottom+.005,top-.005,uv,half+.008);
  const back=shopSignFace(p(end,0),n.map(v=>-v),u.map(v=>-v),0,end-start,bottom+.005,top-.005,uv,half+.008);
  if(!front||!back)return null;
  return {footprint,depth:end,housing:{positions:[...housing.positions,...bracket.positions],normals:[...housing.normals,...bracket.normals]},faces:{positions:[...front.positions,...back.positions],normals:[...front.normals,...back.normals],texcoords:[...front.texcoords,...back.texcoords]}};
}
