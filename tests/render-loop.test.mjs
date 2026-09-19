import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderLoop} from '../src/render-loop.js';

// Minimal deterministic harness -----------------------------------------
function harness(){
  let nextId=1;
  const pending=new Map();
  const requestFrame=(cb)=>{const id=nextId++;pending.set(id,cb);return id;};
  const cancelFrame=(id)=>{pending.delete(id);};
  // Run exactly the frames currently queued (a real RAF batch).
  const flush=()=>{const batch=[...pending.entries()];pending.clear();for(const [,cb] of batch)cb();};
  const doc={visibilityState:'visible',listeners:{},addEventListener(t,fn){(this.listeners[t]||(this.listeners[t]=[])).push(fn);},removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]||[]).filter(f=>f!==fn);},emit(t){(this.listeners[t]||[]).forEach(fn=>fn());}};
  let observerCb=null;let observed=null;let disconnected=false;
  class ObserverCtor{constructor(cb){observerCb=cb;}observe(el){observed=el;}disconnect(){disconnected=true;}}
  const trigger=(isIntersecting)=>observerCb([{isIntersecting}]);
  return {requestFrame,cancelFrame,flush,pendingCount:()=>pending.size,doc,ObserverCtor,trigger,observed:()=>observed,isDisconnected:()=>disconnected};
}

test('settles: keeps rendering while animating then stops',()=>{
  const h=harness();
  let remaining=3;// three "moving" frames, then still
  let renders=0;
  const loop=createRenderLoop({element:{},render:()=>{renders++;return (--remaining)>0;},requestFrame:h.requestFrame,cancelFrame:h.cancelFrame,doc:h.doc,ObserverCtor:h.ObserverCtor});
  // Initial invalidate scheduled one frame.
  assert.equal(h.pendingCount(),1);
  h.flush();// frame1 moving -> schedules frame2
  h.flush();// frame2 moving -> schedules frame3
  h.flush();// frame3 still -> stops
  assert.equal(renders,3);
  assert.equal(h.pendingCount(),0);
  assert.equal(loop.isRunning(),false);
  // A fresh invalidate wakes it again.
  remaining=1;loop.invalidate();assert.equal(h.pendingCount(),1);h.flush();assert.equal(loop.isRunning(),false);
});

test('invalidate coalesces to a single pending frame',()=>{
  const h=harness();
  const loop=createRenderLoop({element:{},render:()=>false,requestFrame:h.requestFrame,cancelFrame:h.cancelFrame,doc:h.doc,ObserverCtor:h.ObserverCtor});
  loop.invalidate();loop.invalidate();loop.invalidate();
  assert.equal(h.pendingCount(),1);
});

test('offscreen pauses scheduling; becoming visible resumes',()=>{
  const h=harness();
  let renders=0;
  const loop=createRenderLoop({element:{},render:()=>{renders++;return false;},requestFrame:h.requestFrame,cancelFrame:h.cancelFrame,doc:h.doc,ObserverCtor:h.ObserverCtor});
  h.flush();assert.equal(renders,1);
  h.trigger(false);// offscreen
  loop.invalidate();// requests while hidden are ignored
  assert.equal(h.pendingCount(),0);
  assert.equal(loop.isVisible(),false);
  h.trigger(true);// back on screen wakes automatically
  assert.equal(h.pendingCount(),1);
  h.flush();assert.equal(renders,2);
});

test('document hidden pauses; visibilitychange back wakes',()=>{
  const h=harness();
  let renders=0;
  createRenderLoop({element:{},render:()=>{renders++;return false;},requestFrame:h.requestFrame,cancelFrame:h.cancelFrame,doc:h.doc,ObserverCtor:h.ObserverCtor});
  h.flush();assert.equal(renders,1);
  h.doc.visibilityState='hidden';h.doc.emit('visibilitychange');
  assert.equal(h.pendingCount(),0);
  h.doc.visibilityState='visible';h.doc.emit('visibilitychange');
  assert.equal(h.pendingCount(),1);
  h.flush();assert.equal(renders,2);
});

test('dispose cancels pending frame, disconnects observer, removes listener',()=>{
  const h=harness();
  const loop=createRenderLoop({element:{},render:()=>true,requestFrame:h.requestFrame,cancelFrame:h.cancelFrame,doc:h.doc,ObserverCtor:h.ObserverCtor});
  assert.equal(h.pendingCount(),1);
  loop.dispose();
  assert.equal(h.pendingCount(),0);
  assert.equal(h.isDisconnected(),true);
  assert.equal((h.doc.listeners.visibilitychange||[]).length,0);
  // Post-dispose invalidate is a no-op.
  loop.invalidate();assert.equal(h.pendingCount(),0);
});

test('render callback receives the observed element',()=>{
  const h=harness();
  const el={tag:'host'};
  createRenderLoop({element:el,render:()=>false,requestFrame:h.requestFrame,cancelFrame:h.cancelFrame,doc:h.doc,ObserverCtor:h.ObserverCtor});
  assert.equal(h.observed(),el);
});
