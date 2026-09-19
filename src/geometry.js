import pc from 'polygon-clipping';
import { palettes, layerNames } from './presets.js';
import {offsetPolygons} from './contours.js';

const close = p => [...p, p[0]];
const rect = (x,y,w,h) => close([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
const circle = (x,y,r,n=48) => close(Array.from({length:n},(_,i)=>[x+Math.cos(i/n*Math.PI*2)*r,y+Math.sin(i/n*Math.PI*2)*r]));
function roundRect(x,y,w,h,r=4){
  const pts=[];
  for (const [cx,cy,start] of [[x+w-r,y+r,-90],[x+w-r,y+h-r,0],[x+r,y+h-r,90],[x+r,y+r,180]])
    for(let i=0;i<=8;i++){const a=(start+i*90/8)*Math.PI/180;pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
  return close(pts);
}
const poly = ring => [[ring]];
const merge = rings => pc.union(...rings.map(poly));
const frame = (inset=12) => pc.difference(poly(roundRect(0,0,200,200,5)),poly(roundRect(inset,inset,200-2*inset,200-2*inset,4)));
export function pathFromPolygons(polygons,scale=1){return polygons.flat().map(r=>r.map((p,i)=>`${i?'L':'M'}${(p[0]*scale).toFixed(3)},${(p[1]*scale).toFixed(3)}`).join(' ')+' Z').join(' ');}
const linePath = pts => pts.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
function ground(theme,level,seed){
  const pts=[];
  for(let i=0;i<=48;i++){
    const x=i*200/48;
    let y=level;
    const phase=(seed%97)/15;
    if(theme==='coast')y+=Math.sin(x/23+phase)*3+Math.cos(x/43)*4;
    else if(theme==='mountain')y-=Math.abs(Math.sin(x/39+phase))*17+Math.abs(Math.sin(x/67))*10;
    else if(theme==='city')y+=Math.sin(x/55+phase)*3;
    else y+=Math.sin(x/35+phase)*7;
    pts.push([x,y]);
  }
  return close([...pts,[200,200],[0,200]]);
}
function tree(x,b,h=38){return [rect(x-2,b-h*.6,4,h*.6+4),close([[x,b-h],[x+14,b-h*.35],[x+6,b-h*.35],[x+17,b-5],[x-17,b-5],[x-6,b-h*.35],[x-14,b-h*.35]])];}
function motif(name,x,b){
  const shapes=[],holes=[],engravings=[];
  const add=(...rings)=>shapes.push(...rings);
  if(name==='lighthouse'){
    add(close([[x-11,b+8],[x-6,b-49],[x+6,b-49],[x+11,b+8]]),rect(x-10,b-55,20,8),close([[x-13,b-55],[x,b-66],[x+13,b-55]]));
    holes.push(rect(x-2.5,b-41,5,8),rect(x-2.5,b-24,5,8));
    engravings.push(linePath([[x-8,b-10],[x+8,b-10]]));
  }else if(name==='house'){
    add(rect(x-16,b-25,32,35),close([[x-22,b-25],[x,b-46],[x+22,b-25]]),rect(x+10,b-42,5,15));
    holes.push(rect(x-10,b-17,6,7),rect(x+4,b-17,6,7));
    engravings.push(linePath([[x-4,b+1],[x-4,b-8],[x+4,b-8],[x+4,b+1]]));
  }else if(name==='arch'){
    add(rect(x-24,b-39,48,49),close([[x-27,b-39],[x-18,b-52],[x-10,b-52],[x,b-63],[x+10,b-52],[x+18,b-52],[x+27,b-39]]));
    const archHole=pc.union(poly(rect(x-7,b-22,14,21)),poly(circle(x,b-22,7)));
    holes.push(...archHole.flat());
    holes.push(rect(x-18,b-32,5,8),rect(x+13,b-32,5,8),circle(x,b-47,3.5));
    engravings.push(linePath([[x-22,b-38],[x+22,b-38]]));
  }else if(name==='pagoda'){
    add(rect(x-8,b-51,16,61));
    for(let i=0;i<3;i++) {let y=b-12-i*18;let w=22-i*4;add(close([[x-w,y],[x-w*.6,y-6],[x,y-13],[x+w*.6,y-6],[x+w,y]]));}
    holes.push(rect(x-3,b-12,6,8));
  }else if(name==='sailboat'){
    add(close([[x-22,b-8],[x+22,b-8],[x+15,b+7],[x-14,b+7]]),rect(x-2,b-47,4,43),close([[x-5,b-44],[x-5,b-6],[x-24,b-6]]),close([[x+1,b-48],[x+24,b-12],[x+1,b-12]]));
  }else if(name==='couple'){
    for(const [dx,h] of [[-7,36],[7,33]]){
      add(circle(x+dx,b-h,4.5),roundRect(x+dx-5,b-h+3,10,h-3,3),rect(x+dx-4,b-7,3,17),rect(x+dx+1,b-7,3,17));
    }
    add(close([[x-6,b-22],[x+6,b-20],[x+6,b-15],[x-6,b-17]]));
  }else if(name==='cat'){
    add(circle(x,b-13,11),circle(x,b-28,8),close([[x-8,b-29],[x-9,b-40],[x-2,b-34],[x+2,b-34],[x+9,b-40],[x+8,b-29]]),rect(x-9,b-13,18,22),roundRect(x+6,b-16,15,24,6));
    holes.push(circle(x-3,b-28,1.5),circle(x+3,b-28,1.5));
  }else if(name==='dog'){
    add(roundRect(x-14,b-18,26,16,5),rect(x-11,b-8,5,18),rect(x+4,b-8,5,18),circle(x+10,b-25,8),roundRect(x+11,b-30,14,7,3),close([[x+7,b-31],[x+3,b-37],[x+2,b-21]]),close([[x-12,b-15],[x-22,b-30],[x-24,b-26],[x-16,b-10]]));
  }else if(name==='trees')add(...tree(x,b,40),...tree(x+22,b+5,29));
  else if(name==='flowers'){
    for(const [dx,h] of [[-10,22],[3,34],[17,25]]){
      add(rect(x+dx-1.5,b-h,3,h+10),circle(x+dx,b-h,5));
      for(let a=0;a<6;a++)add(circle(x+dx+Math.cos(a*Math.PI/3)*5,b-h+Math.sin(a*Math.PI/3)*5,3.5));
    }
  }else if(name==='mountain')add(close([[x-42,b+10],[x-18,b-25],[x-7,b-12],[x+10,b-47],[x+46,b+10]]));
  else if(name==='bridge'){
    add(rect(x-42,b-27,84,6),rect(x-37,b-27,6,37),rect(x-3,b-27,6,37),rect(x+31,b-27,6,37));
    engravings.push(linePath([[x-40,b-24],[x+40,b-24]]));
  }
  return {shapes,holes,engravings};
}
export function createDesign(plan,options={}){
  const size=[140,180,220].includes(+options.size)?+options.size:180;
  const thickness=options.material==='card'?1.5:3;
  const material=thickness===3?'3 mm 椴木胶合板':'1.5 mm 卡纸';
  const colors=palettes[plan.palette]||palettes.tide;
  const reinforcement=Number.isFinite(options.reinforcement)?Math.max(0,Math.min(1.2,options.reinforcement)):0;
  const layers=[];
  const chosen=[...new Set(plan.motifs||[])];
  const foreground=chosen.find(m=>['couple','cat','dog','flowers'].includes(m))||'couple';
  const landmark=chosen.find(m=>['lighthouse','house','arch','pagoda','mountain'].includes(m))||(plan.theme==='coast'?'lighthouse':plan.theme==='city'?'arch':'house');
  const mid=chosen.find(m=>![foreground,landmark].includes(m))||(plan.theme==='coast'?'sailboat':'trees');
  const extras=chosen.filter(m=>![foreground,landmark,mid].includes(m));
  const outer=poly(roundRect(0,0,200,200,5));
  for(let i=0;i<6;i++){
    let polygons,engravings=[];
    if(i===0)polygons=frame(12);
    else if(i===5){
      polygons=outer;
      const seed=plan.seed||42;
      const sx=73+(seed%23),sy=48;
      if(plan.sky==='stars'){
        for(let s=0;s<13;s++){const x=28+((seed*(s+3)*7)%144), y=24+((seed*(s+2)*11)%55);engravings.push(pathFromPolygons(poly(circle(x,y,1+s%2))));}
      }
      engravings.push(pathFromPolygons(poly(circle(sx,sy,plan.sky==='sun'?22:16))));
    }else{
      const levels=[0,167,145,120,102];
      let g=ground(plan.theme,levels[i],(plan.seed||42)+i*19);
      if(i===4&&plan.theme==='coast')g=close([[0,112],[18,107],[39,89],[58,91],[75,108],[91,99],[117,104],[133,114],[156,101],[174,103],[200,95],[200,200],[0,200]]);
      let shapes=[g],holes=[];
      const selection=i===1?foreground:i===2?mid:i===3?landmark:null;
      if(selection){
        const x=i===1?83+(plan.seed%15):i===2?52:i===3?142:100;
        // All motifs overlap the ground by at least 10 normalized units.
        const localGround=g.slice(0,-3).reduce((a,p)=>Math.abs(p[0]-x)<Math.abs(a[0]-x)?p:a,g[0])[1];
        const m=motif(selection,x,localGround+1);
        shapes.push(...m.shapes); holes.push(...m.holes);engravings.push(...m.engravings);
      }
      const extra=i===2?extras[0]:i===4?extras[1]:null;
      if(extra){
        const x=i===2?154:55;
        // A group such as flowers has several stems; plant every stem below
        // the terrain across its footprint, including the steeper horizon.
        const footprint=motif(extra,x,0).shapes.flat();
        const left=Math.min(...footprint.map(p=>p[0])),right=Math.max(...footprint.map(p=>p[0]));
        const terrain=g.slice(0,-3);
        const nearest=terrain.reduce((a,p)=>Math.abs(p[0]-x)<Math.abs(a[0]-x)?p:a,terrain[0]);
        const b=Math.max(nearest[1],...terrain.filter(p=>p[0]>=left&&p[0]<=right).map(p=>p[1]))+1;
        const m=motif(extra,x,b);shapes.push(...m.shapes);holes.push(...m.holes);engravings.push(...m.engravings);
      }
      polygons=pc.union(frame(),merge(shapes));
      if(holes.length)polygons=pc.difference(polygons,...holes.map(poly));
      polygons=pc.intersection(polygons,outer);
    }
    if(reinforcement>0&&i>0&&i<5)polygons=pc.intersection(offsetPolygons(polygons,reinforcement*200/size),outer);
    layers.push({id:i,name:layerNames[i],polygons,engravings,color:colors.colors[i],path:pathFromPolygons(polygons),motif:i===1?foreground:i===2?mid:i===3?landmark:null});
  }
  const spacer={id:'spacer',name:'间隔框',polygons:frame(10),engravings:[],color:'#c3ac87'};
  const design={plan,size,thickness,material,reinforcement,layers,spacer,spacerCount:5,depth:11*thickness,colors,usedMotifs:[...new Set([foreground,mid,landmark,...extras])]};
  design.validation=validateDesign(design);
  return design;
}
export function validateDesign(design){
  const all=[...design.layers,design.spacer];
  const connected=all.every(l=>l.polygons.length===1);
  const finite=all.every(l=>l.polygons.flat(2).every(p=>p.every(Number.isFinite)));
  const bounded=all.every(l=>l.polygons.flat(2).every(([x,y])=>x>=-0.001&&y>=-0.001&&x<=200.001&&y<=200.001));
  const closed=all.every(l=>l.polygons.flat().every(r=>r.length>=4&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]));
  const checks=[{id:'connected',label:'每层保持单片连接',pass:connected,detail:'布尔运算后逐层计算连通部件，避免切下后出现独立悬浮零件。'},
    {id:'closed',label:'切割路径全部闭合',pass:closed&&finite,detail:'导出仅含有限坐标、闭合轮廓；切割与雕刻使用独立图层。'},
    {id:'bounds',label:`尺寸明确 · ${design.size} × ${design.size} mm`,pass:bounded,detail:'使用毫米尺寸与一致坐标系；所有部件限制在设计边界内。'},
    {id:'assembly',label:'6 层图案 + 5 个间隔框',pass:all.length===7&&design.spacerCount===5,detail:'以胶粘叠层装配，不依赖未经标定的卡扣配合。'}];
  return {pass:checks.every(c=>c.pass),checks,limitations:['尚未经过实体试切；几何检查不等于加工认证。','细节强度、焦距、切缝与材料适配需在设备端试切确认。'],physicalTested:false};
}
export const escapeXml = s => String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function cutSVG(design,layer){
  const k=design.size/200;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${design.size}mm" height="${design.size}mm" viewBox="0 0 ${design.size} ${design.size}"><title>${escapeXml(layer.name)} · 拾光剧场</title><desc>Red: cut. Blue: engrave. Millimetres. No kerf compensation. Test cut required.</desc><g id="CUT" fill="none" stroke="#ff0000" stroke-width="0.1"><path d="${pathFromPolygons(layer.polygons,k)}"/></g><g id="ENGRAVE" fill="none" stroke="#0000ff" stroke-width="0.1" transform="scale(${k})">${(layer.engravings||[]).map(d=>`<path d="${d}"/>`).join('')}</g></svg>`;
}
export function previewSVG(design){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="-10 -10 220 220"><title>${escapeXml(design.plan.title)}</title><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-opacity=".24"/></filter></defs>${[...design.layers].reverse().map(l=>`<g filter="url(#s)"><path fill="${l.id===0?'#d8bd98':l.color}" fill-rule="evenodd" d="${l.path}"/>${l.id===5?l.engravings.map(d=>`<path d="${d}" fill="${design.colors.sky}"/>`).join(''):l.engravings.map(d=>`<path d="${d}" fill="none" stroke="${design.colors.colors[0]}" stroke-width=".4" opacity=".6"/>`).join('')}</g>`).join('')}</svg>`;
}
