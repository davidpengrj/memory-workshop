import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createDesign,cutSVG,previewSVG} from '../src/geometry.js';
import {presets} from '../src/presets.js';
import {buildZip,assemblyHTML} from '../src/export.js';
const motifs=['lighthouse','sailboat','couple','cat','dog','house','pagoda','arch','trees','flowers','mountain','bridge'];

test('all supported motifs stay connected and closed across terrain/seed extremes',()=>{
  for(const theme of ['coast','mountain','city','garden'])for(const m of motifs)for(const seed of [1,42,97,123,789,999999]){
    const design=createDesign({...presets[0].plan,theme,motifs:[m],seed});
    assert.equal(design.validation.pass,true,JSON.stringify({theme,m,seed}));
    assert.equal(design.layers.length,6);
  }
});
test('four motifs and all supported physical sizes export actual millimetres',()=>{
  // Four landmarks must not lose the fourth when a foreground fallback is added.
  for(const theme of ['coast','mountain','city','garden'])for(const seed of [1,42,97,123,789,999999])for(const set of [['lighthouse','house','arch','pagoda'],['cat','dog','couple','flowers']]){
    const d=createDesign({...presets[0].plan,theme,seed,motifs:set});
    assert.equal(d.validation.pass,true,JSON.stringify({theme,seed,set}));
    for(const motif of set)assert.ok(d.usedMotifs.includes(motif));
  }
  for(const size of [140,180,220])for(const material of ['wood','card'])for(const p of presets){
    const d=createDesign(p.plan,{size,material});assert.equal(d.validation.pass,true);
    for(const layer of d.layers){const svg=cutSVG(d,layer);assert.match(svg,new RegExp(`width="${size}mm"`));assert.match(svg,new RegExp(`viewBox="0 0 ${size} ${size}"`));assert.doesNotMatch(svg,/NaN|Infinity/);}
    assert.equal(d.depth,11*d.thickness);
  }
});
test('export package has six layers, a spacer, calibration, instructions, and no personal story',async()=>{
  const d=createDesign(presets[0].plan);const zip=await JSZip.loadAsync(await (await buildZip(d,'example')).arrayBuffer());
  assert.equal(Object.keys(zip.files).filter(k=>k.startsWith('cut/layer-')).length,6);
  for(const f of ['cut/spacer.svg','cut/calibration.svg','制作与装配说明.html','scene.json','validation.json','preview.svg','先读我.txt'])assert.ok(zip.file(f),f);
  const scene=JSON.parse(await zip.file('scene.json').async('string'));assert.equal(scene.sizeMm,180);assert.equal(scene.kerfCompensated,false);assert.equal(scene.source,'example');assert.ok(!('story'in scene));
});
test('export rejects disconnected geometry and escapes AI copy in HTML/SVG',async()=>{
  const plan={...presets[0].plan,title:'<script>alert(1)</script>',narrative:'<img onerror=alert(1)>'};
  const d=createDesign(plan);assert.doesNotMatch(assemblyHTML(d),/<script>|<img onerror/);assert.doesNotMatch(previewSVG(d),/<script>/);
  d.validation.pass=false;await assert.rejects(()=>buildZip(d),/结构检查/);
});
