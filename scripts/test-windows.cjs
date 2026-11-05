"use strict";
// Run in Windows with a freshly unpacked package; only synthetic credentials.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const {spawn,spawnSync} = require("node:child_process"), {randomUUID,createHash} = require("node:crypto");
const root=path.resolve(process.argv[2]), java=process.argv[3];
assert.equal(process.platform,"win32");
const helper=path.join(root,"lib","credential-helper.exe"), launcher=path.join(root,"bin","windows-x64","dbx-kingbase-debugger.exe");
const account="private-"+randomUUID()+":"+createHash("sha256").update("synthetic-only-windows-test").digest("hex");
function call(operation,values={}) {
  const r=spawnSync(helper,[],{input:JSON.stringify({operation,account,...values}),encoding:"utf8",windowsHide:true,timeout:15000});
  assert.equal(r.status,0,"helper exited");return JSON.parse(r.stdout);
}
function good(operation,values){const r=call(operation,values);assert.equal(r.ok,true,`credential operation ${operation} failed: ${r.status}`);return r;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<200;i++){if(await f())return;await sleep(100);}throw Error("Windows process check timed out");}
function processList(){
 const r=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name) | ConvertTo-Json -Compress"],{encoding:"utf8",windowsHide:true,timeout:15000});assert.equal(r.status,0);return JSON.parse(r.stdout||"[]");
}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function start(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"dbx-windows-rpc-"));
 const child=spawn(launcher,[],{env:{...process.env,DBX_KINGBASE_JAVA:java,DBX_PLUGIN_DATA_DIR:dir},windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let buffer="",stderr="";const replies=new Map();
 child.stdout.setEncoding("utf8");child.stdout.on("data",chunk=>{buffer+=chunk;let pos;while((pos=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);if(line.trim()){const r=JSON.parse(line);replies.set(r.id,r);}}});
 child.stderr.on("data",chunk=>stderr+=chunk);
 let next=0;async function rpc(method,params={}){const id=++next;child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");await until(()=>{if(child.exitCode!==null)throw Error("launcher exit: "+stderr);return replies.has(id)});const r=replies.get(id);assert.equal(r.error,undefined);return r.result;}
 const initialized=await rpc("plugin/initialize",{host:{protocolVersions:[1]}});
 assert.equal(initialized.plugin.version,JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8")).version);
 const list=await rpc("profiles/list");assert.equal(list.passwordStorageLabel,"Windows 凭据管理器");assert.equal(list.passwordStorageAvailable,true);assert.deepEqual(list.items,[]);
 return {child,dir,rpc};
}
async function main(){
 assert.equal(good("has").found,false);
 try {
  const secret="Synthetic only 中文 '\" \\ \n $(inert) `inert` "+randomUUID();
  good("set",{password:secret});assert.equal(good("get").password,secret);assert.equal(good("has").password,undefined);
  good("set",{password:"replacement"});assert.equal(good("get").password,"replacement");
  good("set",{password:""});assert.equal(good("get").password,"");
  good("set",{password:"x".repeat(2551)});assert.equal(good("get").password.length,2551);
  assert.equal(call("set",{password:"x".repeat(2552)}).ok,false);assert.equal(good("get").password.length,2551);
 } finally {good("delete");}
 assert.equal(good("get").found,false);good("delete");
 console.log("PASS: Windows Credential Manager create/presence/read/update/empty/size limit/delete; synthetic item removed, no secret output");
 let p=await start();
 let descendants=processList().filter(row=>row.ParentProcessId===p.child.pid&&row.Name.toLowerCase()==="java.exe");assert.equal(descendants.length,1);
 const javaPid=descendants[0].ProcessId;
 p.child.stdin.end();await until(()=>p.child.exitCode!==null);assert.equal(p.child.exitCode,0);await until(()=>!alive(javaPid));fs.rmSync(p.dir,{recursive:true,force:true});
 console.log("PASS: x64 launcher -> Java JSON-RPC initialize/profiles/list; stdin EOF exits both processes");
 p=await start();descendants=processList().filter(row=>row.ParentProcessId===p.child.pid&&row.Name.toLowerCase()==="java.exe");assert.equal(descendants.length,1);
 const killedJava=descendants[0].ProcessId;
 p.child.kill("SIGKILL");await until(()=>!alive(killedJava));fs.rmSync(p.dir,{recursive:true,force:true});
 console.log("PASS: terminating x64 launcher also terminates Java via Windows Job Object");
}
main().catch(e=>{console.error(e.message);process.exit(1);});
