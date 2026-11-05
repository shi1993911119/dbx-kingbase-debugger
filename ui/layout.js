"use strict";
(() => {
  const workspace = document.getElementById("debugWorkspace"), inspector = document.getElementById("inspector");
  if (!workspace || !inspector) return;
  const specifications = [
    {id:"sourceSplitter",container:workspace,axis:"x",first:"source-fr",second:"inspector-fr",initial:66,minFirst:240,minSecond:260,names:["源码","变量与调用栈"]},
    {id:"inspectSplitter",container:inspector,axis:"y",first:"variables-fr",second:"stack-fr",initial:50,minFirst:72,minSecond:72,names:["变量","调用栈"]},
    {id:"outputSplitter",container:workspace,axis:"y",first:"workspace-fr",second:"output-fr",initial:72,minFirst:160,minSecond:96,names:["源码与变量区","输出区"]}
  ];
  let drag = null;
  function bounds(spec) {
    const rect = spec.container.getBoundingClientRect(), size = (spec.axis === "x" ? rect.width : rect.height) - 8;
    return {rect,size,min:size > 0 ? spec.minFirst / size * 100 : 0,max:size > 0 ? (1 - spec.minSecond / size) * 100 : 100};
  }
  function set(spec, requested) {
    const range = bounds(spec);
    // CSS owns minimum pane sizes before the workbench has its first real bounds.
    const clamped = range.size >= spec.minFirst + spec.minSecond ? Math.min(range.max,Math.max(range.min,requested)) : requested;
    spec.value = Math.round(clamped * 1000) / 1000;
    spec.container.style.setProperty(`--${spec.first}`, `${spec.value}fr`);
    spec.container.style.setProperty(`--${spec.second}`, `${100 - spec.value}fr`);
    spec.handle.setAttribute("aria-valuemin", String(Math.ceil(Math.min(100,range.min))));
    spec.handle.setAttribute("aria-valuemax", String(Math.floor(Math.max(0,range.max))));
    spec.handle.setAttribute("aria-valuenow", String(Math.round(spec.value)));
    spec.handle.setAttribute("aria-valuetext", `${spec.names[0]} ${Math.round(spec.value)}%，${spec.names[1]} ${Math.round(100-spec.value)}%`);
  }
  function end() {
    if (!drag) return;
    const previous = drag; drag = null;
    previous.spec.handle.classList.remove("is-dragging");
    document.body.classList.remove("resizing-columns","resizing-rows");
    if (previous.spec.handle.hasPointerCapture?.(previous.pointerId)) previous.spec.handle.releasePointerCapture(previous.pointerId);
  }
  for (const spec of specifications) {
    spec.handle = document.getElementById(spec.id); spec.value = spec.initial;
    set(spec,spec.initial);
    spec.handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || drag) return;
      const range = bounds(spec);
      if (range.size < spec.minFirst + spec.minSecond) return;
      event.preventDefault(); spec.handle.focus({preventScroll:true});
      drag = {spec,pointerId:event.pointerId};
      spec.handle.setPointerCapture?.(event.pointerId);
      spec.handle.classList.add("is-dragging");document.body.classList.add(spec.axis === "x" ? "resizing-columns" : "resizing-rows");
    });
    spec.handle.addEventListener("lostpointercapture", end);
    spec.handle.addEventListener("dblclick", () => {end();set(spec,spec.initial);});
    spec.handle.addEventListener("keydown", event => {
      const negative = spec.axis === "x" ? "ArrowLeft" : "ArrowUp", positive = spec.axis === "x" ? "ArrowRight" : "ArrowDown", range = bounds(spec);
      let next;
      if (event.key === negative) next = spec.value - (event.shiftKey ? 10 : 2);
      else if (event.key === positive) next = spec.value + (event.shiftKey ? 10 : 2);
      else if (event.key === "Home") next = range.min;
      else if (event.key === "End") next = range.max;
      else if (event.key === "Enter") next = spec.initial;
      else return;
      event.preventDefault();set(spec,next);
    });
  }
  document.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const {spec} = drag, {rect,size} = bounds(spec);
    if (size <= 0) return;
    const coordinate = spec.axis === "x" ? event.clientX - rect.left : event.clientY - rect.top;
    set(spec,(coordinate - 4) / size * 100);
  });
  document.addEventListener("pointerup", event => {if (drag?.pointerId === event.pointerId) end();});
  document.addEventListener("pointercancel", end);
  const resize = () => specifications.forEach(spec => set(spec,spec.value));
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  observer?.observe(workspace);observer?.observe(inspector);
  window.addEventListener("resize",resize);
  window.addEventListener("pagehide", () => {end();observer?.disconnect();});
})();
