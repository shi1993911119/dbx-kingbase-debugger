"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {JSDOM}=require("jsdom");
const root=path.resolve(__dirname,".."),html=fs.readFileSync(path.join(root,"ui/index.html"),"utf8"),code=fs.readFileSync(path.join(root,"ui/app.js"),"utf8");
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(fn){for(let i=0;i<150&&!fn();i++)await tick();assert.ok(fn(),"UI state did not settle");}
function createDom(){
  const dom=new JSDOM(html,{runScripts:"outside-only"});
  dom.window.eval(fs.readFileSync(path.join(root,"ui/call-import.js"),"utf8"));
  dom.window.eval(fs.readFileSync(path.join(root,"ui/forms.js"),"utf8"));
  dom.window.eval(fs.readFileSync(path.join(root,"ui/launcher.js"),"utf8"));
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event("close"));};
  return dom;
}
async function main(){
  const preview=createDom();preview.window.eval(code);
  assert.equal(preview.window.document.getElementById("start").disabled,true);assert.match(preview.window.document.getElementById("state").textContent,/离线/);preview.window.close();
  const unbound=createDom();unbound.window.dbxPlugin={ready:Promise.resolve({}),onEvent:()=>{},onContext:()=>{},invoke:async()=>({items:[]})};unbound.window.eval(code);await tick();
  assert.equal(unbound.window.document.getElementById("connectionDialog").open,true);assert.equal(unbound.window.document.getElementById("profileSelect").options.length,1);assert.equal(unbound.window.document.getElementById("start").disabled,true);unbound.window.close();
  const dom=createDom(),w=dom.window,$=id=>w.document.getElementById(id);
  const calls=[],events={};let revision=0,generation="",state="idle",outputs=[],releaseOld,releaseResult;
  const preflight={database:"demo_db",user:"demo_user",controlPid:5001,targetPid:5002,extensionVersion:"1.3"};
  const all=[{oid:10001,schema_name:"demo_user",routine_name:"probe",kind:"p",arguments:"p_seed integer",input_count:1},{oid:11,schema_name:"demo_user",routine_name:"format_values",kind:"f",arguments:"p_text text, p_empty text, p_large bigint, p_null text",input_count:4},{oid:12,schema_name:"demo_user",routine_name:"no_args",kind:"p",arguments:"",input_count:0},{oid:13,schema_name:"demo_user",routine_name:"out_args",kind:"p",arguments:"p OUT integer",input_count:0},{oid:14,schema_name:"demo_user",routine_name:"cursor_args",kind:"p",arguments:"output_cursor OUT cursor, p_cursor OUT cursor",input_count:1}];
  const snapshot=()=>({connectionId:"test",revision,state,generation,preflight,outputs,position:state==="paused"?{func:10001,linenumber:5,targetname:"probe(integer)"}:null});
  w.dbxPlugin={ready:Promise.resolve({connectionId:"test"}),onEvent:f=>events.event=f,onContext:f=>events.context=f,workbench:{onClose:f=>events.close=f},notify:(...args)=>calls.push({notification:args}),invoke:async(method,p)=>{
    calls.push({method,p});
    if(method==="debug/status")return snapshot();if(method==="debug/preflight")return preflight;
    if(method==="debug/listRoutines"){
      if(p.search==="old")return new Promise(resolve=>releaseOld=resolve);
      if(p.search==="new")return{items:[all[1]],truncated:false};
      return{items:all.filter(r=>r.routine_name.toLowerCase().includes(p.search.toLowerCase())),truncated:!p.search};
    }
    if(method==="debug/parameters"){
      if(p.oid===14)return{supported:true,parameters:[{position:1,name:"output_cursor",mode:"OUT",type:'"demo_user"."demo_cursor.t_cursor"',cursor:true},{position:2,name:"p_cursor",mode:"OUT",type:"refcursor",cursor:true}]};
      if(p.oid===13)return{supported:true,parameters:[{position:1,name:"p_result",mode:"OUT",type:"integer"},{position:2,name:"p_seed",mode:"IN",type:"integer"},{position:3,name:"p_total",mode:"INOUT",type:"bigint"},{position:4,name:"p_note",mode:"OUT",type:"varchar"}]};
      const parameters=p.oid===12?[]:p.oid===11?[{position:1,name:'p_<img src=x>,"text',type:"text"},{position:2,name:"p_empty",type:"text"},{position:3,name:"p_large",type:"bigint"},{position:4,name:"p_null",type:"text"}]:[{position:1,name:"p_seed",type:"integer"}];
      return{oid:p.oid,supported:true,parameters};
    }
    if(method==="debug/source")return{oid:p.oid,source:"\nDECLARE\n  v_total integer;\nBEGIN\n  v_total := '<img src=x onerror=alert(1)>';\nEND;\n"};
    if(method==="debug/start"){generation="g"+(revision+1);outputs=[];state="paused";revision++;return snapshot();}
    if(method==="debug/inspect")return{variables:[{name:"v_total",dtype:23,value:"<img src=x>"}],stack:[{callcount:0,targetname:"probe(integer)",linenumber:5}],breakpoints:[{func:10001,linenumber:5}]};
    if(method==="debug/setBreakpoint"||method==="debug/removeBreakpoint")return{success:true};
    if(method==="debug/stepOver"){state="running";revision++;return snapshot();}
    if(method==="debug/stop"){state="cancelled";revision++;return snapshot();}
    if(method==="debug/result"){
      if(p.resultId===2)return new Promise(resolve=>releaseResult=resolve);
      return{generation:p.generation,resultId:p.resultId,result:p.resultId===0?{columns:[{name:"Same",type:"int8"},{name:"Same",type:"text"},{name:"same",type:"text"}],rows:[["9223372036854775807",null,"<img src=x>"]],rowCount:1,truncated:true}:{columns:[{name:"EmptyColumn",type:"text"}],rows:[],rowCount:0,truncated:false}};
    }
    throw new Error("Unexpected RPC: "+method);
  }};
  function search(text){$("routineSearch").value=text;$("routineSearch").dispatchEvent(new w.Event("input"));}
  async function choose(oid){$("routine").value=String(oid);$("routine").dispatchEvent(new w.Event("change"));await until(()=>!$("routine").disabled);}
  function input(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event("input"));}
  function submit(){ $("parameterConfirm").click(); }
  function finish(result=[]){outputs=result;state="finished";revision++;events.event({method:"debug/state",params:snapshot()});}
  w.eval(code);await until(()=>$("routine").options.length===6);
  assert.match($("routineCount").textContent,/前 500/);
  search("old");await until(()=>releaseOld);search("new");await until(()=>$("routine").options.length===2&&$("routine").options[1].value==="11");
  releaseOld({items:[all[0]],truncated:false});await tick();assert.equal($("routine").options[1].value,"11","late search result cannot replace current result");
  search("missing_%");await until(()=>$("routineCount").textContent==="匹配 0 个对象");assert.equal($("routine").options.length,1);assert.equal($("start").disabled,true);
  search("PrObE");await until(()=>$("routine").options.length===2);assert.equal(calls.filter(c=>c.method==="debug/listRoutines").at(-1).p.search,"PrObE");
  await choose(10001);assert.equal($("source").querySelector("code").textContent," ");assert.equal($("source").querySelectorAll("img").length,0);
  $("parameters").click();assert.ok($("parameterDialog").open);assert.match($("parameterRows").textContent,/p_seed.*integer/);assert.equal(w.document.activeElement.id,"parameterValue0");assert.equal($("parameterRows").querySelector('input[type="checkbox"]').checked,true);assert.equal($("parameterValue0").disabled,false);input("parameterValue0","test");assert.equal($("parameterRows").querySelector('input[type="checkbox"]').checked,false);input("parameterValue0","");assert.equal($("parameterRows").querySelector('input[type="checkbox"]').checked,true);
  $("parameterValue0").value="cancelled draft";$("parameterCancel").click();$("parameters").click();assert.equal($("parameterValue0").value,"");
  input("parameterValue0","7");submit();assert.ok(!$("parameterDialog").open);assert.equal(calls.filter(c=>c.method==="debug/start").length,0,"saving values never executes target");
  $("start").click();assert.ok($("parameterDialog").open);assert.equal($("parameterValue0").value,"7");submit();await until(()=>$("variables").textContent.includes("v_total")&&!$("stepOver").disabled);
  assert.equal(calls.find(c=>c.method==="debug/start").p.arguments[0],"7");assert.match($("pids").textContent,/5002.*5001/);
  assert.equal($("variables").querySelectorAll("img").length,0);assert.match($("variables").textContent,/<img/);assert.ok($("source").querySelector(".current"));assert.equal($("stack").querySelector("tbody td").textContent,"0");
  assert.equal($("routineSearch").disabled,true);assert.equal($("parameters").disabled,true);
  const sourceRow=$("source").querySelector(".current");events.event({method:"debug/state",params:snapshot()});assert.equal($("source").querySelector(".current"),sourceRow,"unchanged status preserves source controls");
  $("source").querySelector(".current button").click();await until(()=>calls.some(c=>c.method==="debug/removeBreakpoint"));await tick();assert.equal(calls.find(c=>c.method==="debug/removeBreakpoint").p.line,5);
  $("stepOver").click();await until(()=>$("state").textContent==="执行中");assert.equal($("stepInto").disabled,true);assert.equal($("stop").disabled,false);
  const old={...snapshot(),state:"paused",revision,position:{func:10001,linenumber:5,targetname:"probe(integer)"}};finish();events.event({method:"debug/state",params:old});assert.equal($("state").textContent,"执行完成");assert.match($("variables").textContent,/已结束/);assert.match($("pids").textContent,/已关闭/);
  events.event({method:"debug/output",params:{connectionId:"other",generation,text:"WRONG_CONNECTION"}});assert.ok(!$("output").textContent.includes("WRONG_CONNECTION"));
  search("format");await until(()=>$("routine").options.length===2&&$("routine").options[1].value==="11");await choose(11);$("start").click();
  assert.equal($("parameterRows").querySelectorAll("[data-parameter]").length,4);assert.equal($("parameterRows").querySelectorAll("img").length,0);assert.equal($("parameterValue0").value,"","different OID does not reuse same-count argument values");
  input("parameterValue0"," 'quoted' ");input("parameterValue1","");$("parameterRows").querySelector('[data-parameter="1"] input[type="checkbox"]').checked=false;input("parameterValue2","9223372036854775807");
  const nullInput=$("parameterRows").querySelector('[data-parameter="3"] input[type="checkbox"]');nullInput.checked=true;nullInput.dispatchEvent(new w.Event("change"));assert.equal($("parameterValue3").disabled,false);
  submit();await until(()=>$("state").textContent==="已暂停");
  assert.deepEqual(Array.from(calls.filter(c=>c.method==="debug/start").at(-1).p.arguments),[" 'quoted' ","","9223372036854775807",null],"strings, empty string, precise bigint and NULL bound in ordinal order");
  $("stop").click();await until(()=>$("state").textContent==="已停止");
  search("no_args");await until(()=>$("routine").options.length===2&&$("routine").options[1].value==="12");await choose(12);$("start").click();assert.match($("parameterRows").textContent,/没有参数/);submit();await until(()=>$("state").textContent==="已暂停");assert.equal(calls.filter(c=>c.method==="debug/start").at(-1).p.arguments.length,0);finish();
  search("out_args");await until(()=>$("routine").options.length===2&&$("routine").options[1].value==="13");await choose(13);assert.equal($("start").disabled,false);assert.match($("parameterSummary").textContent,/2 OUT.*1 IN.*1 INOUT/);
  $("start").click();assert.equal($("parameterRows").querySelectorAll("[data-parameter]").length,4);assert.equal(w.document.activeElement.id,"parameterValue1","focus skips pure OUT rows");
  const outNull=$("parameterRows").querySelector('[data-parameter="0"] input[type="checkbox"]');assert.equal(outNull.checked,true);assert.equal(outNull.disabled,true);assert.equal($("parameterValue0").disabled,true);assert.equal($("parameterValue3").disabled,true);
  input("parameterValue1","7");input("parameterValue2","9223372036854775800");$("parameterValue0").value="tampered";outNull.checked=false;submit();await until(()=>$("state").textContent==="已暂停");
  assert.deepEqual(Array.from(calls.filter(c=>c.method==="debug/start").at(-1).p.arguments),[null,"7","9223372036854775800",null],"pure OUT is always NULL; IN/INOUT retain declaration order");
  finish([{name:"p_result",mode:"OUT",type:"integer",value:"14"},{name:"p_total",mode:"INOUT",type:"bigint",value:"9223372036854775807"},{name:"p_note",mode:"OUT",type:"varchar",value:null}]);
  assert.match($("variables").textContent,/p_resultOUTinteger14/);assert.match($("variables").textContent,/9223372036854775807/);assert.match($("variables").textContent,/p_noteOUTvarcharNULL/);assert.match($("message").textContent,/返回值/);
  $("start").click();assert.equal($("parameterValue0").value,"");assert.equal($("parameterValue2").value,"9223372036854775800","returned INOUT does not overwrite saved initial value");
  const inoutNull=$("parameterRows").querySelector('[data-parameter="2"] input[type="checkbox"]');inoutNull.checked=true;inoutNull.dispatchEvent(new w.Event("change"));assert.equal($("parameterValue2").disabled,false);assert.equal($("parameterValue2").value,"");submit();await until(()=>$("state").textContent==="已暂停");assert.equal(calls.filter(c=>c.method==="debug/start").at(-1).p.arguments[2],null);assert.ok(!$("variables").textContent.includes("9223372036854775807"),"new run clears previous output values");$("stop").click();await until(()=>$("state").textContent==="已停止");
  search("cursor_args");await until(()=>$("routine").options.length===2&&$("routine").options[1].value==="14");await choose(14);$("start").click();
  assert.match($("parameterRows").textContent,/demo_cursor.t_cursor/);assert.equal($("parameterValue1").disabled,true);assert.match($("parameterValue1").placeholder,/游标/);$("parameterValue1").value="tampered";$("parameterRows").querySelector('[data-parameter="1"] input[type="checkbox"]').checked=false;submit();await until(()=>$("state").textContent==="已暂停");assert.deepEqual(Array.from(calls.filter(c=>c.method==="debug/start").at(-1).p.arguments),[null,null],"OUT cursor initial values fixed to NULL");
  finish([{name:"output_cursor",mode:"OUT",type:"cursor",resultId:0,rowCount:1,truncated:true,value:"结果集 · 1 行"},{name:"empty",mode:"OUT",resultId:1,rowCount:0,value:"结果集 · 0 行"},{name:"null_cursor",mode:"OUT",value:null},{name:"late",mode:"OUT",resultId:2,rowCount:1,value:"结果集 · 1 行"}]);
  await until(()=>$("resultPanel").querySelector("tbody td"));assert.equal($("resultSelect").options.length,3,"NULL cursor is not confused with an empty result");assert.equal($("resultPanel").hidden,false);assert.equal($("resultTab").getAttribute("aria-selected"),"true");assert.match($("resultSummary").textContent,/已截断/);
  assert.deepEqual(Array.from($("resultPanel").querySelectorAll("th span"),n=>n.textContent),["Same","Same","same"],"column labels preserved by ordinal");assert.match($("resultPanel").textContent,/9223372036854775807/);assert.match($("resultPanel").textContent,/NULL/);assert.equal($("resultPanel").querySelectorAll("img").length,0,"cursor cells safely rendered as text");assert.match($("resultPanel").textContent,/<img src=x>/);
  $("outputTab").click();assert.equal($("output").hidden,false);$("resultTab").click();assert.equal($("resultPanel").hidden,false);
  $("resultSelect").value="2";$("resultSelect").dispatchEvent(new w.Event("change"));await until(()=>releaseResult);
  $("resultSelect").value="1";$("resultSelect").dispatchEvent(new w.Event("change"));await until(()=>$("resultPanel").textContent.includes("EmptyColumn"));assert.match($("resultPanel").textContent,/查询结果为空/);assert.match($("resultSummary").textContent,/0 行 · 1 列/);
  releaseResult({generation,resultId:2,result:{columns:[{name:"STALE_RESULT",type:"text"}],rows:[["late"]],rowCount:1}});await tick();assert.ok(!$("resultPanel").textContent.includes("STALE_RESULT"),"late cursor fetch cannot replace newly selected cursor");
  $("start").click();submit();await until(()=>$("state").textContent==="已暂停");assert.equal($("resultTab").disabled,true);assert.equal($("resultPanel").textContent,"");$("stop").click();await until(()=>$("state").textContent==="已停止");
  search("probe");await until(()=>$("routine").options.length===2&&$("routine").options[1].value==="10001");await choose(10001);$("start").click();assert.equal($("parameterValue0").value,"7","same OID retains saved draft within this workbench");submit();await until(()=>$("state").textContent==="已暂停");
  w.dispatchEvent(new w.Event("pagehide"));assert.ok(calls.some(c=>c.notification?.[0]==="debug/stop"));await events.close();assert.ok(calls.filter(c=>c.method==="debug/stop").length>=2,"host close handshake stops active target");
  dom.window.close();console.log("PASS: server name search and races; parameter dialog, IN/OUT/INOUT; cursor grids, multi/empty/NULL results, duplicate labels, bigint, truncation, late result races, new-run clearing; debug lifecycle and safe text rendering");
}
main().catch(e=>{console.error(e);process.exit(1);});
