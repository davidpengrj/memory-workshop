import {createDesign} from './geometry.js';
import {motifLabels,palettes} from './presets.js';

const KEY='memory-workshop-draft-v1';
export function parseDraft(text){
  try{
    const d=JSON.parse(text),p=d?.plan;
    if(d?.version!==1||![140,180,220].includes(d.size)||!['wood','card'].includes(d.material)||![0,.4,.8,1.2].includes(d.reinforcement)||!['example','kiro'].includes(d.source))return null;
    if(![d.story,d.renderedStory].every(s=>typeof s==='string'&&s.length<=2400))return null;
    if(!p||!['coast','garden','city','mountain'].includes(p.theme)||!Object.hasOwn(palettes,p.palette)||!['sun','moon','stars'].includes(p.sky)||!Number.isFinite(p.seed))return null;
    if(!['title','subtitle','narrative','dedication'].every(k=>typeof p[k]==='string'&&p[k].length<=1200))return null;
    if(!Array.isArray(p.motifs)||p.motifs.length>12||!p.motifs.every(m=>Object.hasOwn(motifLabels,m)))return null;
    if(!Array.isArray(p.decisions)||p.decisions.length!==3||!p.decisions.every(s=>typeof s==='string'&&s.length<=1200))return null;
    if(!createDesign(p,d).validation.pass)return null;
    return d;
  }catch{return null;}
}
export function readDraft(storage){try{return parseDraft(storage.getItem(KEY));}catch{return null;}}
export function saveDraft(storage,draft){try{storage.setItem(KEY,JSON.stringify({...draft,version:1}));return true;}catch{return false;}}
