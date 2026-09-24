// Weld only identical complete vertices. Normals and UV seams remain separate.
export function indexMesh(positions,normals,texcoords){
  if(!positions.length||positions.length%9||normals.length!==positions.length||texcoords&&texcoords.length!==positions.length/3*2)throw new Error('Invalid triangle attribute lengths');
  const result={positions:[],normals:[],...(texcoords?{texcoords:[]}:{}),indices:[]},vertices=new Map();
  for(let i=0;i<positions.length/3;i++){
    const p=positions.slice(i*3,i*3+3).map(Math.fround),n=normals.slice(i*3,i*3+3).map(Math.fround),uv=texcoords?texcoords.slice(i*2,i*2+2).map(Math.fround):[];
    if([...p,...n,...uv].some(v=>!Number.isFinite(v)))throw new Error('Invalid mesh attribute');
    const key=[...p,...n,...uv].map(v=>Object.is(v,-0)?'-0':String(v)).join(','),known=vertices.get(key);
    if(known!==undefined){result.indices.push(known);continue;}
    const index=result.positions.length/3;vertices.set(key,index);result.positions.push(...p);result.normals.push(...n);if(texcoords)result.texcoords.push(...uv);result.indices.push(index);
  }
  return result;
}

// Drop degenerate triangles: under 1 mm² or with an edge under 0.1 mm once stored as
// float32 (vertices can merge in the GLB). Invisible, and engines warn about them on import.
// An object made only of such triangles is kept as is rather than emptied.
export function dropDegenerate(object){
  const keep=[],p=object.positions.map(Math.fround);
  for(let t=0;t<p.length/9;t++){
    const i=t*9,a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]],c=[p[i+6]-p[i+3],p[i+7]-p[i+4],p[i+8]-p[i+5]];
    const area=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2,edge=Math.min(Math.hypot(...a),Math.hypot(...b),Math.hypot(...c));
    if(area>=1e-6&&edge>=1e-4)keep.push(t);
  }
  if(!keep.length||keep.length===p.length/9)return object;
  const pick=(values,size)=>values&&keep.flatMap(t=>values.slice(t*3*size,(t+1)*3*size));
  return {...object,positions:pick(object.positions,3),normals:pick(object.normals,3),...(object.texcoords?{texcoords:pick(object.texcoords,2)}:{})};
}

export function encodeGLB(objects,materials,extras={},textures=[]) {
  const chunks=[],bufferViews=[],accessors=[]; let byteLength=0;
  function attribute(values,size=3) {
    if(!values.length || values.some(v=>!Number.isFinite(v))) throw new Error('Invalid mesh attribute');
    const data=Buffer.alloc(values.length*4); values.forEach((v,i)=>data.writeFloatLE(v,i*4));
    const view=bufferViews.length; bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:data.length,target:34962});
    chunks.push(data); byteLength+=data.length;
    const min=Array(size).fill(Infinity),max=Array(size).fill(-Infinity);
    values.forEach((v,i)=>{v=Math.fround(v);min[i%size]=Math.min(min[i%size],v);max[i%size]=Math.max(max[i%size],v);});
    accessors.push({bufferView:view,componentType:5126,count:values.length/size,type:`VEC${size}`,min,max});return accessors.length-1;
  }
  function indices(values,vertexCount){
    const small=vertexCount<=65536,bytes=small?2:4,data=Buffer.alloc(values.length*bytes);
    values.forEach((v,i)=>small?data.writeUInt16LE(v,i*bytes):data.writeUInt32LE(v,i*bytes));
    const view=bufferViews.length;bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:data.length,target:34963});
    const padding=Buffer.alloc((4-data.length%4)%4);chunks.push(data,padding);byteLength+=data.length+padding.length;
    accessors.push({bufferView:view,componentType:small?5123:5125,count:values.length,type:'SCALAR',min:[0],max:[vertexCount-1]});return accessors.length-1;
  }
  // Instanced assets share one mesh; each node carries its translation and optional yaw about y.
  const meshes=[],meshIndices=[],translations=[],rotations=[],assetMeshes=new Map();
  for(const source of objects){
    const object=dropDegenerate(source),origin=object.extras?.instanceOrigin,yaw=origin?object.extras?.instanceYaw??0:0,c=Math.cos(yaw),sn=Math.sin(yaw),assetKey=object.extras?.assetKey,key=assetKey?`${assetKey}:${object.material}`:undefined;let mesh=key===undefined?undefined:assetMeshes.get(key);
    if(mesh===undefined){
      // World = origin + R(yaw)·local, so local = R(-yaw)·(world - origin).
      const unrotate=(values,offset=[0,0,0])=>{const out=[];for(let i=0;i<values.length;i+=3){const x=values[i]-offset[0],y=values[i+1]-offset[1],z=values[i+2]-offset[2];out.push(x*c-z*sn,y,x*sn+z*c);}return out;};
      const positions=origin?unrotate(object.positions,origin):object.positions,normals=origin&&yaw?unrotate(object.normals):object.normals;
      const indexed=indexMesh(positions,normals,object.texcoords),count=indexed.positions.length/3;
      const savings=(positions.length-indexed.positions.length)/3*(object.texcoords?32:24)-indexed.indices.length*(count<=65536?2:4),data=savings>0?indexed:{positions,normals,texcoords:object.texcoords};
      mesh=meshes.length;meshes.push({name:assetKey??object.name,primitives:[{attributes:{POSITION:attribute(data.positions),NORMAL:attribute(data.normals),...(data.texcoords?{TEXCOORD_0:attribute(data.texcoords,2)}:{})},...(savings>0?{indices:indices(indexed.indices,count)}:{}),material:object.material}]});if(key!==undefined)assetMeshes.set(key,mesh);
    }
    meshIndices.push(mesh);translations.push(origin);rotations.push(yaw?[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]:undefined);
  }
  const images=textures.map(t=>{const view=bufferViews.length;bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:t.png.length});const pad=Buffer.alloc((4-t.png.length%4)%4);chunks.push(t.png,pad);byteLength+=t.png.length+pad.length;return {name:t.name,bufferView:view,mimeType:'image/png'};});
  const nodes=objects.map((o,i)=>({name:o.name,mesh:meshIndices[i],...(translations[i]?{translation:translations[i]}:{}),...(rotations[i]?{rotation:rotations[i]}:{}),extras:o.extras??{}}));
  const doc={asset:{version:'2.0',generator:'Mapcast 0.1'},scene:0,scenes:[{nodes:nodes.map((_,index)=>index)}],nodes,meshes,materials,bufferViews,accessors,buffers:[{byteLength}],extras};
  const extensionsUsed=[...new Set(materials.flatMap(m=>Object.keys(m.extensions??{})))];
  if(extensionsUsed.length)doc.extensionsUsed=extensionsUsed;
  // Sampler 0 is nearest (crisp pixel art); sampler 1 is trilinear for textures marked filter:'linear'.
  // Unreal's glTF importer reads only minFilter and maps just plain NEAREST to point sampling,
  // so sampler 0 must not use a mipmap variant.
  if(textures.length)Object.assign(doc,{images,textures:textures.map((t,i)=>({source:i,sampler:t.filter==='linear'?1:0})),samplers:[{magFilter:9728,minFilter:9728,wrapS:10497,wrapT:10497},{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}]});
  const json=Buffer.from(JSON.stringify(doc));const padding=(4-json.length%4)%4;
  const jsonChunk=Buffer.concat([json,Buffer.alloc(padding,32)]),bin=Buffer.concat(chunks);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+bin.length,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jsonChunk,binHeader,bin]);
}
