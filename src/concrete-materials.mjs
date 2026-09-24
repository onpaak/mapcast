import {png} from './png.mjs';

// Shared, door-free surface tiles. Geometry alone owns openings.
export function surfaceTile(kind){
  const width=64,height=64,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const noise=((Math.imul(x+7,73856093)^Math.imul(y+19,19349663))>>>0)%11-5;
    const drip=Math.max(0,Math.sin(x*.71)+Math.sin(x*.23)-.8)*(y/64)*19;
    const foot=Math.pow(y/63,5)*20;
    let c;
    if(kind==='concrete')c=[145,145,141].map(v=>v+noise-drip-foot);
    if(kind==='plaster')c=[166,161,151].map(v=>v+noise*.65-drip-foot*.6);
    if(kind==='brick'){const seam=y%10<1||(x+(Math.floor(y/10)%2)*12)%24<1;c=seam?[95,88,76]:[133+noise,99+noise,78+noise];}
    if(kind==='metal'){const scratch=(x*13+y*7)%113===0?17:0;c=[86,92,89].map(v=>v+noise+scratch-foot*.5);}
    if(kind==='glass'){const reflection=4*Math.sin(x*Math.PI/32)+3*Math.cos(y*Math.PI/32);c=[35,53,60].map(v=>v+reflection+noise*.15);}
    if(kind==='roof')c=[73,77,73].map(v=>v+noise-(x%32===0||y%32===0?12:0));
    rgba.set([...c.map(v=>Math.max(0,Math.min(255,Math.round(v)))),255],(y*width+x)*4);
  }
  return {name:`Shared_${kind}_64`,width,height,rgba,png:png(width,height,rgba)};
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

