export function normalizeLongitude(value){
  if(!Number.isFinite(value))return value;
  return Number(((((value+180)%360)+360)%360-180).toFixed(12));
}

export function normalizeBounds(values){
  if(!Array.isArray(values)||values.length!==4)return values;
  return [normalizeLongitude(values[0]),values[1],normalizeLongitude(values[2]),values[3]];
}

export function boundsFromCorners(first,second){
  const a=normalizeLongitude(first.lng),b=normalizeLongitude(second.lng);
  return [Math.min(a,b),Math.min(first.lat,second.lat),Math.max(a,b),Math.max(first.lat,second.lat)].map(v=>Number(v.toFixed(6)));
}

// Checks a west,south,east,north selection. `error` is a message key for the page's
// translations (see i18n.js), empty when the selection is valid.
export function validateSelection(values,limit){
  const [w,s,e,n]=values??[],finite=[w,s,e,n].every(Number.isFinite);
  let distance=NaN,error='',invalid=[];
  if(!finite){error='incomplete';invalid=['west','south','east','north'].filter((_,i)=>!Number.isFinite([w,s,e,n][i]));}
  else if(w< -180||e>180){error='longitudeRange';invalid=['west','east'];}
  else if(s< -85||n>85){error='latitudeRange';invalid=['south','north'];}
  else if(w>=e){error='westEast';invalid=['west','east'];}
  else if(s>=n){error='southNorth';invalid=['south','north'];}
  else {
    distance=Math.hypot((e-w)*111195*Math.cos((s+n)/2*Math.PI/180),(n-s)*111195);
    if(distance>limit){error='tooLarge';invalid=['west','south','east','north'];}
  }
  return {valid:!error,distance,error,invalid};
}

// Four-point areas. The same rules as src/area.mjs: counter-clockwise order, convex, no
// crossing edges, and the size limit applies to the bounding box diagonal.
const turn=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
const turnAt=(points,i)=>turn(points[(i+points.length-1)%points.length],points[i],points[(i+1)%points.length]);
export function normalizeArea(points){
  const rounded=points.map(([lon,lat])=>[Number(normalizeLongitude(lon).toFixed(6)),Number(lat.toFixed(6))]);
  return turnAt(rounded,0)<0?rounded.reverse():rounded;
}
export function areaBounds(points){
  const lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
  return [Math.min(...lons),Math.min(...lats),Math.max(...lons),Math.max(...lats)];
}
export function validateAreaSelection(points,limit){
  if(!Array.isArray(points)||points.length!==4||points.some(p=>!p.every(Number.isFinite)))return {valid:false,distance:NaN,error:'areaIncomplete'};
  const turns=points.map((_,i)=>turnAt(points,i));
  let total=0;
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    let d=Math.atan2(c[1]-b[1],c[0]-b[0])-Math.atan2(b[1]-a[1],b[0]-a[0]);
    while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;total+=d;
  }
  const convex=turns.every(t=>Math.abs(t)>1e-14)&&(turns.every(t=>t>0)||turns.every(t=>t<0))&&Math.abs(Math.abs(total)-2*Math.PI)<1e-6;
  const b=areaBounds(points),result=validateSelection(b,limit);
  if(!convex)return {valid:false,distance:result.distance,error:'notConvex'};
  return {valid:result.valid,distance:result.distance,error:result.error};
}
