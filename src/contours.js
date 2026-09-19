import ClipperLib from 'clipper-lib';

const SCALE=10000;
export function polygonArea(polygons){
  const area=ring=>Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
  return polygons.reduce((sum,rings)=>sum+area(rings[0])-rings.slice(1).reduce((s,r)=>s+area(r),0),0);
}
export function offsetPolygons(polygons,delta){
  if(!polygons.length)return [];
  const paths=polygons.flatMap(rings=>rings.map((ring,i)=>{
    const pts=ring.slice(0,-1).map(([x,y])=>({X:Math.round(x*SCALE),Y:Math.round(y*SCALE)}));
    if(ClipperLib.Clipper.Orientation(pts)!==(i===0))pts.reverse();
    return pts;
  }));
  const offset=new ClipperLib.ClipperOffset(2,SCALE*.02);
  offset.AddPaths(paths,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
  const tree=new ClipperLib.PolyTree();offset.Execute(tree,delta*SCALE);
  const ring=points=>{const p=points.map(v=>[v.X/SCALE,v.Y/SCALE]);return [...p,p[0]];};
  return ClipperLib.JS.PolyTreeToExPolygons(tree).map(p=>[ring(p.outer),...p.holes.map(ring)]);
}
