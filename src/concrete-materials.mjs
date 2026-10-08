import {png} from './png.mjs';

// Shared, door-free surface tiles. Geometry alone owns openings. Every tile repeats without a
// seam: streaks and stains use whole periods of the tile, so walls show no line every 3 m.
export function surfaceTile(kind){
  const width=64,height=64,rgba=new Uint8Array(width*height*4),TAU=2*Math.PI;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const noise=((Math.imul(x+7,73856093)^Math.imul(y+19,19349663))>>>0)%11-5;
    // Rain streaks, strongest mid-tile and fading out at both ends.
    const drip=Math.max(0,Math.sin(x*TAU*7/width)+Math.sin(x*TAU*2/width)-.8)*Math.sin(Math.PI*y/height)**.8*14;
    // A soft grime band low in the tile, measured round the wrap so it joins the next tile.
    const d=Math.min(Math.abs(y-56),height-Math.abs(y-56)),foot=14*Math.exp(-d*d/50);
    let c;
    if(kind==='concrete')c=[145,145,141].map(v=>v+noise-drip-foot);
    if(kind==='plaster')c=[166,161,151].map(v=>v+noise*.65-drip-foot*.6);
    if(kind==='brick'){const seam=y%8<1||(x+(Math.floor(y/8)%2)*8)%16<1;c=seam?[95,88,76]:[133+noise,99+noise,78+noise];}
    if(kind==='metal'){const scratch=(x*13+y*7)%113===0?17:0;c=[86,92,89].map(v=>v+noise+scratch-foot*.5);}
    if(kind==='glass'){const reflection=4*Math.sin(x*Math.PI/32)+3*Math.cos(y*Math.PI/32);c=[35,53,60].map(v=>v+reflection+noise*.15);}
    if(kind==='roof')c=[73,77,73].map(v=>v+noise-(x%32===0||y%32===0?12:0));
    rgba.set([...c.map(v=>Math.max(0,Math.min(255,Math.round(v)))),255],(y*width+x)*4);
  }
  return {name:`Shared_${kind}_64`,width,height,rgba,png:png(width,height,rgba)};
}

// Painted sheet steel for the ground-floor kit (shutters, service doors, cabinets): near-white
// paint tinted per material, with broken rust clusters and vertical runoff. Covers 4 m and tiles
// seamlessly, so shutter slats sample one continuous field instead of repeating per slat.
export function weatheredPaintTile(){
  const size=128,rgba=new Uint8Array(size*size*4);
  const hash=(x,y,s)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(s,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
  // Value noise on a lattice of period size/cell in both axes, so the tile wraps.
  const noise=(x,y,cx,cy,s)=>{
    const px=size/cx,py=size/cy,fx=x/cx,fy=y/cy,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,u=tx*tx*(3-2*tx),v=ty*ty*(3-2*ty);
    const h=(i,j)=>hash(((ix+i)%px+px)%px,((iy+j)%py+py)%py,s);
    return (h(0,0)*(1-u)+h(1,0)*u)*(1-v)+(h(0,1)*(1-u)+h(1,1)*u)*v;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const wx=x+4.5*(noise(x,y,16,16,1)-.5),wy=y+4*(noise(x,y,16,16,2)-.5);
    const clusters=noise(wx,wy,16,16,3),broken=noise(wx,wy,2,4,4)*.55+noise(wx,wy,1,2,5)*.25+hash(x,y,6)*.2;
    const wear=clusters>.6&&broken>.66,stain=Math.max(0,noise(wx,wy,4,32,7)-.62)*26;
    const mottling=(noise(x,y,32,32,8)-.5)*12+(hash(x,y,9)-.5)*6-stain;
    // Rust is stored warm and bright; multiplied by a paint tint it reads as dark oxide.
    const color=wear?[212,153,121].map(v=>v-hash(x,y,10)*30):[235,235,232];
    rgba.set([...color.map(v=>Math.max(0,Math.min(255,Math.round(v+mottling)))),255],(y*size+x)*4);
  }
  return {name:'Shared_weathered_paint_128',width:size,height:size,rgba,png:png(size,size,rgba)};
}

// Vertical railing bars as an alpha-cut strip: one bar per tile width (0.155 m), charcoal
// steel with rust creeping up from the bottom. Used on a single double-sided panel per section.
export function railingBarsTile(){
  const width=16,height=64,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(x<6||x>8)continue;
    const noise=((Math.imul(x+3,73856093)^Math.imul(y+7,19349663))>>>0)%7-3,rust=y>54&&(x+y)%3!==0;
    rgba.set([...(rust?[96,58,34]:[62,68,65]).map(v=>v+noise+(x===6?12:0)),255],(y*width+x)*4);
  }
  return {name:'Railing_bars_16x64',width,height,rgba,png:png(width,height,rgba)};
}

export function surfaceUV(mesh,anchor,scale=3,offset=0){
  const texcoords=[];
  for(let i=0;i<mesh.positions.length;i+=3){const x=mesh.positions[i]-anchor[0],y=mesh.positions[i+1],z=mesh.positions[i+2]-anchor[1],nx=mesh.normals[i],ny=mesh.normals[i+1];texcoords.push((Math.abs(ny)>.5?x:Math.abs(nx)>.5?z:x)/scale+offset,Math.abs(ny)>.5?z/scale:-y/scale);}
  return {...mesh,texcoords};
}

export function compactMaterials(scene){
  const used=[...new Set(scene.objects.map(o=>o.material))],map=new Map(used.map((v,i)=>[v,i]));
  scene.materials=used.map(i=>scene.materials[i]);scene.objects=scene.objects.map(o=>({...o,material:map.get(o.material)}));
  const images=[...new Set(scene.materials.flatMap(m=>[m.pbrMetallicRoughness.baseColorTexture?.index,m.emissiveTexture?.index].filter(i=>i!==undefined)))],textureMap=new Map(images.map((v,i)=>[v,i]));
  scene.textures=images.map(i=>scene.textures[i]);
  scene.materials=scene.materials.map(m=>({...m,pbrMetallicRoughness:{...m.pbrMetallicRoughness,...(m.pbrMetallicRoughness.baseColorTexture?{baseColorTexture:{index:textureMap.get(m.pbrMetallicRoughness.baseColorTexture.index)}}:{})},...(m.emissiveTexture?{emissiveTexture:{index:textureMap.get(m.emissiveTexture.index)}}:{})}));
}

