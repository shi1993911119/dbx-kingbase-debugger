"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),{JSDOM}=require("jsdom");
const root=path.resolve(__dirname,".."),read=name=>fs.readFileSync(path.join(root,name),"utf8");
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(fn){for(let i=0;i<200&&!fn();i++)await tick();assert.ok(fn(),"shortcut state did not settle");}
async function runKeymap(mac=false){
  const dom=new JSDOM(read("ui/index.html"),{runScripts:"outside-only"}),w=dom.window,$=id=>w.document.getElementById(id),calls=[],events={};
  Object.defineProperty(w.navigator,"platform",{value:mac?"MacIntel":"Win32"});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event("close"));};
  let state="idle",revision=0,generation="",releaseStep,releaseStop,delayStep=false,delayStop=false,failStep=false,oid=42,breakpoints=[];
  const snapshot=()=>({connectionId:"test",state,revision,generation,position:state==="paused"?{func:oid,linenumber:3,targetname:"probe()"}:null});
  w.dbxPlugin={ready:Promise.resolve({connectionId:"test"}),onContext:f=>events.context=f,onEvent:f=>events.event=f,workbench:{onClose:f=>events.close=f},notify:(...args)=>calls.push({notification:args}),invoke:async(method,p)=>{
    calls.push({method,p});
    if(method==="debug/status")return snapshot();
    if(method==="debug/preflight")return{database:"demo_db",user:"demo_user",targetPid:2,controlPid:1,extensionVersion:"1.3"};
    if(method==="debug/listRoutines")return{items:[{oid:42,schema_name:"demo_user",routine_name:"probe",arguments:"",kind:"p"}]};
    if(method==="debug/source")return{source:"BEGIN\n  NULL;\n  NULL;\nEND;"};
    if(method==="debug/parameters")return{supported:true,parameters:[]};
    if(method==="debug/inspect")return{variables:[],stack:[],breakpoints};
    if(method==="debug/start"){generation="g"+(revision+1);state="paused";revision++;return snapshot();}
    if(["debug/stepOver","debug/stepInto","debug/continue"].includes(method)){
      if(delayStep){delayStep=false;await new Promise(resolve=>releaseStep=resolve);}
      if(failStep){failStep=false;throw Error("synthetic step failure");}
      if(state!=="cancelled"){state=method==="debug/continue"?"running":"paused";revision++;}return snapshot();
    }
    if(method==="debug/stop"){
      if(delayStop){delayStop=false;await new Promise(resolve=>releaseStop=resolve);}
      state="cancelled";revision++;return snapshot();
    }
    if(method==="debug/setBreakpoint"){breakpoints.push({func:p.oid,linenumber:p.line});return{success:true};}
    if(method==="debug/removeBreakpoint"){breakpoints=breakpoints.filter(b=>b.func!==p.oid||b.linenumber!==p.line);return{success:true};}
    throw Error("Unexpected RPC "+method);
  }};
  for(const file of ["ui/forms.js","ui/launcher.js","ui/call-import.js","ui/app.js"])w.eval(read(file));
  const count=method=>calls.filter(call=>call.method===method).length;
  function key(name,mods={},target=w.document.body){const event=new w.KeyboardEvent("keydown",{key:name,bubbles:true,cancelable:true,...mods});target.dispatchEvent(event);return event;}
  const stopMods=mac?{metaKey:true}:{ctrlKey:true},breakpointMods=stopMods;
  const resume=()=>mac?key("®",{metaKey:true,altKey:true,code:"KeyR"}):key("F9");
  const startKey=target=>mac?key("d",{ctrlKey:true,code:"KeyD"},target):key("F9",{shiftKey:true},target);
  async function settled(){await until(()=>state==="paused"&&!$("stepOver").disabled);await tick();}
  async function start(){w.document.activeElement.blur?.();assert.equal(startKey().defaultPrevented,true);assert.equal($("parameterDialog").open,true);$("parameterForm").dispatchEvent(new w.Event("submit",{cancelable:true}));await settled();}
  await until(()=>!$("start").disabled);
  assert.equal(key("F8").defaultPrevented,false);assert.equal(key("F7").defaultPrevented,false);assert.equal(key("F9").defaultPrevented,false);assert.equal(key("F2",stopMods).defaultPrevented,false);assert.equal(count("debug/stepOver"),0);
  for(const [id,shortcut] of [["stepOver","F8"],["stepInto","F7"],["continue",mac?"Meta+Alt+R":"F9"],["stop",mac?"Meta+F2":"Control+F2"],["start",mac?"Control+D":"Shift+F9"]]){assert.equal($(id).getAttribute("aria-keyshortcuts"),shortcut);assert.ok($(id).title.includes($(id).querySelector("kbd").textContent));}
  startKey();assert.equal($("parameterDialog").open,true);assert.equal(count("debug/start"),0,"Shift+F9 opens confirmation without execution");
  assert.equal(startKey($("parameterConfirm")).defaultPrevented,false);assert.equal(count("debug/start"),0,"shortcut cannot confirm an open dialog");$("parameterCancel").click();
  await start();
  assert.equal(key("F8").defaultPrevented,true);await settled();assert.equal(count("debug/stepOver"),1);
  key("F7");await settled();assert.equal(count("debug/stepInto"),1);
  const before=calls.length;
  for(const mods of [{repeat:true},{isComposing:true},{keyCode:229},{ctrlKey:true,shiftKey:true},{altKey:true},{metaKey:true,ctrlKey:true},{shiftKey:true}])assert.equal(key("F8",mods).defaultPrevented,false);
  assert.equal(key("F6").defaultPrevented,false);
  const handled=new w.KeyboardEvent("keydown",{key:"F8",bubbles:true,cancelable:true});handled.preventDefault();w.document.body.dispatchEvent(handled);
  assert.equal(calls.length,before,"repeat, IME, unrelated modifiers and previously handled keys must not execute");
  for(const target of [$("schema"),$("routineSearch"),$("routine"),$("importText")])assert.equal(key("F8",{},target).defaultPrevented,false);
  const editable=w.document.createElement("div"),nested=w.document.createElement("span");editable.contentEditable="true";editable.setAttribute("contenteditable","true");editable.append(nested);w.document.body.append(editable);assert.equal(key("F8",{},nested).defaultPrevented,false);editable.remove();
  for(const id of ["parameterDialog","connectionDialog","importDialog"]){$(id).showModal();assert.equal(key("F8").defaultPrevented,false);assert.equal(key("F2",stopMods).defaultPrevented,false);$(id).close();}
  assert.equal(calls.length,before,"typing and all modal dialogs suspend debug shortcuts");
  w.document.activeElement.blur?.();key("F8",breakpointMods);await settled();assert.equal(calls.filter(c=>c.method==="debug/setBreakpoint").at(-1).p.line,3,"breakpoint shortcut defaults to execution line");
  key("F8",breakpointMods);await settled();assert.equal(calls.filter(c=>c.method==="debug/removeBreakpoint").at(-1).p.line,3);
  $("source").querySelector('[data-line="2"] code').click();key("F8",breakpointMods);await settled();assert.equal(calls.filter(c=>c.method==="debug/setBreakpoint").at(-1).p.line,2,"clicking source selects the breakpoint line");
  const gutter=$("source").querySelector('[data-line="4"] button');gutter.focus();key("F8",breakpointMods,gutter);await settled();assert.equal(calls.filter(c=>c.method==="debug/setBreakpoint").at(-1).p.line,4,"focused gutter selects its own breakpoint line");
  const selection=w.getSelection(),range=w.document.createRange();range.selectNodeContents($("source").querySelector('[data-line="1"] code'));selection.removeAllRanges();selection.addRange(range);w.document.activeElement.blur?.();key("F8",breakpointMods);await settled();assert.equal(calls.filter(c=>c.method==="debug/setBreakpoint").at(-1).p.line,1,"source text selection sets the shortcut line");selection.removeAllRanges();
  oid=99;revision++;events.event({method:"debug/state",params:snapshot()});await settled();assert.equal($("source").querySelector('[data-line="1"]').dataset.oid,"99");
  w.document.activeElement.blur?.();key("F8",breakpointMods);await settled();const childBreakpoint=calls.filter(c=>c.method==="debug/setBreakpoint").at(-1).p;assert.equal(childBreakpoint.oid,99);assert.equal(childBreakpoint.line,3,"step into another object must not reuse the old source cursor");
  failStep=true;key("F8");await settled();assert.match($("message").textContent,/synthetic step failure/);key("F7");await settled();
  resume();await until(()=>state==="running"&&!$("stop").disabled);const steps=count("debug/stepOver");key("F8");assert.equal(count("debug/stepOver"),steps,"stepping is disabled while running");
  delayStop=true;key("F2",stopMods);await until(()=>releaseStop);assert.equal(key("F8").defaultPrevented,false);assert.equal(key("F8",breakpointMods).defaultPrevented,false);assert.equal(key("F2",stopMods).defaultPrevented,false);releaseStop();await until(()=>state==="cancelled"&&!$("start").disabled);assert.equal(count("debug/stop"),1,"duplicate stop cannot enqueue another RPC");
  await start();delayStep=true;key("F8");await until(()=>releaseStep);const pendingSteps=count("debug/stepOver");assert.equal(key("F8").defaultPrevented,false);assert.equal(count("debug/stepOver"),pendingSteps,"one in-flight step at a time");
  assert.equal(key("F2",stopMods).defaultPrevented,true,"Stop remains available during an in-flight step");await until(()=>state==="cancelled");releaseStep();await until(()=>!$("start").disabled);
  await start();w.dispatchEvent(new w.Event("pagehide"));const stoppedCount=count("debug/stepOver");assert.equal(key("F8").defaultPrevented,false);assert.equal(count("debug/stepOver"),stoppedCount,"pagehide removes the shortcut handler");
  dom.window.close();console.log((mac?"macOS: ":"Windows: ")+"PASS: DataGrip platform default debug shortcuts; parameter confirmation, breakpoint target and source changes, disabled/busy/error states, repeat/modifier/IME/editable/modal guards, concurrent stop and pagehide cleanup");
}
(async()=>{await runKeymap();await runKeymap(true);})().catch(error=>{console.error(error);process.exit(1);});
