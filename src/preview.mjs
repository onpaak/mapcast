// Small CPU rasterizer for asset inspection, not a Blender/Unreal render.
import {png} from './png.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function renderPreview(scene,{width=960,height=540,eye=scene.metadata.previewCamera?.eye??[0,4,85],target=scene.metadata.previewCamera?.target??[0,5,-70],fogDistance=350,ambient=.52,direct=.48,sunDirection=[-.4,.8,.25],skyTop=[55,65,95],skyBottom=[100,103,115],fogColor=[94,94,110]}={}){
  const forward=norm(sub(target,eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward),scale=height*.86;
  const rgba=new Uint8Array(width*height*4),depth=new Float64Array(width*height).fill(Infinity);
  const fog=fogColor;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const t=y/height;rgba.set([...skyTop.map((value,index)=>value+(skyBottom[index]-value)*t),255],(y*width+x)*4);}
  const sun=norm(sunDirection);
  for(const obj of scene.objects){
    const mat=scene.materials[obj.material],base=mat.pbrMetallicRoughness.baseColorFactor,texture=scene.textures?.[mat.pbrMetallicRoughness.baseColorTexture?.index],glow=scene.textures?.[mat.emissiveTexture?.index];
    for(let i=0;i<obj.positions.length;i+=9){
      const normal=obj.normals.slice(i,i+3);let poly=[];
      for(let k=0;k<3;k++){
        const p=sub(obj.positions.slice(i+k*3,i+k*3+3),eye),index=i/3+k;
        poly.push([dot(p,right),dot(p,up),dot(p,forward),...(obj.texcoords?.slice(index*2,index*2+2)??[0,0])]);
      }
      const clipped=[];
      for(let k=0;k<poly.length;k++){
        const a=poly[k],b=poly[(k+1)%poly.length],ia=a[2]>=.2,ib=b[2]>=.2;
        if(ia)clipped.push(a);
        if(ia!==ib){const t=(.2-a[2])/(b[2]-a[2]);clipped.push(a.map((v,j)=>v+(b[j]-v)*t));}
      }
      if(clipped.length<3)continue;
      const light=ambient+direct*Math.max(0,dot(normal,sun));
      for(let k=1;k<clipped.length-1;k++){
        const tri=[clipped[0],clipped[k],clipped[k+1]].map(v=>[width/2+v[0]/v[2]*scale,height/2-v[1]/v[2]*scale,v[2],v[3],v[4]]);
        const [a,b,c]=tri,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
        const minX=Math.max(0,Math.floor(Math.min(...tri.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...tri.map(p=>p[0]))));
        const minY=Math.max(0,Math.floor(Math.min(...tri.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...tri.map(p=>p[1]))));
        for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
          const w0=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,w1=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,w2=1-w0-w1;
          if(w0<0||w1<0||w2<0)continue;
          const z=1/(w0/a[2]+w1/b[2]+w2/c[2]),px=y*width+x;if(z>=depth[px])continue;depth[px]=z;
          let color=base.slice(0,3).map(v=>v*255),emission=(mat.emissiveFactor??[0,0,0]).map(v=>v*90);
          const u=(w0*a[3]/a[2]+w1*b[3]/b[2]+w2*c[3]/c[2])*z,v=(w0*a[4]/a[2]+w1*b[4]/b[2]+w2*c[4]/c[2])*z;
          const sample=image=>{const tx=Math.floor(((u%1)+1)%1*image.width),ty=Math.floor(((v%1)+1)%1*image.height);return Array.from(image.rgba.slice((ty*image.width+tx)*4,(ty*image.width+tx)*4+3));};
          if(texture)color=sample(texture).map((value,index)=>value*base[index]);
          if(glow)emission=sample(glow).map((value,index)=>value*mat.emissiveFactor[index]);
          const f=1-Math.exp(-z/fogDistance);
          rgba.set([...color.map((v,j)=>Math.min(255,Math.max(0,(v*light+emission[j])*(1-f)+fog[j]*f))),255],px*4);
        }
      }
    }
  }
  return png(width,height,rgba);
}
