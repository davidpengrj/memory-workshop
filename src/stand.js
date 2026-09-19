import * as THREE from 'three';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';

export function standDimensions(thickness=3,clearance=.6){
  if(!Number.isFinite(thickness)||thickness<.8||thickness>5||!Number.isFinite(clearance)||clearance<.2||clearance>2)throw new Error('板厚须为 0.8–5 mm，装配余量须为 0.2–2 mm。');
  const slot=+(11*thickness+clearance).toFixed(3);
  return {width:100,depth:slot+24,height:22,slot,thickness,clearance,printCount:1,units:'mm',physicalTested:false};
}
export function standGeometry(thickness=3,clearance=.6){
  const d=standDimensions(thickness,clearance),front=12,back=front+d.slot;
  // Side section of one continuous U-shaped solid; extrude along its width.
  const points=[[0,0],[d.depth,0],[d.depth,22],[back,22],[back,4],[front,4],[front,13],[0,13]];
  const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:d.width,bevelEnabled:false,steps:1});
  // Original (depth,height,width) -> print coordinates (width,depth,height).
  const pos=geometry.getAttribute('position');
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);pos.setXYZ(i,z,x,y);}
  geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
}
export function standSTL(thickness=3,clearance=.6){
  const geometry=standGeometry(thickness,clearance);
  const mesh=new THREE.Mesh(geometry);mesh.updateMatrixWorld(true);
  const data=new STLExporter().parse(mesh,{binary:true});geometry.dispose();
  return data.buffer;
}
