import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesign} from '../src/geometry.js';
import {presets} from '../src/presets.js';
import {inspectFeatures,measureKerf} from '../src/preflight.js';
import {standGeometry,standDimensions,standSTL} from '../src/stand.js';
import {polygonArea,offsetPolygons} from '../src/contours.js';
import JSZip from 'jszip';
import {makeParts,packParts} from '../src/packing.js';
import {boardSVG,placementPaths,buildJobZip} from '../src/job-export.js';

test('offset keeps holes correctly oriented and reinforcement preserves actual contours and dimensions',()=>{
  const square=[[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[3,7],[7,7],[7,3],[3,3]]]];
  assert.equal(polygonArea(square),84);
  assert.ok(polygonArea(offsetPolygons(square,.5))>84);
  for(const p of presets)for(const size of [140,180,220])for(const reinforcement of [.4,.8,1.2]){
    const d=createDesign(p.plan,{size,reinforcement});assert.equal(d.validation.pass,true);
    assert.equal(d.size,size);assert.equal(d.reinforcement,reinforcement);
  }
});
test('geometric thin-detail estimate decreases with reinforcement and reports remaining small holes',()=>{
  const before=inspectFeatures(createDesign(presets[1].plan,{size:140}),2.4);
  const after=inspectFeatures(createDesign(presets[1].plan,{size:140,reinforcement:.8}),2.4);
  assert.ok(before.riskArea>50);assert.ok(after.riskArea<before.riskArea/2);
  assert.ok(after.layers.some(l=>l.smallHoles.length));assert.equal(after.physicalTested,false);
  assert.throws(()=>inspectFeatures(createDesign(presets[0].plan),NaN));
});
test('kerf measurements distinguish valid, inconsistent and physically invalid measurements',()=>{
  assert.equal(measureKerf(29.8,10.2).kerf,.2);
  assert.equal(measureKerf(29.8,10.5).consistent,false);
  for(const pair of [[NaN,10],[30.2,10.2],[29.8,9.8],[28,10]])assert.equal(measureKerf(...pair).valid,false);
});
test('STL stand uses measured stack thickness and is a closed, consistently wound solid',()=>{
  for(const t of [1.5,2.8,3,5]){
    const d=standDimensions(t,.6);assert.ok(Math.abs(d.slot-(11*t+.6))<1e-6);
    const g=standGeometry(t,.6),p=g.getAttribute('position'),edges=new Map();let volume=0;
    const point=i=>[p.getX(i),p.getY(i),p.getZ(i)],key=v=>v.map(x=>x.toFixed(5)).join(',');
    for(let i=0;i<p.count;i+=3){
      const [a,b,c]=[point(i),point(i+1),point(i+2)];
      volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
      for(const [u,v] of [[a,b],[b,c],[c,a]]){const ku=key(u),kv=key(v),k=[ku,kv].sort().join('|');const e=edges.get(k)||{count:0,orientation:0};e.count++;e.orientation+=ku<kv?1:-1;edges.set(k,e);}
    }
    for(const e of edges.values()){assert.equal(e.count,2);assert.equal(e.orientation,0);}
    assert.ok(volume>0);assert.equal(g.boundingBox.min.z,0);
    assert.equal(g.boundingBox.max.x,100);assert.ok(Math.abs(g.boundingBox.max.y-d.depth)<.001);
    const stl=standSTL(t,.6);assert.equal(stl.byteLength,84+50*(p.count/3));g.dispose();
  }
  assert.throws(()=>standSTL(0));assert.throws(()=>standSTL(3,NaN));
});

test('production archive exports every placed part at real millimetres with measured stand and records',async()=>{
  const design=createDesign({...presets[0].plan,title:'<script>test</script>'},{reinforcement:.4});
  const settings={quantity:1,mode:'strips',margin:4,gap:3,actualThickness:2.8,clearance:.6,bedWidth:400,bedHeight:415,stocks:[{id:'n',name:'<img onerror=evil>',width:400,height:400,count:5,reclaimed:false}]};
  const job=packParts(makeParts(design.size,1,'strips'),settings.stocks,settings);
  assert.equal(job.unplaced.length,0);
  const bytes=await (await buildJobZip(design,'example',job,settings,inspectFeatures(design,2.4),measureKerf(29.8,10.2))).arrayBuffer();
  const zip=await JSZip.loadAsync(bytes),manifest=JSON.parse(await zip.file('job.json').async('string'));
  assert.equal(manifest.stand.slot,31.4);assert.equal(manifest.calibration.kerf,.2);assert.equal(manifest.reinforcementMm,.4);assert.equal(manifest.physicalTested,false);assert.equal(manifest.kerfCompensated,false);
  assert.equal((await zip.file('parts.csv').async('string')).trim().split('\n').length,27);
  for(let i=0;i<job.sheets.length;i++){
    const s=job.sheets[i],xml=await zip.file(`boards/${String(i+1).padStart(2,'0')}-${s.id}.svg`).async('string');
    assert.match(xml,new RegExp(`width="${s.width}mm"`));assert.doesNotMatch(xml,/<img|<script|<rect|<text/);
    for(const p of s.placements){assert.ok(xml.includes(`id="${p.id}"`));const a=placementPaths(design,p);assert.ok(xml.includes(a.cut));if(p.rotated)assert.match(a.transform,/rotate\(90\)/);}
  }
  assert.doesNotMatch(await zip.file('生产交接单.html').async('string'),/<script>|<img onerror/);
  assert.ok(zip.file('stand.stl'));assert.ok(zip.file('calibration.svg'));
  await assert.rejects(()=>buildJobZip(design,'example',{...job,unplaced:[{}]},settings,{}),/未排入/);
});


test('batch archive requests one stand per completed product',async()=>{
  const design=createDesign(presets[0].plan,{size:140});
  const settings={quantity:2,mode:'strips',margin:4,gap:3,actualThickness:1.5,clearance:.6,bedWidth:400,bedHeight:415,stocks:[{id:'n',name:'板材',width:400,height:400,count:5,reclaimed:false}]};
  const job=packParts(makeParts(design.size,2,'strips'),settings.stocks,settings);
  const zip=await JSZip.loadAsync(await (await buildJobZip(design,'example',job,settings,inspectFeatures(design,2.4),null)).arrayBuffer());
  const manifest=JSON.parse(await zip.file('job.json').async('string'));
  assert.equal(manifest.stand.printCount,2);assert.equal(manifest.stand.perProductCount,1);
  assert.equal(manifest.packing.stats.totalCount,52);
  assert.match(await zip.file('生产交接单.html').async('string'),/本单共打印 2 个/);
});
