import JSZip from 'jszip';
import {cutSVG,previewSVG,escapeXml} from './geometry.js';

export function assemblyHTML(design){
  const {plan,size,thickness,material,depth}=design;
  const e=escapeXml;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(plan.title)} · 制作说明</title><style>body{font:16px/1.8 Georgia,'Songti SC',serif;color:#25433d;background:#f7f5ee;max-width:900px;margin:45px auto;padding:24px}h1{font-size:36px}h2{margin-top:35px}small{letter-spacing:.15em}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #bcc9bd;padding:12px;text-align:left}.art{width:330px;float:right;margin-left:30px}.note{padding:15px 20px;background:#e8e4d6}li{margin:10px 0}@media print{body{margin:0;background:white}.art{width:260px}.no-print{display:none}}@media(max-width:600px){.art{float:none;width:100%;margin:0}}</style><small>MEMORY THEATRE / 拾光剧场</small><div class="art">${previewSVG(design)}</div><h1>${e(plan.title)}</h1><p>${e(plan.narrative)}</p><p>“${e(plan.dedication)}”</p><p>${size} × ${size} mm · ${e(material)}<br>6 层图案 + 5 个间隔框 · 叠层总厚度约 ${depth} mm（不含胶层、灯带及外框）</p><p class="note">这是未经实体试切的设计文件。已完成基础几何检查；请由熟悉设备的操作者确认材料、细节强度和切割参数后试切。</p><h2>01 / 文件与材料</h2><table><tr><th>文件</th><th>数量</th><th>用途</th></tr>${design.layers.map(l=>`<tr><td>layer-${l.id+1}-${e(l.name)}.svg</td><td>1</td><td>${l.id===0?'最前层':l.id===5?'最后一层':e(l.name)}</td></tr>`).join('')}<tr><td>spacer.svg</td><td>5</td><td>每两层之间放置一个间隔框</td></tr></table><p>此外准备：适配材料的胶、夹具，可选低压 LED 灯带与电源、配套外框。配色为上色参考，SVG 不会自动产生彩色材料。此版本导出叠层部件，不包含箱体结构、电路或灯具设计。</p><h2>02 / 切割前</h2><ol><li>将 SVG 导入设备软件，按毫米导入，确认外框 ${size} × ${size} mm。不要自动缩放到纸张。</li><li>红色 CUT 图层为切割，蓝色 ENGRAVE 图层为雕刻；按设备软件要求分别设置。不存在蓝线的图层仅切割。效果图不是切割文件。</li><li>使用实际厚度 ${thickness} mm 的已知适切材料。本文不提供通用功率或速度；按设备及材料官方要求试切。不要使用来源不明或不适合激光的材料。</li><li>先试切导出包中的 calibration.svg：外轮廓 30 × 30 mm、中心孔 10 × 10 mm。测量切缝与尺寸，必要时在设备软件补偿；成品文件未预置切缝补偿。</li><li>再试切含最小细节的一层（小猫眼睛、窗户、帆船等），确认细节和连接处足够牢固。未通过则放大尺寸或加厚细节后重新制作。</li></ol><h2>03 / 装配</h2><ol><li>清理切口，将各图案按预览配色上色并晾干；也可保留材料本色。</li><li>背板（第 6 层）朝上，依次叠放：间隔框 → 第 5 层 → 间隔框 → 第 4 层 → 间隔框 → 第 3 层 → 间隔框 → 第 2 层 → 间隔框 → 第 1 层。所有外边缘对齐。</li><li>先干叠检查图案与朝向，再少量上胶固定。此设计为胶粘叠层，没有卡扣或紧配合。</li><li>若要照明，使用适配的低压 LED 和外框组件，由熟悉该组件的人安装。预览灯光仅表达视觉意图，木材不透光，实际效果取决于安装位置、层距、材料与灯具。</li><li>把这张故事卡放在礼物旁边。留下一段故事，也留下一点光。</li></ol><h2>04 / 检查记录</h2><ul>${design.validation.checks.map(c=>`<li>${c.pass?'通过':'需修正'} — ${e(c.label)}</li>`).join('')}</ul><p>生成方式：约束场景参数 → 多边形布尔运算 → 几何检查 → 毫米 SVG。更多参数见 scene.json 与 validation.json。</p><button class="no-print" onclick="window.print()">打印这份说明</button></html>`;
}
export async function buildZip(design,source='example'){
  if(!design.validation.pass)throw new Error('结构检查未通过，请先调整场景后导出。');
  const zip=new JSZip();
  design.layers.forEach(l=>zip.file(`cut/layer-${l.id+1}-${l.name}.svg`,cutSVG(design,l)));
  zip.file('cut/spacer.svg',cutSVG(design,design.spacer));
  zip.file('cut/calibration.svg','<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><title>30mm test square, 10mm hole</title><path d="M0 0H30V30H0Z M10 10H20V20H10Z" fill="none" stroke="red" stroke-width="0.1"/></svg>');
  zip.file('preview.svg',previewSVG(design));zip.file('制作与装配说明.html',assemblyHTML(design));
  zip.file('scene.json',JSON.stringify({version:2,reinforcementMm:design.reinforcement||0,source,plan:design.plan,sizeMm:design.size,material:design.material,thicknessMm:design.thickness,spacerCount:5,kerfCompensated:false},null,2));
  zip.file('validation.json',JSON.stringify(design.validation,null,2));
  zip.file('先读我.txt',`拾光剧场 / ${design.plan.title}\n\n1. 双击“制作与装配说明.html”。\n2. cut/ 内 6 个图案每个切 1 份，spacer.svg 切 5 份。\n3. calibration.svg 是独立尺寸试切片。\n4. SVG 单位毫米，红线切割，蓝线雕刻。\n5. preview.svg 仅为配色效果参考，不可作为切割文件。\n6. 本项目未经过实体试切，必须使用实际材料验证；不包含设备参数、外箱或电路。\n\n设计输入仅使用声明式场景参数，未执行模型生成代码。`);
  return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
export function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
