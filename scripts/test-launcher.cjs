"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert/strict"),{JSDOM}=require("jsdom");
const root=path.resolve(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8"),tick=()=>new Promise(r=>setTimeout(r,5));
async function until(f){for(let i=0;i<250&&!f();i++)await tick();assert.ok(f(),"connection manager did not settle");}
const profile=(id,name="测试")=>({id,name,host:"localhost",port:54321,database:"demo_db",username:"demo_user",jdbcJar:"/driver.jar",timeout:30,connected:false});
async function harness(initial=[],vaultAvailable=true,vaultLabel="系统凭据存储"){
  const dom=new JSDOM(read("ui/index.html"),{runScripts:"outside-only"}),w=dom.window,$=id=>w.document.getElementById(id),calls=[],events={};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event("close"));};
  let rows=initial.map(p=>({...p})),currentId="",state="idle",release,fail=false,nextId=0,revision=0;
  const vault=new Map(initial.filter(p=>p.passwordSaved).map(p=>[p.id,"STORED_SECRET"]));
  const status=()=>({connectionId:currentId,state,revision,generation:state==="paused"?"generation":"",preflight:{database:"demo_db",user:"demo_user",targetPid:12,controlPid:11,extensionVersion:"1.3"}});
  const host={ready:Promise.resolve({launcher:true}),onEvent:f=>events.event=f,onContext:f=>events.context=f,workbench:{onClose:f=>events.close=f},notify:(...args)=>calls.push({notify:args}),invoke:async(method,p)=>{
    calls.push({method,p:JSON.parse(JSON.stringify(p))});
    if(method==="profiles/list")return{items:rows.map(p=>({...p,passwordSaved:vault.has(p.id)})),passwordStorageAvailable:vaultAvailable,passwordStorageLabel:vaultLabel};
    if(method==="profiles/save"){const saved={...p.profile,id:p.profile.id||`private-${++nextId}`,connected:false};rows=rows.filter(p=>p.id!==saved.id).concat(saved);if(p.passwordAction==="store")vault.set(saved.id,p.password);if(p.passwordAction==="remove")vault.delete(saved.id);return saved;}
    if(method==="profiles/delete"){rows=rows.filter(row=>row.id!==p.id);vault.delete(p.id);return{success:true};}
    if(method==="profiles/test"){if(fail)throw Error("测试失败");return{preflight:status().preflight};}
    if(method==="profiles/connect"){
      if(fail)throw Error("连接失败");
      if(release===true)await new Promise(r=>release=r);
      if(p.rememberPassword===true)vault.set(p.id,p.useSavedPassword?vault.get(p.id):p.password);if(p.rememberPassword===false)vault.delete(p.id);
      currentId=p.id;rows.forEach(row=>row.connected=row.id===currentId);return{profile:rows.find(row=>row.id===currentId),status:status()};
    }
    if(method==="profiles/disconnect"){rows.forEach(row=>{if(row.id===p.id)row.connected=false;});if(currentId===p.id)currentId="";return{success:true};}
    if(method==="debug/status")return status();if(method==="debug/preflight")return status().preflight;
    if(method==="debug/listRoutines")return{items:[{oid:1,schema_name:"demo_user",routine_name:"probe",kind:"p",arguments:"p_seed integer"}]};
    if(method==="debug/source")return{source:"BEGIN\nNULL;\nEND;"};if(method==="debug/parameters")return{supported:true,parameters:[{position:1,name:"p_seed",mode:"IN",type:"integer"}]};
    if(method==="debug/start"){state="paused";revision++;return status();}if(method==="debug/inspect")return{variables:[],stack:[],breakpoints:[]};
    if(method==="debug/stop"){state="cancelled";revision++;return status();}
    throw Error("Unexpected API: "+method);
  }};
  w.dbxPlugin=host;for(const f of ["ui/forms.js","ui/launcher.js","ui/call-import.js","ui/app.js"])w.eval(read(f));
  await until(()=>$("connectionDialog").open&&!$("profileNew").disabled);
  return{w,$,calls,events,vault,setFail:v=>fail=v,delay:()=>release=true,release:()=>{const r=release;release=undefined;r();},hasPending:()=>typeof release==="function",dispose:()=>w.close()};
}
function fill(h){for(const [id,v] of Object.entries({profileName:"本地测试",profileHost:"localhost",profileDatabase:"demo_db",profileUsername:"demo_user",profileJdbcJar:"/driver.jar",profilePassword:"LOCAL_SECRET"}))h.$(id).value=v;}
function submit(h){h.$("profileConnect").click();}
async function main(){
  let h=await harness();fill(h);h.$("profileSave").click();await until(()=>h.$("profileMessage").textContent.includes("配置已保存"));
  assert.equal(h.calls.some(c=>c.method==="profiles/connect"),false,"saving cannot connect or run target");
  assert.equal(h.calls.find(c=>c.method==="profiles/save").p.profile.password,undefined,"password excluded from saved fields");
  assert.equal(h.$("profilePassword").value,"LOCAL_SECRET","saving does not erase locally typed password before connect");
  h.$("profileTest").click();await until(()=>h.$("profileMessage").textContent.includes("测试通过"));assert.equal(h.calls.find(c=>c.method==="profiles/test").p.password,"LOCAL_SECRET");
  submit(h);submit(h);await until(()=>!h.$("connectionDialog").open&&!h.$("parameters").disabled);
  assert.equal(h.calls.filter(c=>c.method==="profiles/connect").length,1,"double submit opens one session");assert.equal(h.$("profilePassword").value,"");
  assert.equal(h.calls.find(c=>c.method==="profiles/connect").p.password,"LOCAL_SECRET");assert.match(h.$("connection").textContent,/本地测试/);
  assert.ok(h.calls.filter(c=>c.method?.startsWith("debug/")).every(c=>c.p.connectionId.startsWith("private-")),"private IDs stay inside backend calls");
  h.$("parameters").click();h.$("parameterValue0").value="7";h.$("parameterValue0").dispatchEvent(new h.w.Event("input"));h.$("parameterConfirm").click();
  await h.events.context({launcher:true});h.$("parameters").click();assert.equal(h.$("parameterValue0").value,"7","top reentry preserves parameter draft");h.$("parameterCancel").click();
  h.$("manageConnections").click();await until(()=>h.$("connectionDialog").open&&!h.$("profileConnect").disabled);assert.equal(h.$("profileConnect").textContent,"返回调试");assert.equal(h.$("profileHost").disabled,true);submit(h);await tick();assert.equal(h.calls.filter(c=>c.method==="profiles/connect").length,1,"returning to active profile never reconnects");
  h.$("start").click();h.$("parameterConfirm").click();await until(()=>h.$("state").textContent==="已暂停");assert.equal(h.$("manageConnections").disabled,true,"switch disabled during debug");h.$("stop").click();await until(()=>h.$("state").textContent==="已停止");
  h.$("manageConnections").click();await until(()=>!h.$("profileDisconnect").disabled);h.$("profileDisconnect").click();await until(()=>h.$("profileMessage").textContent.includes("连接已断开"));assert.equal(h.$("start").disabled,true);assert.equal(h.$("profilePassword").value,"");
  h.$("profileDelete").click();assert.equal(h.$("profileDeleteConfirm").hidden,false);h.$("profileDeleteCancel").click();assert.equal(h.calls.some(c=>c.method==="profiles/delete"),false);
  h.$("profileDelete").click();h.$("profileDeleteConfirmButton").click();await until(()=>h.$("profileMessage").textContent.includes("配置已删除"));assert.equal(h.$("profileSelect").options.length,1);h.dispose();

  h=await harness([profile("private-one")]);h.$("profilePassword").value="LOCAL_SECRET";h.setFail(true);submit(h);await until(()=>h.$("profileMessage").textContent==="连接失败");assert.equal(h.$("connectionDialog").open,true);assert.equal(h.$("profilePassword").value,"");assert.equal(h.$("profileConnect").disabled,false,"failed connection permits retry");
  h.setFail(false);h.$("profilePassword").value="RETRY_SECRET";h.delay();submit(h);await until(()=>h.hasPending());const closing=h.events.close();h.release();await closing;
  assert.ok(h.calls.some(c=>c.method==="profiles/disconnect"),"closing during connect cleans eventual connection");assert.equal(h.calls.some(c=>c.method?.startsWith("debug/")),false,"closed workbench cannot load target");h.dispose();

  h=await harness([profile("private-two")]);h.delay();submit(h);await until(()=>h.hasPending());h.w.dispatchEvent(new h.w.Event("pagehide"));const notice=h.calls.find(c=>c.notify?.[0]==="profiles/disconnect");assert.equal(notice.notify[1].id,"private-two");assert.ok(notice.notify[1].requestToken,"pagehide cancellation carries the same connect token");h.release();await until(()=>h.calls.some(c=>c.method==="profiles/disconnect"));h.dispose();

  h=await harness();fill(h);h.$("profileRememberPassword").checked=true;h.$("profileRememberPassword").dispatchEvent(new h.w.Event("change"));h.$("profileSave").click();await until(()=>h.$("profileMessage").textContent.includes("密码保存在系统凭据存储"));
  const secretSave=h.calls.find(c=>c.method==="profiles/save");assert.equal(secretSave.p.passwordAction,"store");assert.equal(secretSave.p.password,"LOCAL_SECRET");assert.equal(secretSave.p.profile.password,undefined);assert.equal(h.$("profilePassword").value,"","successfully stored password is cleared from field");
  h.$("profileTest").click();await until(()=>h.$("profileMessage").textContent.includes("测试通过"));const savedTest=h.calls.find(c=>c.method==="profiles/test");assert.equal(savedTest.p.useSavedPassword,true);assert.equal(savedTest.p.password,undefined,"stored password never comes back to UI");
  submit(h);await until(()=>!h.$("connectionDialog").open);const savedConnect=h.calls.find(c=>c.method==="profiles/connect");assert.equal(savedConnect.p.useSavedPassword,true);assert.equal(savedConnect.p.password,undefined);h.dispose();

  h=await harness([{...profile("private-saved"),passwordSaved:true}]);assert.equal(h.$("profileRememberPassword").checked,true);assert.equal(h.$("profilePassword").value,"");assert.match(h.$("profilePassword").placeholder,/已保存/);assert.equal(h.w.document.activeElement.id,"profileConnect","saved profile focuses connect");
  h.$("profileUsername").value="new-user";h.$("profileUsername").dispatchEvent(new h.w.Event("input"));assert.doesNotMatch(h.$("profilePassword").placeholder,/已保存/);h.$("profileTest").click();await until(()=>h.calls.some(c=>c.method==="profiles/test"));assert.equal(h.calls.find(c=>c.method==="profiles/test").p.useSavedPassword,false,"changed identity cannot reuse stored password");
  h.$("profileUsername").value="demo_user";h.$("profileUsername").dispatchEvent(new h.w.Event("input"));h.$("profileRememberPassword").checked=false;h.$("profileRememberPassword").dispatchEvent(new h.w.Event("change"));await until(()=>!h.$("profileSave").disabled);h.$("profileSave").click();await until(()=>h.$("profileMessage").textContent.includes("未保存密码"));assert.equal(h.vault.has("private-saved"),false);assert.equal(h.calls.filter(c=>c.method==="profiles/save").at(-1).p.passwordAction,"remove");h.dispose();

  h=await harness([profile("private-connect-save")]);h.$("profilePassword").value="NEW_SECRET";h.$("profileRememberPassword").checked=true;submit(h);await until(()=>!h.$("connectionDialog").open);assert.equal(h.vault.get("private-connect-save"),"NEW_SECRET");assert.equal(h.calls.find(c=>c.method==="profiles/save").p.password,undefined,"connect saves password only after success");assert.equal(h.calls.find(c=>c.method==="profiles/connect").p.rememberPassword,true);h.dispose();
  h=await harness([{...profile("private-retain"),passwordSaved:true}]);h.$("profilePassword").value="WRONG_SECRET";h.setFail(true);submit(h);await until(()=>h.$("profileMessage").textContent==="连接失败");assert.equal(h.vault.get("private-retain"),"STORED_SECRET","failed connect preserves previous saved credential");h.dispose();
  h=await harness([profile("private-no-vault")],false);assert.equal(h.$("profileRememberPassword").disabled,true);assert.match(h.$("profilePasswordStatus").textContent,/不可用/);h.dispose();
  h=await harness([],true,"Windows 凭据管理器");assert.match(h.$("profilePasswordLabel").textContent,/Windows 凭据管理器/);assert.match(h.$("connectionHelp").textContent,/Windows 凭据管理器/);h.dispose();
  h=await harness([],true,"macOS 钥匙串");assert.match(h.$("profilePasswordLabel").textContent,/macOS 钥匙串/);h.dispose();
  console.log("PASS: plugin profiles CRUD, secret-free profile fields, tests/connect, duplicate submits, singleton/drafts, active-run guard, disconnect/delete, retries/close races; Keychain opt-in, save/use/replace/remove, blank field and no secret hydration, endpoint binding, save only after successful connect, unavailable fallback; no host connection API");
}
main().catch(e=>{console.error(e);process.exit(1);});
