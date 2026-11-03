// Display-only host bridge. No session or model-message APIs are used here.
export function createMathBridge({ render, image, color, supported, zoom = () => 1, limit = 64 }) {
  const owners = new WeakMap();
  const jobs = new Map();
  const queue = [];
  let active = false;
  let disposed = false;
  async function pump() {
    if (active || disposed) return;
    active = true;
    while (queue.length && !disposed) {
      const job = queue.shift();
      try { job.data = await render(job.source, true, job.width, job.color); }
      catch { job.data = null; }
      job.done = true;
      for (const owner of job.waiters) if (!disposed) notifications.get(owner)?.();
      job.waiters.clear();
    }
    active = false;
  }
  const bridge = (owner, token, width, invalidate) => {
    if (disposed || token.pending || !/^ {0,3}(?:\$\$|\\\[)/.test(token.raw) || width < 22 || !supported() || token.text.length > 16000) return;
    // Raster size is independent of the viewport; Image.render fits this same PNG
    // to narrower panes without another MathJax/sharp job or a new image id.
    const cells = 60;
    const ink = color();
    const key = JSON.stringify([token.text,ink]);
    let state = owners.get(owner);
    if (!state) owners.set(owner,state=new Map());
    const displayCells = Math.max(1, Math.round(cells * zoom()));
    const displayKey = JSON.stringify([key, displayCells]);
    let component = state.get(displayKey);
    if (component) return [...component.render(width), ''];
    let job = jobs.get(key);
    if (!job) {
      if (jobs.size >= limit) {
        const victim = [...jobs].find(([,j])=>j.done);
        if (!victim) return;
        jobs.delete(victim[0]);
      }
      job = { source:token.text,width:cells,color:ink,done:false,data:null,waiters:new Set() };
      jobs.set(key,job); queue.push(job);
    }
    if (job.done) {
      if (!job.data) return;
      component = image(job.data,displayCells);
      if (state.size >= 16) state.delete(state.keys().next().value);
      state.set(displayKey,component);
      return [...component.render(width), ''];
    }
    // One callback per owner, even during rapid streaming renders.
    if (job.waiters.size >= 128) return;
    job.waiters.add(owner);
    notifications.set(owner,invalidate);
    void pump();
  };
  const notifications = new WeakMap();
  bridge.dispose = () => { disposed=true; queue.length=0; jobs.clear(); };
  return bridge;
}
