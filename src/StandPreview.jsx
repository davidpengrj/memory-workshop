import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {standGeometry} from './stand.js';
import {createRenderLoop} from './render-loop.js';

export default function StandPreview({thickness,clearance}){
  const host=useRef(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const el=host.current;let renderer,geometry;
    setFailed(false);
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});geometry=standGeometry(thickness,clearance);}
    catch{renderer?.dispose();geometry?.dispose?.();setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','可旋转的实际 STL 底座模型');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,1000);
    camera.position.set(135,110,145);scene.add(new THREE.HemisphereLight(0xffffff,0x75806f,2.4));
    const light=new THREE.DirectionalLight(0xfff1d2,2.5);light.position.set(-100,160,90);scene.add(light);
    geometry.rotateX(-Math.PI/2);geometry.computeBoundingBox();const center=new THREE.Vector3();geometry.boundingBox.getCenter(center);geometry.translate(-center.x,-center.y,-center.z);
    const material=new THREE.MeshStandardMaterial({color:'#cda264',roughness:.65});scene.add(new THREE.Mesh(geometry,material));
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableZoom=false;controls.enablePan=false;controls.enableDamping=true;
    const resize=()=>{const r=el.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();loop.invalidate();};
    // controls.update() returns true while damping is still settling.
    const render=()=>{const moving=controls.update()===true;renderer.render(scene,camera);return moving;};
    const loop=createRenderLoop({element:el,render});
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    const onChange=()=>loop.invalidate();
    controls.addEventListener('change',onChange);controls.addEventListener('start',onChange);
    return()=>{loop.dispose();controls.removeEventListener('change',onChange);controls.removeEventListener('start',onChange);observer.disconnect();controls.dispose();geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove();};
  },[thickness,clearance]);
  return <div className="stand-model" ref={host}>{failed&&<div className="fallback-art" role="img" aria-label="底座三维预览不可用" style={{padding:'18px',fontSize:'11px',lineHeight:1.7,color:'var(--muted, #8b9185)',textAlign:'center'}}>此设备暂无法创建三维预览。<br/>底座 STL 仍会正常包含在生产包中，可下载后在切片软件中查看。</div>}</div>;
}
