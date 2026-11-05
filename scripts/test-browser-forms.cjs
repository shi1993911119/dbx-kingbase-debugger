"use strict";
// Real Chromium clicks inside DBX's documented allow-scripts-only iframe.
// All RPCs below are synthetic; this test never opens a database connection.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(process.env.DBX_TEST_UI_ROOT||path.join(__dirname,".."));
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
function fakeHost(){
  const profile={id:"private-00000000-0000-0000-0000-000000000042",name:"Synthetic sandbox test",host:"localhost",port:54321,database:"demo_db",username:"synthetic",jdbcJar:"D:\\驱动程序\\kingbase8-8.6.0.jar",timeout:30};
  const preflight={database:"demo_db",user:"synthetic",targetPid:42,controlPid:41,extensionVersion:"1.3"};
  const routine={oid:42,schema_name:"synthetic",routine_name:"probe",kind:"p",arguments:"p_seed integer"};
  let connected=false,state="idle",revision=0,generation="",listener;
  const snapshot=()=>({connectionId:profile.id,state,revision,generation,preflight,position:state==="paused"?{func:42,linenumber:2}:null});
  window.testRPC={calls:[],events:[],failConnect:false};
  document.addEventListener("click",event=>testRPC.events.push({target:event.target.id,disabled:event.target.disabled}),true);
  window.dbxPlugin={ready:Promise.resolve({launcher:true}),onEvent:callback=>listener=callback,onContext:()=>{},workbench:{onClose:()=>{}},notify:()=>{},invoke:async(method,p={})=>{
    testRPC.calls.push({method,p:JSON.parse(JSON.stringify(p))});
    if(method==="profiles/list")return{items:[{...profile,passwordSaved:true,connected}],passwordStorageAvailable:true,passwordStorageLabel:"Windows 凭据管理器"};
    if(method==="profiles/test")return{success:true,preflight};
    if(method==="profiles/save"){Object.assign(profile,p.profile);return{...profile};}
    if(method==="profiles/connect"){
      if(testRPC.failConnect)throw Error("Synthetic connection failure");
      connected=true;state="idle";revision++;return{profile:{...profile},status:snapshot()};
    }
    if(method==="profiles/disconnect"){connected=false;return{success:true};}
    if(method==="debug/status")return snapshot();
    if(method==="debug/preflight")return preflight;
    if(method==="debug/listRoutines")return{items:[routine]};
    if(method==="debug/source")return{source:"BEGIN\n  NULL;\nEND;"};
    if(method==="debug/parameters")return{supported:true,parameters:[{position:1,name:"p_seed",mode:"IN",type:"integer"}]};
    if(method==="debug/start"){state="paused";generation="synthetic-"+(++revision);return snapshot();}
    if(method==="debug/inspect")return{variables:[],stack:[],breakpoints:[]};
    if(method==="debug/stop"){state="cancelled";revision++;return snapshot();}
    if(method==="debug/stepOver"||method==="debug/stepInto"){state="paused";revision++;return snapshot();}
    if(method==="debug/setBreakpoint"||method==="debug/removeBreakpoint")return{success:true};
    throw Error("Unexpected synthetic RPC: "+method);
  }};
}
const script=code=>`<script>${code.replace(/<\/script/gi,"<\\/script")}<\/script>`;
async function main(){
  const options={headless:true};if(process.env.DBX_TEST_CHROMIUM)options.executablePath=process.env.DBX_TEST_CHROMIUM;
  const browser=await chromium.launch(options);let page;
  try{
    page=await browser.newPage({viewport:{width:1600,height:1200}});const errors=[];page.on("pageerror",error=>errors.push(error.message));
    const html=read("ui/index.html").replace('<link rel="stylesheet" href="style.css">',()=>`<style>${read("ui/style.css")}</style>`).replace(/<script src="([^"]+)"><\/script>/g,(_,name)=>script(read("ui/"+name)))
      .replace("<head>","<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'\">")
      .replace("</head>",()=>script(`(${fakeHost.toString()})()`)+"</head>");
    await page.setContent('<iframe sandbox="allow-scripts" style="width:1400px;height:1000px"></iframe>');
    await page.locator("iframe").evaluate((iframe,content)=>{iframe.srcdoc=content;},html);
    const frame=page.frameLocator("iframe"),count=method=>frame.locator("body").evaluate((_,name)=>testRPC.calls.filter(call=>call.method===name).length,method);
    await frame.locator("#connectionDialog[open]").waitFor();await frame.locator("#profileTest").waitFor({state:"visible"});
    await frame.locator("#profileTest").click();await frame.locator('#profileMessage:text-is("测试通过 · demo_db · 执行 42 ／ 控制 41")').waitFor();
    await frame.locator("#profileConnect").click();
    if(process.env.DBX_EXPECT_BLOCKED_SUBMIT==="1"){
      assert.equal(await count("profiles/save"),0);assert.equal(await count("profiles/connect"),0);
      assert.equal(await frame.locator("#connectionDialog").evaluate(dialog=>dialog.open),true);
      assert.match(await frame.locator("#profileMessage").textContent(),/测试通过/);
      console.log("REPRODUCED: original package tests successfully, but real Save and Connect click never fires submit in allow-scripts-only Chromium sandbox");return;
    }
    await frame.locator("#connectionDialog").waitFor({state:"hidden"});await frame.locator("#parameters:enabled").waitFor();
    assert.equal(await count("profiles/connect"),1);assert.equal(await count("profiles/save"),1);
    const savedConnect=await frame.locator("body").evaluate(()=>testRPC.calls.find(call=>call.method==="profiles/connect").p);
    assert.equal(savedConnect.useSavedPassword,true);assert.equal(savedConnect.password,undefined);
    await frame.locator("#parameters").click();await frame.locator("#parameterValue0").fill("7");await frame.locator("#parameterConfirm").click();
    await frame.locator("#parameterDialog").waitFor({state:"hidden"});assert.equal(await count("debug/start"),0);
    await frame.locator("#importCall").click();await frame.locator("#importText").fill("CALL synthetic.probe(8);");
    await frame.locator("#importText").press("Enter");assert.equal(await count("debug/start"),0);assert.equal(await frame.locator("#parameterDialog").evaluate(dialog=>dialog.open),false,"textarea Enter must remain a newline");
    await frame.locator("#importConfirm").click();await frame.locator("#parameterDialog[open]").waitFor();assert.equal(await frame.locator("#parameterValue0").inputValue(),"8");
    await frame.locator("#parameterValue0").press("Enter");await frame.locator("#parameterDialog").waitFor({state:"hidden"});assert.equal(await count("debug/start"),0);
    await frame.locator("#start").click();await frame.locator("#parameterConfirm").click();await frame.locator("#stepOver:enabled").waitFor();assert.equal(await count("debug/start"),1);
    await frame.locator("#stepOver").focus();await frame.locator("#stepOver").press("F8");assert.equal(await count("debug/stepOver"),1);
    await frame.locator("#stop").click();await frame.locator("#manageConnections:enabled").waitFor();
    await frame.locator("#manageConnections").click();await frame.locator("#profileDisconnect").click();await frame.locator("#profileConnect:enabled").waitFor();
    await frame.locator("body").evaluate(()=>{testRPC.failConnect=true;});
    await frame.locator("#profileConnect").click();await frame.locator('#profileMessage:text-is("Synthetic connection failure")').waitFor();
    assert.equal(await frame.locator("#connectionDialog").evaluate(dialog=>dialog.open),true);assert.equal(await frame.locator("#profileConnect").isEnabled(),true);
    await frame.locator("body").evaluate(()=>{testRPC.failConnect=false;});
    await frame.locator("#profileHost").fill("");const attempts=await count("profiles/connect"),saves=await count("profiles/save"),tests=await count("profiles/test");
    for(const id of ["profileConnect","profileSave","profileTest"])await frame.locator("#"+id).click();
    assert.equal(await count("profiles/connect"),attempts);assert.equal(await count("profiles/save"),saves);assert.equal(await count("profiles/test"),tests);
    assert.match(await frame.locator("#profileMessage").textContent(),/有效的连接信息/);
    await frame.locator("#profileHost").fill("localhost");await frame.locator("#profilePassword").press("Enter");await frame.locator("#connectionDialog").waitFor({state:"hidden"});
    assert.equal(await count("profiles/connect"),attempts+1,"password Enter connects once without form submission");
    assert.deepEqual(errors,[]);
    console.log("PASS: real Chromium allow-scripts-only sandbox clicks: saved-password test/connect, parameter save/start, pasted call, Enter handling, F8, validation before disabling, failed-connect retry; synthetic-only RPCs, no database");
  }catch(error){
    if(page){const frame=page.frames()[1];if(frame)console.error("Synthetic frame diagnostics:",await frame.evaluate(()=>({message:document.getElementById("profileMessage")?.textContent,main:document.getElementById("message")?.textContent,calls:window.testRPC?.calls,events:window.testRPC?.events,invalid:[...document.querySelectorAll(":invalid")].map(element=>element.id)})));}
    throw error;
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exit(1);});
