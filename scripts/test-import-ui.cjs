"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),{JSDOM}=require("jsdom");
const root=path.resolve(__dirname,".."),read=name=>fs.readFileSync(path.join(root,name),"utf8");
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(fn){for(let i=0;i<200&&!fn();i++)await tick();assert.ok(fn(),"import UI state did not settle");}
async function main(){
  const dom=new JSDOM(read("ui/index.html"),{runScripts:"outside-only"}),w=dom.window,$=id=>w.document.getElementById(id),calls=[],events={};let release,contextId="one";
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event("close"));};
  const p=Array.from({length:32},(_,i)=>({position:i+1,name:i<29?`arg${i}`:i===29?"output_code":i===30?"output_message":"output_cursor",mode:i<29?"IN":"OUT",type:i===31?'"demo_user"."demo_cursor.t_cursor"':i===29?"integer":"varchar",cursor:i===31}));
  const routine=(oid,name)=>({oid,schema_name:"demo_user",routine_name:name,kind:"p",arguments:`OID ${oid}`});
  w.dbxPlugin={ready:Promise.resolve({connectionId:contextId}),onEvent:f=>events.event=f,onContext:f=>events.context=f,invoke:async(method,a)=>{
    calls.push({method,a});
    if(method==="debug/status")return{connectionId:a.connectionId,state:"idle",revision:0};
    if(method==="debug/preflight")return{user:"demo_user"};
    if(method==="debug/listRoutines"){
      if(a.search==="late")return new Promise(resolve=>release=resolve);
      if(a.search==="demo_import_probe")return{items:[routine(1,a.search),routine(9,a.search+"_suffix")],truncated:false};
      if(a.search==="overloaded")return{items:[routine(2,a.search),routine(3,a.search)],truncated:false};
      return{items:[],truncated:a.search==="truncated"};
    }
    if(method==="debug/parameters")return{supported:true,parameters:a.oid===1?p:[{position:1,name:"p_seed",mode:"IN",type:a.oid===2?"integer":"varchar"}]};
    if(method==="debug/source")return{source:"BEGIN\nNULL;\nEND;"};
    if(method==="debug/start")return{connectionId:a.connectionId,state:"finished",revision:1,generation:"import-null-test",outputs:[]};
    throw new Error("Import must not call "+method);
  }};
  w.eval(read("ui/forms.js"));w.eval(read("ui/call-import.js"));w.eval(read("ui/app.js"));await until(()=>$("routineCount").textContent==="已加载 0 个对象");
  function input(text){$("importText").value=text;$("importText").dispatchEvent(new w.Event("input"));}
  function submit(){ $("importConfirm").click(); }
  function startImport(text){$("importCall").click();input(text);submit();}
  startImport(read("scripts/fixtures/call-block.sql"));await until(()=>$("parameterDialog").open);
  assert.equal($("importDialog").open,false);assert.equal($("routine").value,"1","literal exact name excludes substring match");assert.equal($("parameterRows").querySelectorAll("[data-parameter]").length,32);
  assert.equal($("parameterValue0").value,"demo_user");assert.equal($("parameterValue6").value,"测试日期");assert.equal($("parameterValue8").value,"2000-01-31");assert.equal($("parameterValue29").value,"");assert.equal($("parameterValue29").disabled,true);
  const nulls=Array.from($("parameterRows").querySelectorAll('input[type="checkbox"]'));
  assert.ok(nulls.slice(9).every(n=>n.checked),"all blank imported values including OUT are checked NULL");assert.ok(nulls.slice(0,9).every(n=>!n.checked),"nonempty values remain supplied");assert.equal($("parameterValue31").disabled,true);assert.match($("parameterImport").textContent,/32.*尚未执行.*1 个 OUT.*2 条 DBMS_OUTPUT/);assert.equal(calls.some(c=>c.method==="debug/start"),false);
  $("parameterConfirm").click();assert.equal(calls.some(c=>c.method==="debug/start"),false,"saving imported parameters does not execute");
  $("start").click();assert.ok(Array.from($("parameterRows").querySelectorAll('input[type="checkbox"]')).slice(9).every(n=>n.checked),"saved/reopened blank imports stay NULL");
  $("parameterConfirm").click();await until(()=>$("state").textContent==="执行完成");
  const args=calls.find(c=>c.method==="debug/start").a.arguments;
  assert.ok(args.slice(9).every(v=>v===null),"execution payload contains SQL NULL, never empty strings, for blank imports");assert.deepEqual(Array.from(args.slice(0,3)),["demo_user","DEMO","demo.reports.list"]);
  startImport("CALL overloaded(7);");await until(()=>!$("importChoiceLabel").hidden&&!$("importConfirm").disabled);
  assert.equal($("parameterDialog").open,false);assert.equal($("importChoice").options.length,3);assert.equal($("importChoice").value,"");submit();await until(()=>$("importError").textContent.includes("请先选择"));
  $("importChoice").value="1";submit();await until(()=>$("parameterDialog").open);assert.equal($("routine").value,"3");assert.equal($("parameterValue0").value,"7");$("parameterCancel").click();
  startImport("CALL overloaded(p_seed=>NULL);");await until(()=>!$("importChoiceLabel").hidden&&!$("importConfirm").disabled);input("CALL missing(1);");assert.equal($("importChoiceLabel").hidden,true);submit();await until(()=>$("importError").textContent.includes("未找到"));assert.equal($("routine").value,"3","failed import preserves prior selection");$("importCancel").click();
  startImport("BEGIN overloaded(1+2); END;");await until(()=>$("importError").textContent.includes("只支持"));assert.equal(calls.filter(c=>c.method==="debug/start").length,1,"only the explicitly confirmed run executes");$("importCancel").click();
  startImport("CALL truncated(1);");await until(()=>$("importError").textContent.includes("500"));$("importCancel").click();
  startImport("CALL late(1);");await until(()=>release);$("importCancel").click();release({items:[routine(4,"late")],truncated:false});await until(()=>!$("importCall").disabled);assert.equal($("routine").value,"3");assert.equal($("parameterDialog").open,false,"closing importer invalidates late responses");release=null;
  startImport("CALL late(1);");await until(()=>release);contextId="two";await events.context({connectionId:contextId});release({items:[routine(4,"late")],truncated:false});await until(()=>!$("importCall").disabled);assert.equal($("importDialog").open,false);assert.equal($("parameterDialog").open,false);assert.equal($("routine").options.length,1,"connection change prevents stale import");assert.equal($("importText").value,"");
  dom.window.close();console.log("PASS: blank imports stay NULL through save, reopen and confirmed execution; importing never executes; exact matching; explicit overload choice; failed import preserves selection; edited/cancelled/context-stale imports rejected");
}
main().catch(e=>{console.error(e);process.exit(1);});
