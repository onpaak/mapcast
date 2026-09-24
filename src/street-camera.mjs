import {insidePolygon} from './spatial.mjs';

export function streetCamera(segments,footprints){
 const centers=footprints.map(r=>{const p=r.slice(0,-1);return p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]);});
 let best;
 for(const s of segments){
  const length=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);if(length<25)continue;
  for(const reverse of [false,true]){
   const a=reverse?s.b:s.a,b=reverse?s.a:s.b,u=[(b[0]-a[0])/length,(b[1]-a[1])/length];
   const eye=[a[0]+u[0]*length*.18,a[1]+u[1]*length*.18];
   if(footprints.some(r=>insidePolygon(eye,r)))continue;
   let score=0,left=0,right=0;
   for(const c of centers){const dx=c[0]-eye[0],dz=c[1]-eye[1],along=dx*u[0]+dz*u[1],side=dx*-u[1]+dz*u[0];if(along>5&&along<150&&Math.abs(side)<65){score+=(1-along/200)*(1-Math.abs(side)/100);if(side<0)left++;else right++;}}
   score+=Math.min(left,right)*1.5;
   // Prefer a view toward the selected area's interior when density is similar.
   score+=Math.min(2,(-eye[0]*u[0]-eye[1]*u[1])/100);
   const key=[...eye,...u].map(v=>v.toFixed(5)).join(',');
   if(!best||score>best.score||score===best.score&&key<best.key){const distance=Math.min(80,length*.7);best={score,key,eye:[eye[0],3,eye[1]],target:[eye[0]+u[0]*distance,4.5,eye[1]+u[1]*distance]};}
  }
 }
 return best?{eye:best.eye,target:best.target}:null;
}
