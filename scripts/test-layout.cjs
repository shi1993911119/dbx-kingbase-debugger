"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert/strict"),{JSDOM}=require("jsdom");
const root=path.resolve(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const dom=new JSDOM(read("ui/index.html"),{runScripts:"outside-only"}),w=dom.window,$=id=>w.document.getElementById(id);
const css=w.document.createElement("style");css.textContent=read("ui/style.css");w.document.head.append(css);
let width=1400,height=800;
$("debugWorkspace").getBoundingClientRect=()=>({left:100,top:200,width,height});
$("inspector").getBoundingClientRect=()=>({left:100+(width-8)*.66+8,top:200,width:(width-8)*.34,height:(height-8)*Number.parseFloat($("debugWorkspace").style.getPropertyValue("--workspace-fr"))/100});
const captured=new Map();for(const id of ["sourceSplitter","inspectSplitter","outputSplitter"]){const e=$(id);e.setPointerCapture=p=>captured.set(e,p);e.hasPointerCapture=p=>captured.get(e)===p;e.releasePointerCapture=p=>captured.delete(e);}
w.eval(read("ui/layout.js"));
const value=id=>Number($(id).getAttribute("aria-valuenow"));
function key(id,key,shiftKey=false){$(id).dispatchEvent(new w.KeyboardEvent("keydown",{key,shiftKey,bubbles:true,cancelable:true}));}
function pointer(target,type,x,y,pointerId=1,button=0){const e=new w.Event(type,{bubbles:true,cancelable:true});for(const [k,v]of Object.entries({clientX:x,clientY:y,pointerId,button}))Object.defineProperty(e,k,{value:v});target.dispatchEvent(e);}
key("sourceSplitter","ArrowLeft");assert.equal(value("sourceSplitter"),64,"left arrow enlarges right pane");assert.equal(value("inspectSplitter"),50,"width resize preserves right vertical split");
key("sourceSplitter","ArrowRight",true);assert.equal(value("sourceSplitter"),74);key("sourceSplitter","Home");assert.equal(value("sourceSplitter"),17);key("sourceSplitter","End");assert.equal(value("sourceSplitter"),81);key("sourceSplitter","Enter");assert.equal(value("sourceSplitter"),66);
pointer($("sourceSplitter"),"pointerdown",1020,400);assert.ok(w.document.body.classList.contains("resizing-columns"));assert.equal(w.document.activeElement.id,"sourceSplitter");assert.equal(captured.get($("sourceSplitter")),1);
pointer(w.document,"pointermove",800,400,2);assert.equal(value("sourceSplitter"),66,"other pointer cannot hijack drag");pointer(w.document,"pointermove",800,400);assert.equal(value("sourceSplitter"),50);pointer(w.document,"pointermove",-9999,400);assert.equal(value("sourceSplitter"),17,"drag clamps to source minimum");pointer(w.document,"pointerup",-9999,400);assert.equal(captured.size,0);assert.ok(!w.document.body.classList.contains("resizing-columns"));
$("sourceSplitter").dispatchEvent(new w.Event("dblclick"));assert.equal(value("sourceSplitter"),66);
key("inspectSplitter","ArrowUp");assert.equal(value("inspectSplitter"),48,"up enlarges stack");key("inspectSplitter","ArrowDown",true);assert.equal(value("inspectSplitter"),58);
pointer($("inspectSplitter"),"pointerdown",1200,500);pointer(w.document,"pointermove",1200,360);assert.ok(value("inspectSplitter")<30,"right panes can be resized vertically");pointer(w.document,"pointercancel",1200,360);assert.ok(!w.document.body.classList.contains("resizing-rows"));
key("outputSplitter","ArrowDown");assert.equal(value("outputSplitter"),74,"moving output divider down enlarges work area");key("outputSplitter","Home");assert.equal(value("outputSplitter"),20);key("outputSplitter","End");assert.equal(value("outputSplitter"),88);key("outputSplitter","Enter");assert.equal(value("outputSplitter"),72);
key("sourceSplitter","End");width=640;w.dispatchEvent(new w.Event("resize"));assert.equal(value("sourceSplitter"),59,"narrow window retains inspector minimum");assert.ok(!$("debugWorkspace").getAttribute("style").includes("NaN"));
pointer($("sourceSplitter"),"pointerdown",470,400);w.dispatchEvent(new w.Event("pagehide"));assert.equal(captured.size,0);assert.ok(!w.document.body.classList.contains("resizing-columns"));
// Long names stay intact in the text and participate in the table's scroll width.
const longName="as_"+"complete_parameter_name_".repeat(8),table=w.document.createElement("table"),tbody=w.document.createElement("tbody"),tr=w.document.createElement("tr"),name=w.document.createElement("td");name.textContent=longName;tr.append(name);tbody.append(tr);table.append(tbody);$("variables").replaceChildren(table);
assert.equal(name.textContent,longName);assert.equal(w.getComputedStyle(name).whiteSpace,"pre");assert.equal(w.getComputedStyle(name).overflowWrap,"normal");assert.equal(w.getComputedStyle($("variables")).overflow,"auto");assert.equal(w.getComputedStyle(table).width,"max-content");
let stopClicks=0;$("stop").disabled=false;$("stop").addEventListener("click",()=>stopClicks++);$("stop").click();assert.equal(stopClicks,1,"layout never intercepts debugger actions");
dom.window.close();console.log("PASS: pane pointer capture, independent widths/heights, keyboard and reset, minimum sizes, narrow-window clamp, pointer cancellation/unload; full long names and local table scrolling; debug controls unaffected");
