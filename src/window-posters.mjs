import {png} from './png.mjs';
import {signFont} from './shop-signs.mjs';
export const posterTitles=['VIDEO','LIVE','RADIO','SALE'];
export function posterAtlas(){
 const width=128,height=192,rgba=new Uint8Array(width*height*4);
 const palette=[[55,79,82],[99,55,53],[56,60,79],[129,111,64]],paper=[215,205,174];
 for(let tile=0;tile<4;tile++){
  const ox=tile%2*64,oy=Math.floor(tile/2)*96;
  const set=(x,y,c)=>rgba.set([...c.map(v=>Math.max(0,Math.min(255,v))),255],((oy+y)*width+ox+x)*4);
  for(let y=0;y<96;y++)for(let x=0;x<64;x++){
   const border=x<3||x>60||y<3||y>92,noise=(x*13+y*7+tile)%7-3;
   set(x,y,(border?paper:palette[tile]).map(v=>v+noise));
  }
  const title=posterTitles[tile],start=Math.floor((64-(title.length*6-1)*2)/2);
  for(let i=0;i<title.length;i++)for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(signFont[title[i]][y][x]==='1')for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)set(start+i*12+x*2+dx,10+y*2+dy,paper);
  for(let y=33;y<71;y++)for(let x=9;x<55;x++){
   let ink=false;
   if(tile===0)ink=(x<12||x>51||y<36||y>67)||((x<19||x>44)&&y%8<3);
   if(tile===1)ink=Math.abs(Math.hypot((x-32)*1.2,y-52)-15)<2||Math.abs(Math.hypot((x-32)*1.2,y-52)-8)<2;
   if(tile===2)ink=Math.abs(y-52)<(3+Math.abs(Math.sin(x*.6))*13)&&x%4<2;
   if(tile===3)ink=(x+y)%16<5;
   if(ink)set(x,y,paper);
  }
  for(const y of [78,83,87])for(let x=12;x<52-(y%3)*5;x++)set(x,y,paper.map(v=>v-35));
 }
 return {name:'Shared_window_posters_128x192',width,height,rgba,png:png(width,height,rgba)};
}
export function windowPoster({a,u,n,pane,row}){
 const [l,r,b,t]=pane,width=.54,height=.81,right=r-.10,left=right-width,bottom=Math.max(.8,b+.15),top=bottom+height;
 if(left<l+.10||top>t-.12)return null;
 const p=(x,y)=>[a[0]+u[0]*x-n[0]*.105,y,a[1]+u[1]*x-n[1]*.105];
 const points=[p(left,bottom),p(right,bottom),p(right,top),p(left,top)],positive=-u[1]*n[0]+u[0]*n[1]>0;
 const order=positive?[0,1,2,0,2,3]:[0,2,1,0,3,2];
 const x0=(row%2*64+.5)/128,x1=(row%2*64+63.5)/128,y0=(Math.floor(row/2)*96+.5)/192,y1=(Math.floor(row/2)*96+95.5)/192;
 const uv=[[positive?x0:x1,y1],[positive?x1:x0,y1],[positive?x1:x0,y0],[positive?x0:x1,y0]];
 return {bounds:[left,right,bottom,top],mesh:{positions:order.flatMap(i=>points[i]),normals:order.flatMap(()=>[n[0],0,n[1]]),texcoords:order.flatMap(i=>uv[i])}};
}
