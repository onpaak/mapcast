import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// A quick orbit preview of city.glb. Only a check before download: lighting, fog and
// post effects are left to Blender / Unreal. Night dims the lights so emissive windows,
// signs and lamps carry the scene; day turns that emission almost off.
const looks={
  day:{background:0x8f9ba5,sky:0xe4e9ee,ground:0x5b5f58,hemi:5,sun:4.2,emission:.08,reflect:[0x6f94c0,0xdfe6ec,0x4a4d48]},
  night:{background:0x090c13,sky:0x3a4868,ground:0x101014,hemi:1.1,sun:0,emission:1,reflect:[0x0b1020,0x1c2436,0x08080a]}
};

// A plain sky / horizon / ground gradient. Only glossy glass (curtain walls) reflects it, so
// everything else keeps the flat preview lighting.
function gradientEnvironment(renderer,[sky,horizon,ground]){
  const geometry=new THREE.SphereGeometry(1,32,16),position=geometry.attributes.position,colors=[],color=new THREE.Color();
  for(let i=0;i<position.count;i++){
    const y=position.getY(i);
    color.set(y>0?sky:ground).lerp(new THREE.Color(horizon),1-Math.min(1,Math.abs(y)*(y>0?1.6:4)));
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const room=new THREE.Scene();room.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
  const pmrem=new THREE.PMREMGenerator(renderer),texture=pmrem.fromScene(room).texture;
  pmrem.dispose();geometry.dispose();
  return texture;
}

// Throws when WebGL is unavailable; the page then keeps the still preview image.
export function createViewer(container){
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  container.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,5000);
  const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight(0xfff2de);
  sun.position.set(-.5,.9,-.7);scene.add(hemi,sun);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.495;controls.screenSpacePanning=false;
  let model=null,active=false,look='day';
  const reflections=Object.fromEntries(Object.entries(looks).map(([name,settings])=>[name,gradientEnvironment(renderer,settings.reflect)]));

  const resize=()=>{
    const {clientWidth:w,clientHeight:h}=container;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  const loop=()=>{controls.update();renderer.render(scene,camera);};

  function setLook(name){
    look=name;const settings=looks[name];
    scene.background=new THREE.Color(settings.background);
    hemi.color.set(settings.sky);hemi.groundColor.set(settings.ground);hemi.intensity=settings.hemi;sun.intensity=settings.sun;
    applyEmission();
  }
  // Scales every material's emission from the value the file gave it, and points glossy
  // glass at the current look's reflection.
  function applyEmission(){
    model?.traverse(node=>{for(const material of [node.material??[]].flat()){
      if(material.metalness>=.3){material.envMap=reflections[look];material.needsUpdate=true;}
      if(!('emissiveIntensity' in material))continue;
      material.userData.emissive??=material.emissiveIntensity;
      material.emissiveIntensity=material.userData.emissive*looks[look].emission;
    }});
  }
  function dispose(object){
    object.traverse(node=>{
      node.geometry?.dispose();
      for(const material of [node.material??[]].flat()){for(const value of Object.values(material))if(value?.isTexture&&!Object.values(reflections).includes(value))value.dispose();material.dispose();}
    });
  }
  // Frames the model from the south-east, like the still overview image.
  function frame(object){
    const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const span=Math.max(100,size.x,size.z);
    camera.near=span/2000;camera.far=span*20;camera.updateProjectionMatrix();
    camera.position.set(center.x+span*.72,box.max.y+span*.58,center.z+span*.82);
    controls.target.copy(center);controls.maxDistance=span*4;controls.update();
  }

  return {
    async load(url,onProgress){
      const gltf=await new GLTFLoader().loadAsync(url,event=>onProgress?.(event.loaded));
      if(model){scene.remove(model);dispose(model);}
      model=gltf.scene;scene.add(model);frame(model);applyEmission();
    },
    setLook,
    // Renders only while the preview tab is visible.
    setActive(on){active=on;if(on)resize();renderer.setAnimationLoop(active?loop:null);}
  };
}
