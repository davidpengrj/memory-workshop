import test from 'node:test';
import assert from 'node:assert/strict';
import {readDraft,saveDraft,parseDraft} from '../src/draft.js';
import {presets} from '../src/presets.js';
const draft=()=>({plan:presets[1].plan,story:'还没生成的新故事',renderedStory:presets[1].story,source:'kiro',size:220,material:'card',reinforcement:.8});
test('draft preserves actual rendered design separately from ungenerated story edits',()=>{let value;const storage={getItem:()=>value,setItem:(k,v)=>value=v};assert.equal(saveDraft(storage,draft()),true);assert.deepEqual(readDraft(storage),{...draft(),version:1});});
test('malformed and unsupported drafts fall back instead of crashing the editor',()=>{for(const value of ['broken','null',JSON.stringify({...draft(),version:2}),JSON.stringify({...draft(),version:1,size:200}),JSON.stringify({...draft(),version:1,plan:{...presets[0].plan,motifs:['invented']}})])assert.equal(parseDraft(value),null);});
test('unavailable local storage does not prevent using the app',()=>{const storage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('full');}};assert.equal(readDraft(storage),null);assert.equal(saveDraft(storage,draft()),false);});
