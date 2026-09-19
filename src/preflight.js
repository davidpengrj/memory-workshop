import pc from 'polygon-clipping';
import {offsetPolygons,polygonArea} from './contours.js';

// Morphological opening highlights details below the requested material width.
// It is a geometric warning, not a material-strength or process certification.
export function inspectFeatures(design,minWidth=2){
  if(!Number.isFinite(minWidth)||minWidth<.5||minWidth>5)throw new Error('细节宽度应在 0.5–5 mm 之间。');
  const scale=design.size/200,radius=minWidth/scale/2;
  const layers=design.layers.filter(l=>l.id>0&&l.id<5).map(l=>{
    const eroded=offsetPolygons(l.polygons,-radius);
    const opened=offsetPolygons(eroded,radius);
    const difference=opened.length?pc.difference(l.polygons,opened):l.polygons;
    const riskAreas=difference.filter(p=>polygonArea([p])*scale*scale>.7);
    const smallHoles=l.polygons.flatMap(p=>p.slice(1)).filter(r=>{
      const xs=r.map(p=>p[0]),ys=r.map(p=>p[1]);
      return Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*scale<minWidth;
    });
    return {id:l.id,name:l.name,riskAreas,smallHoles,area:polygonArea(riskAreas)*scale*scale,fragmented:eroded.length>l.polygons.length};
  });
  return {minWidth,layers,regions:layers.reduce((s,l)=>s+l.riskAreas.length+l.smallHoles.length,0),riskArea:layers.reduce((s,l)=>s+l.area,0),physicalTested:false,method:'轮廓内缩/回扩比较；忽略面积低于 0.7 mm² 的变化。小孔按包络最短边检查。可能遗漏局部问题，须用实材试切。'};
}

export function measureKerf(outerMeasured,holeMeasured){
  if(!Number.isFinite(outerMeasured)||!Number.isFinite(holeMeasured)||outerMeasured<28.5||outerMeasured>30||holeMeasured<10||holeMeasured>11.5)return {valid:false,error:'请填写 30 mm 外方片和 10 mm 方孔的实测值；外片应为 28.5–30，方孔应为 10–11.5 mm。'};
  const a=30-outerMeasured,b=holeMeasured-10;
  return {valid:true,kerf:+((a+b)/2).toFixed(3),consistent:Math.abs(a-b)<=.15,spread:+Math.abs(a-b).toFixed(3),note:'这是切缝估计值；图纸未自动做切缝补偿，请在设备软件中确认。'};
}
