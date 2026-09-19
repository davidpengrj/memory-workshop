import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,ArrowRight,ArrowDownToLine,Sparkles,Layers,Sun,Moon,RotateCcw,Check,CheckCheck,X,Plus,Minus,MoveUpRight,Info,ChevronRight,Heart,LoaderCircle,Bookmark,BookOpen,Waves,Cat,Landmark,Maximize2,Box,Scissors,ShieldCheck,AlertCircle} from 'lucide-react';
import {presets,palettes,motifLabels} from './presets.js';
import {createDesign,pathFromPolygons,previewSVG} from './geometry.js';
import {buildZip,download,assemblyHTML} from './export.js';
import Scene from './Scene.jsx';
import Production from './Production.jsx';
import {readDraft,saveDraft} from './draft.js';
import './production.css';
import './style.css';

function LayerArt({layer,all=false,design}){
  return <svg viewBox="-4 -4 208 208" aria-hidden="true">{all?[...design.layers].reverse().map(l=><path key={l.id} d={l.path} fill={l.color} fillRule="evenodd"/>):<path d={layer.path} fill={layer.id===0?'#d8bd98':layer.color} fillRule="evenodd"/>}</svg>;
}
function Modal({title,children,onClose}){
  const ref=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;ref.current?.querySelector('button')?.focus();
    function key(e){if(e.key==='Escape')onClose();if(e.key==='Tab'){const els=[...ref.current.querySelectorAll('button,a,input,select')].filter(el=>!el.disabled);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
    document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;previous?.focus();};
  },[]);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-top"><span className="eyebrow">FROM SCREEN TO SOMETHING REAL</span><button className="icon-button" onClick={onClose} aria-label="关闭窗口"><X size={20}/></button></div><h2>{title}</h2>{children}</section></div>;
}
function App(){
  const [draft]=useState(()=>{try{return readDraft(localStorage);}catch{return null;}});
  const [draftSaved,setDraftSaved]=useState(true);
  const [tab,setTab]=useState(()=>location.hash==='#production'?'production':'story');
  const [reinforcement,setReinforcement]=useState(draft?.reinforcement??0);
  useEffect(()=>{history.replaceState(null,'',tab==='production'?'#production':'#story');window.scrollTo({top:0,behavior:'instant'});},[tab]);
  const [plan,setPlan]=useState(draft?.plan??presets[0].plan),[story,setStory]=useState(draft?.story??presets[0].story),[renderedStory,setRenderedStory]=useState(draft?.renderedStory??presets[0].story);
  const [sample,setSample]=useState(draft?null:'sea'),[source,setSource]=useState(draft?.source??'example'),[size,setSize]=useState(draft?.size??180),[material,setMaterial]=useState(draft?.material??'wood');
  const [exploded,setExploded]=useState(false),[lit,setLit]=useState(true),[activeLayer,setActiveLayer]=useState(null),[resetKey,setResetKey]=useState(0),[view,setView]=useState('scene');
  const [busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[status,setStatus]=useState('checking');
  const [modal,setModal]=useState(null),[exporting,setExporting]=useState(false),[toast,setToast]=useState(''),[saved,setSaved]=useState(false),[hasSaved,setHasSaved]=useState(false);
  const requestRef=useRef(null),toastRef=useRef(null);
  const design=useMemo(()=>createDesign(plan,{size,material,reinforcement}),[plan,size,material,reinforcement]);
  const changed=story!==renderedStory;
  useEffect(()=>{try{setDraftSaved(saveDraft(localStorage,{plan,story,renderedStory,source,size,material,reinforcement}));}catch{setDraftSaved(false);}},[plan,story,renderedStory,source,size,material,reinforcement]);
  useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(d=>setStatus(d.aiAvailable?'ready':'unavailable')).catch(()=>setStatus('unavailable'));try{setHasSaved(Boolean(localStorage.getItem('memory-theatre-design')));}catch{}return()=>requestRef.current?.abort();},[]);
  useEffect(()=>{if(!busy)return;setSeconds(0);const t=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(t);},[busy]);
  useEffect(()=>{setSaved(false);},[plan,size,material,reinforcement]);
  function notify(s){setToast(s);clearTimeout(toastRef.current);toastRef.current=setTimeout(()=>setToast(''),4000);}
  function choose(p){requestRef.current?.abort();setBusy(false);setPlan(p.plan);setReinforcement(0);setStory(p.story);setRenderedStory(p.story);setSample(p.id);setSource('example');setError('');setActiveLayer(null);setExploded(false);}
  async function generate(){
    if([...story.trim()].length<8){setError('多告诉我一点吧，至少写 8 个字。');return;}
    setError('');setBusy(true);setSample(null);
    const controller=new AbortController();requestRef.current=controller;
    try{
      const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({story}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'暂时没能生成，请再试一次。');
      const check=createDesign(data.plan,{size,material,reinforcement});if(!check.validation.pass)throw new Error('这次方案的结构检查没有通过。请换一种描述再试，当前作品已保留。');
      setPlan(data.plan);setRenderedStory(story);setSource('kiro');setActiveLayer(null);setExploded(false);setView('scene');
      notify(data.cached?'已找回这段回忆的 AI 设计，未重复调用模型。':'你的回忆已经变成了一座小剧场。');
    }catch(e){if(e.name!=='AbortError')setError(e.message);}finally{if(requestRef.current===controller){setBusy(false);requestRef.current=null;}}
  }
  function save(){try{localStorage.setItem('memory-theatre-design',JSON.stringify({plan,story:renderedStory,source,size,material,reinforcement}));setSaved(true);setHasSaved(true);notify('已保存在这个浏览器里。');}catch{notify('浏览器无法保存，请下载制作包保留设计。');}}
  function restore(){try{const d=JSON.parse(localStorage.getItem('memory-theatre-design'));if(!d?.plan?.motifs)throw new Error();const v=createDesign(d.plan,{size:d.size,material:d.material,reinforcement:d.reinforcement||0});if(!v.validation.pass)throw new Error();setPlan(d.plan);setReinforcement(d.reinforcement||0);setStory(d.story);setRenderedStory(d.story);setSize(d.size);setMaterial(d.material);setSource(d.source);setSample(null);setError('');notify('已打开上次保存的作品。');}catch{notify('没有找到可恢复的作品。');}}
  async function exportPackage(){setExporting(true);try{download(await buildZip(design,source),`拾光剧场-${plan.title.replace(/[\\/:*?"<>|]/g,'')}.zip`);setModal(null);notify('制作包已下载。先打开其中的装配说明。');}catch(e){notify(e.message);}finally{setExporting(false);}}
  const SampleIcons={waves:Waves,cat:Cat,arch:Landmark};
  return <>
    <header className="site-header"><a className="brand" href="#story" onClick={()=>setTab('story')} aria-label="拾光工坊首页"><span className="brand-mark"><span/><span/><span/></span><span><b>拾光工坊</b><small>MEMORY WORKSHOP</small></span></a><nav aria-label="主导航"><button className={tab==='story'?'nav-active':''} onClick={()=>setTab('story')}>故事设计</button><button className={tab==='production'?'nav-active':''} onClick={()=>setTab('production')}>生产工作台 <span className="nav-new">NEW</span></button><button className="nav-guide" onClick={()=>setModal('guide')}>制作指南 <ArrowUpRight size={13}/></button></nav><div className="header-right"><span className="edition">FROM MEMORY TO MAKING.</span><button className="round-button" aria-label="项目介绍" onClick={()=>setModal('about')}><Info size={17}/></button></div></header>
    <main><div className={`draft-status ${draftSaved?'':'unavailable'}`} role="status"><span>{draftSaved?<CheckCheck size={13}/>:<Info size={13}/>} {draftSaved?(draft?'已恢复上次编辑 · 进度自动保存':'进度自动保存'):'浏览器暂时无法保存，请导出文件保留设计'}</span><small>{draftSaved?'仅此浏览器 · 刷新后可继续':''}</small></div>{tab==='production'?<Production design={design} source={source} onSizeChange={setSize} reinforcement={reinforcement} onReinforce={setReinforcement} onBack={()=>setTab('story')}/>:<>
      <section className="intro"><div><div className="eyebrow"><span className="mini-line"/> YOUR STORY, IN LAYERS</div><h1>把那一天，<em>留在光里。</em></h1></div><p>一段回忆，一座小小的光影剧场。<br/>从故事设计，到余料里做得出的礼物。</p><span className="intro-stamp">MADE OF<br/><i>moments.</i><Sparkles size={19}/></span></section>
      <div className="workspace">
        <aside className="composer" aria-label="创作设置">
          <div className="section-heading"><span className="step-number">01</span><h2>从一个故事开始</h2><Heart size={17}/></div>
          <p className="helper">想留住谁，或哪一个瞬间？</p>
          <div className="sample-list" aria-label="示例故事">{presets.map(p=>{const Icon=SampleIcons[p.icon];return <button key={p.id} disabled={busy} className={sample===p.id?'sample selected':'sample'} onClick={()=>choose(p)}><Icon size={16}/><span>{p.tag}</span><ChevronRight size={14}/></button>;})}</div>
          <div className="story-field"><label htmlFor="story">我的回忆<span>{[...story].length} / 1200</span></label><textarea id="story" value={story} maxLength={1200} disabled={busy} onChange={e=>{setStory(e.target.value);setSample(null);setError('');}} placeholder="比如，那个和朋友在海边等日出的清晨……"/><div className="story-footer"><span><Sparkles size={12}/> 写具体一点，故事会更有温度</span></div></div>
          <div className="settings-divider"/>
          <div className="section-heading small"><span className="step-number">02</span><h2>让它更像你</h2></div>
          <div className="setting"><span className="field-label">配色心情 <span>上色参考</span></span><div className="palette-options">{Object.entries(palettes).map(([key,p])=><button key={key} className={`palette-choice ${plan.palette===key?'selected':''}`} onClick={()=>setPlan({...plan,palette:key})} aria-label={p.name} aria-pressed={plan.palette===key} title={p.name}><span className="color-strip">{p.colors.slice(1).map(c=><i key={c} style={{background:c}}/>)}</span>{plan.palette===key&&<Check size={11}/>}</button>)}</div><span className="current-palette">{design.colors.name}</span></div>
          <div className="paired-settings"><label className="setting">成品尺寸<select value={size} onChange={e=>setSize(+e.target.value)} aria-label="成品尺寸"><option value={140}>14 × 14 cm</option><option value={180}>18 × 18 cm</option><option value={220}>22 × 22 cm</option></select></label><label className="setting">制作材料<select value={material} onChange={e=>setMaterial(e.target.value)} aria-label="制作材料"><option value="wood">3 mm 椴木板</option><option value="card">1.5 mm 卡纸</option></select></label></div>
          {error&&<div className="error-message" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
          <button className="primary-button generate" onClick={generate} disabled={busy||status!=='ready'}>{busy?<><LoaderCircle size={18} className="spin"/> 正在理解你的故事 · {seconds}s</>:<><Sparkles size={17}/> 把回忆变成光 <ArrowRight size={18}/></>}</button>
          <p className="provider-note"><span className={`status-dot ${status==='ready'?'online':''}`}/>{status==='ready'?'AI 已就绪 · 生成使用你的 Kiro 额度':status==='checking'?'正在连接创作助手…':'AI 暂不可用 · 仍可体验示例与导出'}</p>
          {busy&&<button className="text-button cancel" onClick={()=>{requestRef.current?.abort();setBusy(false);}}>取消生成</button>}
        </aside>
        <section className="studio" aria-label="作品工作室">
          <div className="preview-stage" style={{'--scene-bg':design.colors.bg}}>
            <div className="stage-top"><div className="view-tabs" role="tablist" aria-label="预览方式"><button role="tab" aria-selected={view==='scene'} onClick={()=>setView('scene')}><Box size={14}/> 光影预览</button><button role="tab" aria-selected={view==='cut'} onClick={()=>setView('cut')}><Scissors size={14}/> 切割图纸</button></div><span className="source-badge"><span/>{source==='kiro'?'AI 生成方案':'示例作品'}</span></div>
            {view==='scene'?<><Scene design={design} exploded={exploded} lit={lit} activeLayer={activeLayer} resetKey={resetKey}/><span className="dimension vertical">{size} mm</span><span className="dimension horizontal">{size} mm</span><div className="scene-caption"><span className="scene-index">NO. {String(plan.seed%1000).padStart(3,'0')}</span><span>{plan.subtitle}</span></div><div className="preview-controls"><button className={exploded?'active':''} onClick={()=>{setExploded(!exploded);setActiveLayer(null);}} aria-pressed={exploded}><Layers size={16}/>{exploded?'合上剧场':'展开分层'}</button><span/><button onClick={()=>setLit(!lit)} aria-pressed={lit}>{lit?<Sun size={17}/>:<Moon size={17}/>}<span>{lit?'暖光已开启':'开启暖光'}</span></button><span/><button className="reset-view" onClick={()=>setResetKey(k=>k+1)} aria-label="重置视角" title="重置视角"><RotateCcw size={15}/></button></div><span className="drag-hint">拖动旋转 · 灯光为效果示意</span></>:<div className="cut-grid">{design.layers.map(l=><div className="cut-tile" key={l.id}><span>0{l.id+1} / {l.name}</span><svg viewBox="-10 -10 220 220" aria-label={`${l.name}切割图`}><path d={l.path} stroke="#ad4a42" fill="none" strokeWidth=".6"/>{l.engravings.map((d,i)=><path key={i} d={d} stroke="#477496" strokeWidth=".6" fill="none"/>)}</svg></div>)}<p><span className="legend-dot cut"/> 红线切割 <span className="legend-dot engrave"/> 蓝线雕刻 <span>导出尺寸 {size} × {size} mm</span></p></div>}
            {busy&&<div className="generation-overlay" role="status"><div className="orb"><Sparkles size={30}/></div><h3>让回忆慢慢成形</h3><p>正在提炼场景与情绪，通常需要几十秒。</p><span>{seconds} 秒 · AI 生成中</span></div>}
          </div>
          <div className="piece-details"><div><div className="eyebrow">A MEMORY WORTH KEEPING {changed&&<span className="changed-tag">故事已修改，等待生成</span>}</div><h2>{plan.title}</h2><p>{plan.narrative}</p></div><button className={`save-button ${saved?'saved':''}`} onClick={save} aria-label="保存作品">{saved?<Check size={19}/>:<Bookmark size={19}/>}<span>{saved?'已保存':'保存'}</span></button></div>
          <div className="layer-strip"><span className="layer-label"><Layers size={15}/><b>一层一段回忆</b><small>从近处，到远方</small></span><div className="layer-thumbs">{design.layers.map(l=><button key={l.id} className={activeLayer===l.id?'layer-thumb selected':'layer-thumb'} onClick={()=>{setActiveLayer(activeLayer===l.id?null:l.id);setExploded(true);setView('scene');}} aria-label={`查看第${l.id+1}层${l.name}`} aria-pressed={activeLayer===l.id}><LayerArt layer={l}/><span><i>0{l.id+1}</i>{l.name}</span></button>)}</div></div>
        </section>
      </div>
      <section className="making-bar"><div className="validation-summary"><span className="check-medal">{design.validation.pass?<ShieldCheck size={24}/>:<AlertCircle size={24}/>}</span><div><strong>{design.validation.pass?'基础结构检查通过':'结构需要调整'}</strong><p>闭合轮廓 · 单片连接 · 毫米尺寸 <span>实体效果需试切确认</span></p></div></div><div className="download-area"><span>6 层图案 + 间隔框 + 装配说明</span><button className="primary-button" onClick={()=>setModal('export')} disabled={!design.validation.pass}><ArrowDownToLine size={17}/> 下载制作包 <ArrowUpRight size={16}/></button></div></section>
      <button className="workshop-bridge" onClick={()=>setTab('production')}><span><Layers size={22}/><b>接下来，让手边材料派上用场。</b></span><span>余料排版 · 细节加固 · 3D 打印底座 <ArrowRight size={19}/></span></button>
      <section className="story-notes"><div className="notes-title"><span className="eyebrow">BEHIND YOUR LITTLE THEATRE</span><h2>每个细节，<br/>都有来处。</h2><span className="small-serif">{source==='kiro'?'AI 对你的故事的理解':'这份示例的设计思路'}</span></div><div className="decisions">{plan.decisions.map((d,i)=><div key={i}><span>0{i+1}</span><p>{d}</p></div>)}</div><div className="dedication"><span className="quote-mark">“</span><p>{plan.dedication}</p><small>把这句话，和礼物一起送给 TA。</small></div></section>
    </>}</main>
    <footer><span className="footer-logo">拾光工坊 <i>Memory Workshop</i></span><span>让故事走出屏幕，让回忆有处安放。</span><div>{hasSaved&&<button onClick={restore}>打开上次保存</button>}<button onClick={()=>setModal('about')}>关于这个作品 <ArrowUpRight size={12}/></button></div></footer>
    {toast&&<div className="toast" role="status"><CheckCheck size={18}/>{toast}</div>}
    {modal==='export'&&<Modal title="把光，带回现实。" onClose={()=>setModal(null)}><p className="modal-intro">你的制作包已经准备好了。带到熟悉激光加工的工坊，就能开始试切与装配。</p><div className="export-summary"><div className="export-preview" dangerouslySetInnerHTML={{__html:previewSVG(design)}}/><div><h3>{plan.title}</h3><p>{size} × {size} mm<br/>{design.material}<br/>叠层厚度约 {design.depth} mm</p><span className="format-tag">SVG + HTML + JSON</span></div></div><div className="checklist">{design.validation.checks.map(c=><div key={c.id}><Check size={16}/><span>{c.label}</span></div>)}</div><div className="material-note"><Info size={18}/><p>已完成基础几何检查，尚未实体试切。请先做尺寸校准和细节试切；灯光与配色是效果参考，外箱及照明组件需另备。</p></div><button className="primary-button full-width" disabled={exporting} onClick={exportPackage}>{exporting?<LoaderCircle className="spin" size={18}/>:<ArrowDownToLine size={18}/>} {exporting?'正在打包…':'下载完整制作包 .zip'}</button></Modal>}
    {modal==='guide'&&<Modal title="从一段故事，到一份礼物。" onClose={()=>setModal(null)}><div className="guide-steps">{[['写下回忆','说说那天的地点、人物、物件和心情。AI 会把它们整理成一个分层场景。'],['看看每一层','旋转、展开、调整配色和尺寸。基础结构检查会确认每层连接、轮廓闭合与尺寸边界。'],['导出，再试切','下载 SVG 与校准试片，交给熟悉设备的操作者。具体功率、速度与切缝由设备和材料决定。'],['按顺序，装进光里','从背板向前叠放，每层之间加间隔框，用适配的胶固定。可另配外框与低压 LED。']].map(([t,d],i)=><div key={t}><span>0{i+1}</span><div><h3>{t}</h3><p>{d}</p></div></div>)}</div><button className="secondary-button full-width" onClick={()=>download(new Blob([assemblyHTML(design)],{type:'text/html;charset=utf-8'}),'拾光剧场-装配说明.html')}><BookOpen size={17}/> 下载当前作品的详细说明</button></Modal>}
    {modal==='about'&&<Modal title="给回忆一个小小的舞台。" onClose={()=>setModal(null)}><p className="modal-intro">拾光工坊为 MakerMuse 场景赛道而作：从一段回忆出发，把有情感的光影设计，变成手边材料能承接的制作方案。</p><div className="about-flow"><span>故事</span><ArrowRight/><span>AI 场景</span><ArrowRight/><span>库存求解</span><ArrowRight/><span>生产交接</span></div><p className="about-detail">当前版本支持海岸、山林、城市和庭院四类场景，以及 12 种图形意象。AI 选择和组合这些参数，几何引擎生成真实轮廓。生产工作台比较有限库存下的尺寸与结构，支持余料排版、轮廓加固、切缝记录及参数化底座 STL。示例与本地计算不消耗 AI 额度；自定义故事使用已连接的 Kiro。</p><p className="material-note">作品未经实体加工验证。请以导出说明和实际试切结果为准。</p></Modal>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
