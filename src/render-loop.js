// On-demand render loop shared by the WebGL previews.
//
// Instead of drawing on every animation frame, callers `invalidate()` to
// request a frame. The loop keeps scheduling frames only while `render`
// reports that something is still moving (interpolation / control damping),
// then settles and stops. Visibility (offscreen or document hidden) fully
// pauses scheduling and resumes when the view becomes visible again.
//
// No polling intervals, no external dependencies. Pure DOM APIs so it can be
// unit tested with lightweight stubs.

export function createRenderLoop({
  element,
  render,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  doc = typeof document !== 'undefined' ? document : undefined,
  ObserverCtor = typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : undefined,
} = {}) {
  if (typeof render !== 'function') throw new Error('render callback required');

  let frame = null;      // pending RAF handle, or null when idle
  let disposed = false;
  let visible = true;    // intersecting the viewport
  let pageVisible = doc ? doc.visibilityState !== 'hidden' : true;

  const canRun = () => !disposed && visible && pageVisible;

  const tick = () => {
    frame = null;
    if (!canRun()) return;
    // render returns true while more frames are needed (still animating).
    let again = false;
    try {
      again = render() === true;
    } catch (err) {
      // A failed frame should not wedge the loop into a silent dead state.
      // Stop scheduling and rethrow asynchronously so it surfaces in logs.
      frame = null;
      setTimeout(() => { throw err; }, 0);
      return;
    }
    if (again) schedule();
  };

  function schedule() {
    if (frame !== null || !canRun()) return;
    frame = requestFrame(tick);
  }

  // Public: request at least one more frame.
  const invalidate = () => { schedule(); };

  // Visibility wiring ------------------------------------------------------
  let observer = null;
  if (ObserverCtor && element) {
    observer = new ObserverCtor((entries) => {
      const entry = entries[entries.length - 1];
      const nowVisible = entry ? entry.isIntersecting : true;
      if (nowVisible === visible) return;
      visible = nowVisible;
      if (visible) invalidate();
    });
    observer.observe(element);
  }

  const onDocVisibility = () => {
    const nowVisible = doc.visibilityState !== 'hidden';
    if (nowVisible === pageVisible) return;
    pageVisible = nowVisible;
    if (pageVisible) invalidate();
  };
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onDocVisibility);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame !== null) { cancelFrame(frame); frame = null; }
    if (observer) observer.disconnect();
    if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onDocVisibility);
  };

  // Kick off an initial frame so the first paint happens.
  invalidate();

  return {
    invalidate,
    dispose,
    isRunning: () => frame !== null,
    isVisible: () => canRun(),
  };
}
