import {png} from './png.mjs';
import {extrude,roadSegments} from './geometry.mjs';
import {blocked,insidePolygon} from './spatial.mjs';
import {streetLampMeshes,placeLamp,lampYaw,lampLightOffset} from './street-lamp.mjs';
import {sidewalks,buildingDetails} from './streetscape.mjs';
import {roadFaceRings} from './pavement-clip.mjs';
import {resolveRoadSurfaces} from './road-surfaces.mjs';
import {streetCamera} from './street-camera.mjs';
import {buildingProfile,architectureTexture,architectureTextureKey,facadeUV} from './architecture.mjs';
import {junctionPatches,roadSurface} from './road-network.mjs';
import {terrainHeightLocal,roadbedHeightLocal} from './terrain.mjs';
function texture(name,kind){
  const width=128,height=128,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const noise=((Math.imul(x+13,73856093)^Math.imul(y+7,19349663))>>>0)%13-6;
    let c;
    if(kind==='road')c=[53+noise,55+noise,61+noise];
    else if(kind==='grass'){
      c=[48+noise,68+noise*2,43+noise];if((x*5+y*3)%47<3)c=[35,53,34];
    }
    else if(kind==='water'){
      const band=(y+Math.floor(x/5))%24<2;c=band?[54+noise,91+noise,103+noise]:[32+noise,67+noise,79+noise];
    }
    else if(kind==='woodland'){
      c=[31+noise,52+noise,33+noise];if((x*11+y*7)%61<5)c=[24,43,28];
    }
    else if(kind==='ground'){
      c=[67+noise,70+noise,57+noise];if((x*13+y*17)%71<5)c=[53,57,48];
    }
    else if(kind==='shop'){
      c=[91+noise,84+noise,74+noise];
      if(y<26)c=[58+noise,92+noise,94+noise];
      if(y>=26&&y<34)c=[148,139,108];
      if(y>=38&&y<118){
        c=[28+noise,44+noise,52+noise];
        if(x<6||x>121||x===42||x===85||y===78)c=[103,101,87];
        if(x>90&&x<94&&y>78&&y<90)c=[169,149,102];
        if((x+y*2)%93<3)c=[55,68,75];
      }
      if(y>=118)c=[56+noise,58+noise,60+noise];
    }
    else {
      c=kind==='warm'?[128+noise,112+noise,97+noise]:[98+noise,110+noise,119+noise];
      const xx=x%32,yy=y%64;
      if(yy>13&&yy<49&&xx>7&&xx<25){
        const lit=((Math.floor(x/32)+Math.floor(y/64)*3)%3===0);
        c=lit?[182+noise,151+noise,91+noise]:[37+noise,48+noise,61+noise];
        if(xx===16||yy===31)c=[61,62,63];
        if(xx===8||xx===24||yy===14||yy===48)c=[75,75,72];
      }
      if(yy>58)c=[72+noise,74+noise,74+noise];
    }
    rgba.set([...c,255],(y*width+x)*4);
  }
  return {name,width,height,rgba,png:png(width,height,rgba)};
}
function uv(mesh,facade=false,repeatMeters=8){
  const texcoords=[];
  for(let i=0;i<mesh.positions.length;i+=3){const [x,y,z]=mesh.positions.slice(i,i+3),[nx,,nz]=mesh.normals.slice(i,i+3);texcoords.push(facade? (Math.abs(nx)>Math.abs(nz)?z:x)/8:x/repeatMeters,facade?-y/6:z/repeatMeters);}
  return {...mesh,texcoords};
}
// Pavement slabs are 0.15 m thick on a 0.025 m ground offset (streetscape.mjs).
export const PAVEMENT_TOP=.175;
function box(x,y,z,w,h,d){return extrude([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]],h,y);}
// options.buildingDetails: false skips cornices, sills, entrances and roof units for callers
// that replace every building anyway (the concrete city).
export function stylePS2(scene,{buildingDetails:details=true}={}){
  const textures=[texture('Asphalt128','road'),texture('FacadeWarm128','warm'),texture('FacadeCool128','cool'),texture('Storefront128','shop'),texture('Grass128','grass'),texture('Water128','water'),texture('Woodland128','woodland'),texture('Ground128','ground')];
  const materials=scene.materials.map(m=>structuredClone(m));
  for(const [m,t] of [[1,0],[2,1],[3,2]]){materials[m].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];materials[m].pbrMetallicRoughness.baseColorTexture={index:t};}
  materials[0].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];materials[0].pbrMetallicRoughness.baseColorTexture={index:7};
  for(const [m,t] of [[4,4],[5,5],[6,6]]){materials[m].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];materials[m].pbrMetallicRoughness.baseColorTexture={index:t};}
  const add=(name,color,emissiveFactor)=>{materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:0,roughnessFactor:1},...(emissiveFactor?{emissiveFactor}:{})});return materials.length-1;};
  const roof=add('Roof',[.22,.24,.26]),paint=add('Worn lane paint',[.65,.59,.39]),metal=add('Lamp metal',[.42,.43,.42]),glow=add('Lamp glow',[.9,.92,.95],[.85,.92,1]);
  // Cool white lamps read as light sources at night; strength above 1 lets engines bloom them.
  materials[glow].extensions={KHR_materials_emissive_strength:{emissiveStrength:3}};
  const pavement=add('Concrete sidewalk',[.40,.39,.36]),trim=add('Roof coping',[.36,.34,.32]),equipment=add('Roof equipment',[.28,.32,.34]);
  const entranceMaterials={door:add('Entrance door',[.23,.16,.11]),glass:add('Entrance glass',[.10,.16,.19]),frame:add('Entrance frame',[.13,.14,.14]),handle:add('Door handle brass',[.67,.53,.25])};
  const shop=add('Storefront',[1,1,1]);materials[shop].pbrMetallicRoughness.baseColorTexture={index:3};
  // The ground keeps four finishes: road, paving, the base ground and green areas (plus water).
  // Every carriageway is asphalt whatever its mapped surface, so streets, junctions and entrances
  // join without seams; the mapped surface is still recorded on each road (surfaceKind).
  const roadSurfaceMaterials={asphalt:1,stone:1,concrete:1,dirt:1};
  const objects=[],appearances=[],buildingMaterials=new Map(),textureCache=new Map(),materialCache=new Map();
  function appearanceMaterial(profile,ground){
    const textureKey=architectureTextureKey(profile,ground);let index=textureCache.get(textureKey);
    if(index===undefined){index=textures.length;textures.push(architectureTexture(profile,ground));textureCache.set(textureKey,index);}
    const palette=profile.templateColor;
    const tint=profile.color.map((v,i)=>Math.min(1,v/palette[i])),materialKey=`${index}:${tint.map(v=>v.toFixed(3)).join(',')}`;let material=materialCache.get(materialKey);
    if(material===undefined){material=add(`${textureKey}_${tint.map(v=>Math.round(v*255)).join('-')}`,tint);materials[material].pbrMetallicRoughness.baseColorTexture={index};materialCache.set(materialKey,material);}
    return material;
  }
  for(const o of scene.objects){
    if(o.name.startsWith('Building_')){
      const walls={positions:[],normals:[]},caps={positions:[],normals:[]};
      for(let i=0;i<o.positions.length;i+=9){const dst=Math.abs(o.normals[i+1])>.5?caps:walls;dst.positions.push(...o.positions.slice(i,i+9));dst.normals.push(...o.normals.slice(i,i+9));}
      const profile=buildingProfile(o),facade=appearanceMaterial(profile,false),ground=profile.ground==='entrance'?undefined:appearanceMaterial(profile,true);
      const extras={...o.extras,appearance:profile};buildingMaterials.set(o.name,{profile,ground});appearances.push({objectName:o.name,sourceId:o.extras.sourceId,...profile});
      objects.push({...o,...facadeUV(walls,profile,o.extras.footprint[0]),material:facade,extras});if(caps.positions.length)objects.push({name:o.name+'_Roof',...caps,material:roof,extras});
    }else if(o.material===0)objects.push({...o,...uv(o)});
    else if(o.material===1){const surface=roadSurface(o.extras),material=roadSurfaceMaterials[surface.kind];objects.push({...o,...uv(o),material,extras:{...o.extras,surfaceKind:surface.kind,surfaceSource:surface.source}});}
    // Woodland shares the green-area finish.
    else if(o.extras?.environment&&['green','water','woodland'].includes(o.extras.environment))objects.push({...o,...uv(o),...(o.extras.environment==='woodland'?{material:4}:{})});
    else objects.push(o);
  }
  const roads=scene.objects.filter(o=>o.extras?.path);
  const segments=roads.flatMap(o=>o.extras.path.slice(1).map((b,i)=>({a:o.extras.path[i],b,width:o.extras.width,road:o.name,highway:o.extras.highway,widthSource:o.extras.widthSource,surfaceKind:roadSurface(o.extras).kind})));
  const materialByRoad=new Map(roads.map(o=>[o.name,roadSurfaceMaterials[roadSurface(o.extras).kind]]));
  const junctions=junctionPatches(segments,1).map(o=>{const widest=segments.filter(s=>o.extras.incidentRoads.includes(s.road)).sort((a,b)=>b.width-a.width)[0];return {...o,...uv(o),material:materialByRoad.get(widest?.road)??1};});objects.push(...junctions);
  const resolvedRoads=resolveRoadSurfaces(objects.filter(o=>o.extras?.path||o.name.startsWith('Junction_'))),roadMap=new Map(resolvedRoads.map(o=>[o.name,o]));
  for(let i=0;i<objects.length;i++)if(roadMap.has(objects[i].name)){const o=roadMap.get(objects[i].name),repeat=8;objects[i]={...o,...uv(o,false,repeat),extras:{...o.extras,textureRepeatMeters:repeat}};}
  // Surfaces trimmed down to empty or to millimetre slivers are dropped; engines would import
  // them as empty meshes.
  const surfaceArea=({positions:p})=>{let s=0;for(let i=0;i<p.length;i+=9){const u=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],v=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];s+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}return s;};
  for(let i=objects.length-1;i>=0;i--)if(roadMap.has(objects[i].name)&&surfaceArea(objects[i])<.01)objects.splice(i,1);
  // Pavement runs under raised building sections; only ground-level footprints block it.
  const buildings=scene.objects.filter(o=>o.extras?.footprint&&!(o.extras.minHeight>0)),footprints=buildings.map(o=>o.extras.footprint);
  const walks=sidewalks(segments,footprints,pavement,roadFaceRings(resolvedRoads));objects.push(...walks.objects);
  if(details)objects.push(...buildingDetails(buildings,segments,{shop,trim,roofEquipment:equipment,buildingMaterials,entranceMaterials}));
  function distance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],q=dx*dx+dz*dz;if(q===0)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/q));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);}
  let count=0;const lights=[],lamp=streetLampMeshes();
  for(const s of segments){
    const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=Math.hypot(dx,dz);if(len<1)continue;
    const ux=dx/len,uz=dz/len;
    const nearOther=p=>segments.some(t=>t.road!==s.road&&distance(p,t.a,t.b)<t.width/2+4);
    for(let d=4;d+3<len;d+=9){const p=[s.a[0]+ux*d,s.a[1]+uz*d];if(nearOther(p)||nearOther([p[0]+ux*3,p[1]+uz*3]))continue;
      const mesh=roadSegments([p,[p[0]+ux*3,p[1]+uz*3]],.13);for(let i=1;i<mesh.positions.length;i+=3)mesh.positions[i]=.04;
      objects.push({name:`LaneMark_${count++}`,...mesh,material:paint});
    }
    for(let d=12;d<len-8;d+=32){
      const p=[s.a[0]+ux*d-uz*(s.width/2+1),s.a[1]+uz*d+ux*(s.width/2+1)];if(nearOther(p)||blocked(p,footprints,.65)||!walks.pads.some(r=>insidePolygon(p,r)))continue;
      if(lights.some(l=>Math.hypot(l.position[0]-p[0],l.position[2]-p[1])<8))continue;
      // Pole on the pavement, arm reaching back over the carriageway.
      const origin=[p[0],PAVEMENT_TOP,p[1]],yaw=lampYaw([uz,-ux]);
      objects.push({name:`LampPost_${count}`,...placeLamp(lamp.body,origin,yaw),material:metal,extras:{assetKey:'lamp-post-v2',instanceOrigin:origin,instanceYaw:yaw}});
      objects.push({name:`LampHead_${count++}`,...placeLamp(lamp.lens,origin,yaw),material:glow,extras:{assetKey:'lamp-head-v2',instanceOrigin:origin,instanceYaw:yaw}});
      lights.push({position:placeLamp({positions:lampLightOffset,normals:[0,1,0]},origin,yaw).positions,color:[.85,.92,1],energy:260});
    }
  }
  const main=[...segments].sort((a,b)=>b.width*Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1])-a.width*Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1]))[0];
  const previewCamera=streetCamera(segments,footprints)??(main?{eye:[main.a[0]+.1*(main.b[0]-main.a[0]),4,main.a[1]+.1*(main.b[1]-main.a[1])],target:[main.b[0],5,main.b[1]]}:{eye:[170,155,220],target:[0,0,0]});
  const architectureTypes=appearances.reduce((a,p)=>(a[p.type]=(a[p.type]??0)+1,a),{}),textureReuse={buildingInstances:appearances.length,sharedBuildingTextures:textureCache.size,sharedBuildingMaterials:materialCache.size};
  const widthSources=roads.reduce((counts,road)=>(counts[road.extras.widthSource]=(counts[road.extras.widthSource]??0)+1,counts),{});
  const surfaceTypes=roads.reduce((counts,road)=>{const kind=roadSurface(road.extras).kind;counts[kind]=(counts[kind]??0)+1;return counts;},{});
  const roadNetwork={roadFeatures:roads.length,segments:segments.length,junctionPatches:junctions.length,inferredCrosswalks:0,sidewalkCornerObjects:0,widthSources,surfaceTypes};
  const environmentTypes=objects.reduce((counts,o)=>{const kind=o.extras?.environment;if(kind&&!o.name.endsWith('_Crown'))counts[kind]=(counts[kind]??0)+1;return counts;},{});
  let finalObjects=objects,finalCamera=previewCamera,finalLights=lights;
  if(scene.metadata.terrain){
    const height=(x,z)=>terrainHeightLocal(scene.metadata.terrain,scene.metadata.origin,x,z),roadHeight=(x,z)=>roadbedHeightLocal(scene.metadata.terrain,scene.metadata.origin,x,z,segments),buildingOffsets=new Map(buildings.map(building=>[building.name,building.extras.gameBaseElevation??height(...building.extras.footprint[0])])),names=[...buildingOffsets.keys()].sort((a,b)=>b.length-a.length);
    finalObjects=objects.map(object=>{
      if(object.extras?.terrainGround||object.extras?.terrainAbsolute)return object;
      const buildingName=names.find(name=>object.name===name||object.name.startsWith(name+'_')),waterLevel=object.extras?.environment==='water'?object.extras.waterLevel:undefined,roadAttached=/^(Road_|Roadbed_|Junction_|LaneMark_|Crosswalk_|Sidewalk|Lamp)/.test(object.name),assetOrigin=object.extras?.instanceOrigin,assetElevation=assetOrigin?(roadAttached?roadHeight(assetOrigin[0],assetOrigin[2]):height(assetOrigin[0],assetOrigin[2])):undefined,rigid=buildingName?buildingOffsets.get(buildingName):waterLevel??assetElevation,positions=[...object.positions];
      for(let i=0;i<positions.length;i+=3)positions[i+1]+=rigid??(roadAttached?roadHeight(positions[i],positions[i+2]):height(positions[i],positions[i+2]));
      return {...object,positions,extras:{...object.extras,...(buildingName?{terrainOffset:rigid}:{}),...(assetOrigin?{instanceOrigin:[assetOrigin[0],assetOrigin[1]+assetElevation,assetOrigin[2]]}:{})}};
    });
    const liftPoint=(point,onRoad=false)=>[point[0],point[1]+(onRoad?roadHeight(point[0],point[2]):height(point[0],point[2])),point[2]];finalCamera={eye:liftPoint(previewCamera.eye,Boolean(main)),target:liftPoint(previewCamera.target,Boolean(main))};finalLights=lights.map(light=>({...light,position:liftPoint(light.position,true)}));
  }
  const moduleFor=object=>object.extras?.sceneModule??(object.name.startsWith('Building_')?'Buildings':object.name.startsWith('Foundation_')?'Building_Foundations':/^(Road_|Junction_|LaneMark_|Crosswalk_|Sidewalk)/.test(object.name)?'Roads':object.name.startsWith('Lamp')?'StreetProps':object.extras?.environment==='water'?'Water':object.extras?.environment?'Vegetation':'StreetProps');
  finalObjects=finalObjects.map(object=>({...object,extras:{...object.extras,sceneModule:moduleFor(object)}}));
  const sceneModules=finalObjects.reduce((counts,object)=>(counts[object.extras.sceneModule]=(counts[object.extras.sceneModule]??0)+1,counts),{});
  const assetInstances=finalObjects.reduce((counts,object)=>{const key=object.extras.assetKey;if(key)counts[key]=(counts[key]??0)+1;return counts;},{});
  const generationPreset={name:'ps2-flat-city-v2',focus:'buildings-and-streetscape',trees:false,terrainMode:scene.metadata.terrain?'optional-smoothed-compressed':'flat',terrainStrength:scene.metadata.terrain?.terrainPreset?.strength??0,maxTerrainRelief:scene.metadata.terrain?.terrainPreset?.maxRelief??0,roadTopology:'joined-ribbons',junctionMode:'incident-road-hull',automaticCrosswalks:false,roadbeds:false,waterMode:scene.metadata.terrain?'level':'flat',buildingBaseMode:scene.metadata.terrain?'highest-footprint-sample':'flat',deterministicBySourceId:true};
  return {...scene,objects:finalObjects,materials,textures,metadata:{...scene.metadata,previewCamera:finalCamera,style:'ps2-dusk-flat-city-v9',generationPreset,buildingAppearances:appearances,architectureTypes,roadNetwork:{...roadNetwork,roadbedObjects:0},environmentTypes,sceneModules,assetInstances,textureReuse,textureLicense:'Original procedural textures generated by Mapcast; CC0-1.0',lights:finalLights,limitations:scene.metadata.limitations.filter(x=>!x.startsWith('Flat materials')).concat(['Road ways use joined ribbons and shared-endpoint junction hulls; complex merges and roundabouts are not polygon-unioned','Automatic crosswalks and loose sidewalk corner pads are disabled until they can be derived without overlap','Optional terrain remains experimental and is only enabled with the CLI --terrain flag','Individual trees are intentionally omitted from the building-and-streetscape preset','Sidewalks clip building footprints and actual road surfaces; complete intersection corners and curb ramps remain pending','Facade appearance is inferred from tags and stable IDs, not a real facade reconstruction','Most roofs retain flat geometry; religious spires are inferred markers, pitched roofs not implemented','Street furniture and entrances are inferred, not real OSM objects','Blender/Unreal runtime verification pending'])}};
}
