import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { previewSVG } from './geometry.js';
import { createRenderLoop } from './render-loop.js';

function shapesFrom(polygons){
  return polygons.map(rings=>{
    const shape=new THREE.Shape(rings[0].map(([x,y])=>new THREE.Vector2(x-100,100-y)));
    rings.slice(1).forEach(r=>shape.holes.push(new THREE.Path(r.map(([x,y])=>new THREE.Vector2(x-100,100-y)))));
    return shape;
  });
}
const reducedMotion=()=>typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export default function Scene({design,exploded,lit,activeLayer,resetKey}){
  const host=useRef(null),engine=useRef(null),flags=useRef({exploded,lit,activeLayer});
  const [failed,setFailed]=useState(false);
  flags.current={exploded,lit,activeLayer};
  useEffect(()=>{
    const el=host.current;
    let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}
    catch{setFailed(true);return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.02;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','可拖动旋转的光影盒三维预览');
    renderer.domElement.setAttribute('role','img');
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(32,1,1,1800);
    camera.position.set(235,160,565);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.target.set(0,0,15);
    controls.enableDamping=true;controls.dampingFactor=.07;
    controls.enablePan=false;controls.enableZoom=false;
    controls.minPolarAngle=.4;controls.maxPolarAngle=Math.PI*.67;
    controls.saveState();
    scene.add(new THREE.AmbientLight('#ffffff',1.15));
    const key=new THREE.DirectionalLight('#fff4d8',2.4);
    key.position.set(-150,370,230);key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-250;key.shadow.camera.right=250;key.shadow.camera.top=250;key.shadow.camera.bottom=-250;key.shadow.camera.far=1000;key.shadow.normalBias=.25;key.shadow.bias=-.0002;key.shadow.radius=5;
    scene.add(key);
    const fill=new THREE.DirectionalLight('#bddcdb',.8);fill.position.set(200,80,100);scene.add(fill);
    const warm=new THREE.PointLight('#ffd891',7000,430,2);warm.position.set(0,30,135);scene.add(warm);
    const root=new THREE.Group();root.rotation.y=-.04;scene.add(root);
    const layers=design.layers.map(layer=>{
      const group=new THREE.Group();
      const geometry=new THREE.ExtrudeGeometry(shapesFrom(layer.polygons),{depth:design.thickness*200/design.size,bevelEnabled:false,curveSegments:24});
      const front=layer.id===0;
      const mat=new THREE.MeshStandardMaterial({color:front?'#d8bd98':layer.color,roughness:.88,metalness:0,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      if(layer.id<5){
        const spacerGeo=new THREE.ExtrudeGeometry(shapesFrom(design.spacer.polygons),{depth:design.thickness*200/design.size,bevelEnabled:false});
        const spacerMesh=new THREE.Mesh(spacerGeo,new THREE.MeshStandardMaterial({color:'#cdb48b',roughness:1}));
        spacerMesh.position.z=-design.thickness*200/design.size;
        spacerMesh.castShadow=true;spacerMesh.receiveShadow=true;group.add(spacerMesh);
      }
      if(layer.id===0){
        const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,40),new THREE.LineBasicMaterial({color:'#ae8d67',transparent:true,opacity:.42}));group.add(edge);
      }
      if(layer.engravings.length){
        const data=new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg">${layer.engravings.map(d=>`<path d="${d}"/>`).join('')}</svg>`);
        for(const p of data.paths){
          if(layer.id===5){
            for(const shape of SVGLoader.createShapes(p)){
              const gm=new THREE.ShapeGeometry(shape);
              gm.translate(-100,-100,0);gm.scale(1,-1,1);
              const mm=new THREE.MeshStandardMaterial({color:design.colors.sky,emissive:design.colors.sky,emissiveIntensity:.45,side:THREE.DoubleSide});
              const m=new THREE.Mesh(gm,mm);m.position.z=design.thickness*200/design.size+.12;group.add(m);
            }
          }else{
            for(const sub of p.subPaths){
              const pts=sub.getPoints(40).map(p=>new THREE.Vector3(p.x-100,100-p.y,design.thickness*200/design.size+.16));
              group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#3f4c3f',transparent:true,opacity:.4})));
            }
          }
        }
      }
      root.add(group);return {group,mat,id:layer.id};
    });
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),new THREE.ShadowMaterial({opacity:.12}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-104;floor.receiveShadow=true;scene.add(floor);
    const still=reducedMotion();
    // Lerp factor: reduced-motion snaps to target in one frame.
    const K=still?1:.09,LK=still?1:.08;
    const EPS=.02;
    function step(){
      const f=flags.current;
      let moving=false;
      const spread=f.exploded?27:design.thickness*200/design.size*2;
      layers.forEach(({group,mat,id})=>{
        const z=(5-id)*spread-(f.exploded?45:0);
        const x=f.exploded?(id-2.5)*24:0;
        group.position.z+=(z-group.position.z)*K;group.position.x+=(x-group.position.x)*K;
        if(Math.abs(z-group.position.z)>EPS||Math.abs(x-group.position.x)>EPS)moving=true;
        const highlight=f.activeLayer===null||f.activeLayer===id;
        mat.emissive.set(highlight&&f.activeLayer!==null?'#8a7041':'#000000');
        mat.emissiveIntensity=f.activeLayer!==null?.16:0;
      });
      const warmTarget=f.lit?7000:0;
      warm.intensity+=(warmTarget-warm.intensity)*LK;
      if(Math.abs(warmTarget-warm.intensity)>1)moving=true;
      const keyTarget=f.lit?2.4:2.8;
      key.intensity+=(keyTarget-key.intensity)*LK;
      if(Math.abs(keyTarget-key.intensity)>.005)moving=true;
      const zoomTarget=f.exploded?.8:1;
      camera.zoom+=(zoomTarget-camera.zoom)*LK;camera.updateProjectionMatrix();
      if(Math.abs(zoomTarget-camera.zoom)>.002)moving=true;
      // controls.update() returns true while damping is still moving the camera.
      const controlsMoving=controls.update()===true;
      renderer.render(scene,camera);
      return moving||controlsMoving;
    }
    function resize(){const {width,height}=el.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();loop.invalidate();}
    const loop=createRenderLoop({element:el,render:step});
    const ro=new ResizeObserver(resize);ro.observe(el);resize();
    // Any control interaction (drag) or damped change wakes the loop.
    const onChange=()=>loop.invalidate();
    controls.addEventListener('change',onChange);
    controls.addEventListener('start',onChange);
    engine.current={controls,loop};
    return ()=>{loop.dispose();controls.removeEventListener('change',onChange);controls.removeEventListener('start',onChange);ro.disconnect();controls.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();engine.current=null;};
  },[design]);
  // Prop changes must wake the loop so transitions play, then settle.
  useEffect(()=>{engine.current?.loop.invalidate();},[exploded,lit,activeLayer]);
  useEffect(()=>{const e=engine.current;if(e){e.controls.reset();e.loop.invalidate();}},[resetKey]);
  return <div className="scene-host" ref={host}>{failed&&<div className="fallback-art" role="img" aria-label="二维作品预览" dangerouslySetInnerHTML={{__html:previewSVG(design)}}/>}</div>;
}
