import JSZip from 'jszip';
import {escapeXml,pathFromPolygons,previewSVG} from './geometry.js';
import {standDimensions,standSTL} from './stand.js';

export function placementPaths(design,p){
  const w=p.originalWidth??p.width,h=p.originalHeight??p.height;
  const transform=`translate(${p.x} ${p.y})${p.rotated?` translate(${h} 0) rotate(90)`:''}`;
  if(p.kind==='strip')return {transform,cut:`M0 0H${w}V${h}H0Z`,engrave:[]};
  const layer=p.kind==='spacer'?design.spacer:design.layers[p.layerId];
  return {transform,cut:pathFromPolygons(layer.polygons,design.size/200),engrave:layer.engravings||[],scale:design.size/200};
}
export function boardSVG(design,sheet){
  const cut=[],engrave=[];
  for(const p of sheet.placements){const paths=placementPaths(design,p);cut.push(`<path id="${escapeXml(p.id)}" transform="${paths.transform}" d="${paths.cut}"/>`);for(const d of paths.engrave)engrave.push(`<path transform="${paths.transform} scale(${paths.scale})" d="${d}"/>`);}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}"><title>${escapeXml(sheet.name)} — ${sheet.id}</title><desc>Units millimetres. No kerf compensation. Red CUT; blue ENGRAVE. Sheet border and labels are not machining paths. Test required.</desc><g id="CUT" fill="none" stroke="#ff0000" stroke-width="0.1">${cut.join('')}</g><g id="ENGRAVE" fill="none" stroke="#0000ff" stroke-width="0.1">${engrave.join('')}</g></svg>`;
}
export function jobHTML(design,job,settings,calibration,stand){
  const e=escapeXml;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>拾光工坊 · 生产交接单</title><style>body{font:15px/1.8 sans-serif;color:#25483e;max-width:1000px;margin:40px auto;padding:20px}h1,h2{font-family:serif}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ddd;text-align:left}svg{max-width:330px;height:auto}.note{background:#f5eddb;padding:16px}small{color:#777}@media print{button{display:none}h2{break-after:avoid}}</style><h1>拾光工坊 / 生产交接单</h1><h2>${e(design.plan.title)}</h2>${previewSVG(design)}<p>成品：${design.size} × ${design.size} mm × ${settings.quantity} 件；材料为 ${e(design.material)}。图案加固外扩 ${design.reinforcement||0} mm。</p><p>结构：${settings.mode==='strips'?'每件六层图案 + 20 根间隔条，组成五个框':'每件六层图案 + 五个整框'}。用适配胶粘合，不需要紧配合卡扣。</p><h2>01 / 核对板材与文件</h2><p>使用新板 ${job.stats.newSheetCount} 张、余料 ${job.stats.reclaimedSheetCount} 张。全部 ${job.stats.placedCount} 个零件已排入有限库存。边距 ${settings.margin} mm，件间距 ${settings.gap} mm。所有板材应为相同厚度、同一种已知适切材料。旧料的厚度、裂纹、翘曲和表面情况需确认。</p><table><tr><th>文件</th><th>板材</th><th>尺寸</th><th>零件数</th></tr>${job.sheets.map((s,i)=>`<tr><td>boards/${String(i+1).padStart(2,'0')}-${s.id}.svg</td><td>${e(s.name)} · ${s.reclaimed?'余料':'新板'}</td><td>${s.width} × ${s.height} mm</td><td>${s.placements.length}</td></tr>`).join('')}</table><p>SVG 只有实际加工路径：红色 CUT，蓝色 ENGRAVE；板边、编号不作为切割线。导入 Falcon Design Space 等设备软件后复核毫米尺寸、零件朝向、路径顺序与实际板面位置。此包不控制设备，不包含机器功率、速度或 G-code。</p><h2>02 / 试切与校准</h2><p>先切 calibration.svg。外片名义尺寸 30 mm，中心方孔 10 mm。记录两者尺寸以估计切缝；图纸没有自动切缝补偿。</p><p>${calibration?.valid?`当前用户录入的切缝估计：${calibration.kerf} mm，双测量${calibration.consistent?'一致':'差异较大，请重测'}。这是用户录入，未由设备核验。`:'尚未录入实测切缝。'}</p><p class="note">尚未实体加工验证。几何检查只用于定位可能的细节问题，不能保证强度和加工成功。对最小细节试切，再决定是否批量制作；加固会改变轮廓并缩小或封闭部分小孔。</p><h2>03 / 叠层装配</h2>${settings.mode==='strips'?`<p>每个框使用两根 ${design.size} × ${design.size*.05} mm 长条作上下边，两根 ${design.size*.9} × ${design.size*.05} mm 短条作左右边。短条放在长条之间，四条齐平对接，外尺寸 ${design.size} mm。先干拼并用方尺/夹具定位，胶粘在相邻图案之间；一共制作五个间隔框。条端为胶粘接头，实际强度需验证。</p>`:'<p>每件使用五个整框，框之间外边缘对齐。</p>'}<p>背板（第6层）→ 间隔框 → 第5层 → 间隔框 → 第4层 → 间隔框 → 第3层 → 间隔框 → 第2层 → 间隔框 → 第1层。每件都用同一套图案。零件对应关系见 parts.csv，u1、u2 表示成品编号。灯具、外箱与电路另备。</p><h2>04 / 3D 打印展示底座</h2><p>stand.stl 单位为毫米；宽 ${stand.width}，深 ${stand.depth.toFixed(2)}，高 ${stand.height}。槽宽 = 11 × 板厚 ${stand.thickness} + 总装配余量 ${stand.clearance} = ${stand.slot} mm。每件打印一个，本单共打印 ${stand.printCount} 个。厚度字段是用户填写值；若未实测请先实测，包括胶层所需余量。</p><p>把 STL 导入 Creality Print 或其他切片软件，确认尺寸及底面朝下，自行选择经验证的材料与参数。已检查闭合网格，尚未验证打印、装配与稳定性；先试做一个，不把尺寸适配视为实物认证。</p><h2>05 / 排版依据</h2><p>矩形启发式排版，优先余料；未在孔洞内套料，不保证全局最优。占地率 ${(job.stats.utilization*100).toFixed(1)}% 仅为零件矩形包络占已使用板面的比例，不是净材料利用率。方案没有自动购买或补充板材。stock 与零件完整清单见 job.json。</p><button onclick="print()">打印交接单</button></html>`;
}
export async function buildJobZip(design,source,job,settings,preflight,calibration){
  if(!design.validation.pass||job.unplaced.length||!job.sheets.length)throw new Error('还有零件未排入库存，或几何检查未通过，不能导出完整生产包。');
  const zip=new JSZip(),stand={...standDimensions(settings.actualThickness,settings.clearance),printCount:settings.quantity,perProductCount:1};
  job.sheets.forEach((s,i)=>zip.file(`boards/${String(i+1).padStart(2,'0')}-${s.id}.svg`,boardSVG(design,s)));
  zip.file('stand.stl',standSTL(settings.actualThickness,settings.clearance));
  zip.file('calibration.svg','<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><title>30 mm square and 10 mm hole</title><g id="CUT" fill="none" stroke="red" stroke-width="0.1"><path d="M0 0H30V30H0Z M10 10H20V20H10Z"/></g></svg>');
  zip.file('生产交接单.html',jobHTML(design,job,settings,calibration,stand));
  zip.file('preview.svg',previewSVG(design));
  zip.file('job.json',JSON.stringify({version:2,source,plan:design.plan,sizeMm:design.size,reinforcementMm:design.reinforcement,settings,packing:job,preflight,calibration,stand,kerfCompensated:false,physicalTested:false},null,2));
  const rows=[['part_id','unit','type','sheet','x_mm','y_mm','width_mm','height_mm','rotated']];
  job.sheets.forEach(s=>s.placements.forEach(p=>rows.push([p.id,p.unit,p.kind,s.id,p.x,p.y,p.width,p.height,p.rotated])));
  zip.file('parts.csv',rows.map(r=>r.join(',')).join('\n'));
  zip.file('先读我.txt','拾光工坊 · 生产包\n\n先打开“生产交接单.html”。boards/ 是已排版的实际切割图，切每张一次。stand.stl 是独立的3D打印展示底座。calibration.svg 为试切校准。parts.csv 给出零件定位。\n所有尺寸为毫米；未预设切缝补偿，未经过实体试切。不要把效果图当作切割文件。\n该方案仅根据输入库存进行矩形排版，未连接设备或下单购料。');
  return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
