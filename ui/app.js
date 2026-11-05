"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const labels = { idle:"就绪", preparing:"准备中", waiting:"等待入口断点", paused:"已暂停", running:"执行中", stopping:"停止中", finished:"执行完成", cancelled:"已停止", error:"调试失败", disconnected:"连接已关闭" };
  const active = new Set(["preparing","waiting","paused","running","stopping"]);
  const macKeymap=/Mac/i.test(navigator.userAgentData?.platform||navigator.platform||navigator.userAgent);
  const breakpointShortcut=macKeymap?"⌘F8":"Ctrl+F8";
  const shortcuts=[
    {id:"stepOver",key:"F8",label:"F8",aria:"F8"},
    {id:"stepInto",key:"F7",label:"F7",aria:"F7"},
    ...(macKeymap?[
      {id:"continue",key:"r",code:"KeyR",meta:true,alt:true,label:"⌘⌥R",aria:"Meta+Alt+R"},
      {id:"stop",key:"F2",meta:true,label:"⌘F2",aria:"Meta+F2"},
      {id:"start",key:"d",code:"KeyD",ctrl:true,label:"⌃D",aria:"Control+D"},
      {id:"breakpoint",key:"F8",meta:true,label:breakpointShortcut,aria:"Meta+F8"}
    ]:[
      {id:"continue",key:"F9",label:"F9",aria:"F9"},
      {id:"stop",key:"F2",ctrl:true,label:"Ctrl+F2",aria:"Control+F2"},
      {id:"start",key:"F9",shift:true,label:"Shift+F9",aria:"Shift+F9"},
      {id:"breakpoint",key:"F8",ctrl:true,label:breakpointShortcut,aria:"Control+F8"}
    ])
  ];
  let connections, connectionBusy=false, stopPending=false, disposed=false;
  let host, connectionId=null, status={state:"idle",generation:""}, revision=-1, routines=[], selected=null, sourceOid=0, sourceText="", breakpoints=new Set(), busy=false, poll, inspectSerial=0;
  let searchTimer, searchSerial=0, searching=false, selectionSerial=0, parameterMetadata=null, dialogRun=false, dialogOid=0;
  const argumentDrafts=new Map();
  const importNotes=new Map();let importSerial=0,pendingImport=null;
  let resultSerial=0, resultKey="", resultOutputs=[];
  let sourceCursor={oid:0,line:0};
  function fixedNull(p) { return p.mode==="OUT"||p.cursor===true; }
  const value = (row, keys, fallback="") => { for (const key of keys) if(row?.[key]!==undefined && row[key]!==null)return row[key]; return fallback; };
  const bpOid = row => Number(value(row,["func","function","funcid","functionoid","oid"],0));
  const bpLine = row => Number(value(row,["linenumber","line","line_number"],0));
  function message(text,error=false) { $("message").textContent=text; $("message").classList.toggle("error",error); }
  function log(text) {
    const output=$("output");
    if(output.textContent.startsWith("["))output.textContent="";
    output.textContent += new Date().toLocaleTimeString()+"  "+text+"\n";
    if(output.textContent.length>120000)output.textContent=output.textContent.slice(-100000);
    output.scrollTop=output.scrollHeight;
  }
  function renderControls() {
    const running=active.has(status.state), paused=status.state==="paused", blocked=busy||connectionBusy||stopPending;
    $("manageConnections").disabled=blocked||running;
    $("state").textContent=labels[status.state]||status.state;
    $("refresh").disabled=blocked||running||!connectionId;
    $("schema").disabled=blocked||running;
    $("routineSearch").disabled=blocked||running||!connectionId;
    $("importCall").disabled=blocked||running||!connectionId;
    $("importConfirm").disabled=blocked||running||!connectionId;
    $("routine").disabled=blocked||running||searching;
    $("parameters").disabled=blocked||running||searching||!selected||!parameterMetadata?.supported;
    $("start").disabled=blocked||running||searching||!selected||!connectionId||!parameterMetadata?.supported;
    $("parameterConfirm").disabled=blocked||running||!selected||!parameterMetadata?.supported;
    for(const id of ["stepOver","stepInto","continue"])$(id).disabled=blocked||!paused;
    $("stop").disabled=stopPending||!running||status.state==="stopping"||!status.generation;
    const info=status.preflight;
    if(info){$("pids").textContent=`执行连接 ${info.targetPid} ／ 控制连接 ${info.controlPid} · ${info.database}${["finished","cancelled","error","disconnected"].includes(status.state)?" · 已关闭":""}`;$("extension").textContent=`PL/SQL · plsql_pldbgapi ${info.extensionVersion}`;}
    const line=bpLine(status.position);
    $("position").textContent=paused?`已暂停 · OID ${bpOid(status.position)} · 第 ${line} 行 · ${breakpointShortcut} 切换断点`:"暂停后点击源码行号可设置断点";
  }
  function renderSource() {
    const container=$("source"),focused=document.activeElement;
    const focusedRow=focused?.closest?.(".source-line");
    const focusedLine=container.contains(focused)&&focused?.matches("button")&&Number(focusedRow?.dataset.oid)===sourceOid?Number(focusedRow.dataset.line):0;
    container.replaceChildren();
    if(!sourceText){const p=document.createElement("p");p.className="empty";p.textContent="选择过程或函数以加载源码。";container.append(p);return;}
    const current=bpOid(status.position)===sourceOid?bpLine(status.position):0;
    const fragment=document.createDocumentFragment();
    sourceText.split("\n").forEach((text,index)=>{
      const line=index+1,row=document.createElement("div"),gutter=document.createElement("button"),code=document.createElement("code");
      row.dataset.line=String(line);row.dataset.oid=String(sourceOid);
      row.className="source-line"+(status.state==="paused"&&current===line?" current":"")+(sourceCursor.oid===sourceOid&&sourceCursor.line===line?" selected-line":"");
      gutter.textContent=(breakpoints.has(`${sourceOid}:${line}`)?"● ":"")+line;
      gutter.className=breakpoints.has(`${sourceOid}:${line}`)?"breakpoint":"";
      gutter.title=`第 ${line} 行：${gutter.className?"删除":"设置"}断点（${breakpointShortcut}）`;
      gutter.setAttribute("aria-label",gutter.title);gutter.disabled=busy||stopPending||status.state!=="paused";
      gutter.addEventListener("click",()=>toggleBreakpoint(line));
      code.textContent=text||" ";row.append(gutter,code);fragment.append(row);
    });container.append(fragment);
    if(focusedLine){const gutter=container.querySelector(`[data-line="${focusedLine}"] button`);if(gutter&&!gutter.disabled)gutter.focus({preventScroll:true});}
    const currentRow=container.querySelector(".current");
    if(currentRow&&(currentRow.offsetTop<container.scrollTop||currentRow.offsetTop>container.scrollTop+container.clientHeight-48))container.scrollTop=Math.max(0,currentRow.offsetTop-container.offsetTop-container.clientHeight/3);
  }
  function selectSourceLine(event) {
    const row=event.target.closest?.(".source-line");if(!row)return;
    sourceCursor={oid:Number(row.dataset.oid),line:Number(row.dataset.line)};
    for(const item of $("source").querySelectorAll(".selected-line"))item.classList.remove("selected-line");
    row.classList.add("selected-line");
  }
  function shortcutBreakpointLine() {
    const container=$("source"),focused=document.activeElement?.closest?.(".source-line");
    const selection=window.getSelection(),node=selection?.focusNode;
    const selectedRow=(node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest?.(".source-line");
    const row=focused&&container.contains(focused)?focused:selectedRow&&container.contains(selectedRow)?selectedRow:null;
    if(row)return Number(row.dataset.line);
    if(sourceCursor.oid===sourceOid)return sourceCursor.line;
    return bpOid(status.position)===sourceOid?bpLine(status.position):0;
  }
  // Match DataGrip's platform default keymap within this workbench only. All
  // actions reuse the buttons' enabled state and the same confirmation flow.
  function debugShortcut(event) {
    if(disposed||event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229)return;
    if(document.querySelector("dialog[open]"))return;
    const target=event.target;
    if(target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')||target.isContentEditable)return;
    const match=shortcuts.find(binding=>(event.key.toLowerCase()===binding.key.toLowerCase()||(binding.code&&event.code===binding.code))&&["ctrl","shift","alt","meta"].every(mod=>!!event[`${mod}Key`]===!!binding[mod]));
    if(!match)return;
    if(match.id==="breakpoint"){
      if(busy||connectionBusy||stopPending||status.state!=="paused"||!status.generation||!sourceOid)return;
      const line=shortcutBreakpointLine();if(!Number.isInteger(line)||line<1||line>sourceText.split("\n").length)return;
      event.preventDefault();event.stopPropagation();void toggleBreakpoint(line);
    }else if(!$(match.id).disabled){event.preventDefault();event.stopPropagation();$(match.id).click();}
  }
  function table(id,columns,rows,emptyText) {
    const container=$(id);container.replaceChildren();
    if(!rows?.length){const p=document.createElement("p");p.className="empty";p.textContent=emptyText;container.append(p);return;}
    const table=document.createElement("table"),head=document.createElement("thead"),tr=document.createElement("tr"),body=document.createElement("tbody");
    for(const [label] of columns){const th=document.createElement("th");th.textContent=label;tr.append(th);}head.append(tr);
    for(const row of rows){const tr=document.createElement("tr");for(const [,keys] of columns){const td=document.createElement("td"),v=value(row,keys,null);td.textContent=v===null?"NULL":String(v);td.title=td.textContent;tr.append(td);}body.append(tr);}table.append(head,body);container.append(table);
  }
  function showOutputTab(results) {
    $("outputTab").setAttribute("aria-selected",String(!results));$("resultTab").setAttribute("aria-selected",String(results));
    $("output").hidden=results;$("resultPanel").hidden=!results;$("resultPicker").hidden=!results;$("resultSummary").hidden=!results;$("clear").hidden=results;
  }
  function clearResults() {
    ++resultSerial;resultKey="";resultOutputs=[];$("resultSelect").replaceChildren();$("resultPanel").replaceChildren();$("resultSummary").textContent="";$("resultTab").textContent="结果集";$("resultTab").disabled=true;showOutputTab(false);
  }
  async function loadResult() {
    const serial=++resultSerial,id=connectionId,generation=status.generation,resultId=Number($("resultSelect").value);
    $("resultPanel").replaceChildren();$("resultSummary").textContent="正在读取结果集…";
    const current=()=>serial===resultSerial&&id===connectionId&&generation===status.generation&&status.state==="finished";
    try {
      const response=await invoke("debug/result",{generation,resultId});
      if(!current()||response.generation!==generation||response.resultId!==resultId)return;
      const data=response.result,grid=document.createElement("table"),thead=document.createElement("thead"),head=document.createElement("tr"),body=document.createElement("tbody");grid.className="result-grid";
      const ordinal=document.createElement("th");ordinal.textContent="#";head.append(ordinal);
      for(const column of data.columns||[]){const th=document.createElement("th"),label=document.createElement("span"),type=document.createElement("small");label.textContent=column.name??"";type.textContent=column.type??"";th.append(label,type);head.append(th);}thead.append(head);
      (data.rows||[]).forEach((row,index)=>{const tr=document.createElement("tr"),number=document.createElement("td");number.textContent=String(index+1);number.className="row-number";tr.append(number);for(let i=0;i<(data.columns||[]).length;i++){const td=document.createElement("td"),cell=row[i];td.textContent=cell==null?"NULL":String(cell);if(cell==null)td.className="sql-null";tr.append(td);}body.append(tr);});
      grid.append(thead,body);$("resultPanel").append(grid);
      if(!data.rows?.length){const empty=document.createElement("p");empty.className="empty";empty.textContent=data.truncated?"结果超过大小限制，未显示数据行。":"查询结果为空，列定义如上。";$("resultPanel").append(empty);}
      $("resultSummary").textContent=`${data.rowCount} 行 · ${data.columns?.length||0} 列${data.truncated?" · 已截断（行数或总大小达到上限）":""}`;
    }catch(e){if(current()){$("resultSummary").textContent="结果集读取失败";const p=document.createElement("p");p.className="empty";p.textContent=e.message||String(e);$("resultPanel").append(p);}}
  }
  function acceptResults() {
    const items=status.state==="finished"?(status.outputs||[]).filter(p=>Number.isInteger(p.resultId)):[];
    const key=items.length?`${connectionId}:${status.generation}:${items.map(p=>p.resultId).join(",")}`:"";
    if(key===resultKey)return;
    clearResults();if(!items.length)return;resultKey=key;resultOutputs=items;
    for(const p of items){const option=document.createElement("option");option.value=String(p.resultId);option.textContent=`${p.name} · ${p.rowCount} 行${p.truncated?" · 已截断":""}`;$("resultSelect").append(option);}
    $("resultTab").disabled=false;$("resultTab").textContent=`结果集 (${items.length})`;showOutputTab(true);void loadResult();
  }
  async function invoke(method,p={}) {
    if(!host||!connectionId)throw new Error("请从顶部“金仓调试”打开插件，并在连接管理中连接数据库。");
    return host.invoke(method,{...p,connectionId},{timeoutMs:45000});
  }
  async function action(fn) {
    if(busy)return;busy=true;renderControls();
    try{await fn();}catch(e){message(e.message||String(e),true);log(e.message||String(e));}
    finally{busy=false;renderControls();renderSource();}
  }
  function clearSelection() {
    closeImport();
    ++selectionSerial;selected=null;parameterMetadata=null;sourceText="";sourceOid=0;sourceCursor={oid:0,line:0};breakpoints.clear();
    $("parameterSummary").textContent="选择对象后填写参数";$("sourceTitle").textContent="源码";$("sourceOid").textContent="";
    if($("parameterDialog").open)$("parameterDialog").close();
    renderControls();renderSource();
  }
  async function loadRoutines() {
    clearTimeout(searchTimer);
    if(!connectionId||active.has(status.state))return;
    const id=connectionId,serial=++searchSerial,schema=$("schema").value.trim(),search=$("routineSearch").value.trim();
    clearSelection();searching=true;$("routineCount").textContent="正在搜索…";renderControls();
    try {
      const loaded=await invoke("debug/listRoutines",{schema,search});
      if(id!==connectionId||serial!==searchSerial)return;
      routines=Array.isArray(loaded)?loaded:loaded.items||[];
      const select=$("routine");select.replaceChildren();
      const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent=routines.length?"选择 PL/SQL 对象":search?"没有匹配的过程或函数":"此模式没有可调试的过程或函数";select.append(placeholder);
      for(const r of routines){const option=document.createElement("option");option.value=String(r.oid);option.textContent=`${r.kind==="f"?"函数":"过程"} · ${r.schema_name}.${r.routine_name}(${r.arguments||""})`;option.title=option.textContent;select.append(option);}
      $("routineCount").textContent=loaded.truncated?"显示前 500 个结果，请输入更完整的名称缩小范围":`${search?"匹配":"已加载"} ${routines.length} 个对象`;
      message(search?`名称包含「${search}」的搜索已完成。选择对象后可逐项填写参数。`:"可输入部分名称搜索过程或函数，再选择对象填写参数。");
    } catch(e){if(id===connectionId&&serial===searchSerial){routines=[];$("routine").replaceChildren();$("routineCount").textContent="搜索失败，请重试";message(e.message||String(e),true);}}
    finally{if(id===connectionId&&serial===searchSerial){searching=false;renderControls();}}
    if(id===connectionId&&serial===searchSerial&&routines.length===1){$("routine").value=String(routines[0].oid);await selectRoutine();}
  }
  function scheduleSearch() {
    clearTimeout(searchTimer);++searchSerial;clearSelection();searching=true;renderControls();
    $("routineCount").textContent="等待搜索…";searchTimer=setTimeout(loadRoutines,250);
  }
  function parameterSummary(saved=false) {
    const counts=new Map();for(const p of parameterMetadata?.parameters||[]){const mode=p.mode||"IN";counts.set(mode,(counts.get(mode)||0)+1);}
    const summary=[...counts].map(([mode,count])=>`${count} ${mode}`).join(" ／ ");
    return summary?(saved?"已保存 · ":"")+summary:"无参数";
  }
  async function selectRoutine() {
    if(busy||searching||active.has(status.state))return;
    clearSelection();selected=routines.find(r=>String(r.oid)===$("routine").value)||null;
    if(!selected){$("routine").title="";return;}
    $("routine").title=`${selected.schema_name}.${selected.routine_name}(${selected.arguments||""})`;
    const oid=Number(selected.oid),id=connectionId,serial=selectionSerial;
    await action(async()=>{
      const data=await invoke("debug/source",{oid});if(id!==connectionId||serial!==selectionSerial)return;
      sourceOid=oid;sourceText=data.source||"";
      $("sourceTitle").textContent=`${selected.schema_name}.${selected.routine_name}`;$("sourceOid").textContent=`OID ${oid}`;
      const metadata=await invoke("debug/parameters",{oid});
      if(id!==connectionId||serial!==selectionSerial)return;
      parameterMetadata=metadata;
      $("parameterSummary").textContent=metadata.supported?parameterSummary():"参数模式暂不支持";
      message(metadata.supported?`参数签名：${selected.arguments||"无参数"}。点击「填写参数」逐项输入，或点击「开始调试」打开确认窗口。`:metadata.reason,!metadata.supported);
    });
  }
  function routineChanged(){if(String(selected?.oid||"")!==$("routine").value)void selectRoutine();}
  function draftKey(){return `${connectionId}:${selected.oid}`;}
  function closeImport(){++importSerial;pendingImport=null;if($("importDialog").open)$("importDialog").close();}
  function resetImportChoices(){pendingImport=null;$("importChoiceLabel").hidden=true;$("importChoice").replaceChildren();$("importConfirm").textContent="解析并填入参数";}
  function openImport(){
    if(busy||active.has(status.state)||!connectionId)return;
    clearTimeout(searchTimer);++searchSerial;searching=false;++importSerial;resetImportChoices();$("importError").textContent="";
    $("importDialog").showModal();$("importText").focus();renderControls();
  }
  async function importCall(event){
    event.preventDefault();if(busy||active.has(status.state)||!connectionId)return;
    const id=connectionId,serial=++importSerial,text=$("importText").value;
    const current=()=>id===connectionId&&serial===importSerial&&$("importDialog").open&&text===$("importText").value&&!active.has(status.state);
    let imported=false;
    await action(async()=>{
      $("importError").textContent="正在解析并核对数据库签名…";
      try{
        let choices=pendingImport?.text===text?pendingImport.choices:null,parsed=pendingImport?.text===text?pendingImport.parsed:null;
        if(!choices){
          parsed=window.KingbaseCallImport.parse(text);
          const parts=parsed.nameParts,target=parts.at(-1),schema=parts.length===2?(parts[0].quoted?parts[0].value:parts[0].value.toLowerCase()):$("schema").value.trim();
          const loaded=await invoke("debug/listRoutines",{schema,search:target.value});if(!current())return;
          if(loaded.truncated)throw new Error("匹配结果超过 500 个，请补全模式和过程名后重试。");
          const exact=(Array.isArray(loaded)?loaded:loaded.items||[]).filter(r=>window.KingbaseCallImport.matches(r.routine_name,target)&&(!parsed.returnsValue||r.kind==="f"));
          if(!exact.length)throw new Error(`在模式 ${schema} 中未找到 ${target.value}，请检查模式名和过程名。`);
          const checked=await Promise.all(exact.map(async routine=>{
            const metadata=await invoke("debug/parameters",{oid:Number(routine.oid)});
            try{if(!metadata.supported)throw new Error(metadata.reason||"参数类型暂不支持。");return{routine,metadata,...window.KingbaseCallImport.bind(parsed,metadata.parameters)};}
            catch(e){return{routine,error:e.message||String(e)};}
          }));if(!current())return;
          choices=checked.filter(c=>!c.error);
          if(!choices.length)throw new Error(checked.length===1?checked[0].error:"没有参数数量、名称和支持类型均匹配的重载；请核对文本与数据库签名。");
          if(choices.length>1){
            pendingImport={text,parsed,choices};$("importChoice").replaceChildren();
            const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="请选择要调试的重载";$("importChoice").append(placeholder);
            choices.forEach((c,i)=>{const option=document.createElement("option");option.value=String(i);option.textContent=`${c.routine.schema_name}.${c.routine.routine_name}(${c.routine.arguments||""}) · OID ${c.routine.oid}`;$("importChoice").append(option);});
            $("importChoiceLabel").hidden=false;$("importConfirm").textContent="将此重载填入参数";$("importError").textContent="找到多个匹配签名，请明确选择一个重载。";return;
          }
        }
        if(choices.length>1&&$("importChoice").value==="")throw new Error("请先选择要调试的重载。");
        const chosen=choices[choices.length===1?0:Number($("importChoice").value)];if(!chosen)throw new Error("请重新选择重载。");
        const data=await invoke("debug/source",{oid:Number(chosen.routine.oid)});if(!current())return;
        clearSelection();routines=choices.map(c=>c.routine);selected=chosen.routine;parameterMetadata=chosen.metadata;sourceOid=Number(selected.oid);sourceText=data.source||"";
        $("schema").value=selected.schema_name;$("routineSearch").value=selected.routine_name;$("routine").replaceChildren();
        for(const r of routines){const option=document.createElement("option");option.value=String(r.oid);option.textContent=`${r.kind==="f"?"函数":"过程"} · ${r.schema_name}.${r.routine_name}(${r.arguments||""})`;option.title=option.textContent;$("routine").append(option);}
        $("routine").value=String(selected.oid);$("routine").title=`${selected.schema_name}.${selected.routine_name}(${selected.arguments||""})`;$("routineCount").textContent=`导入匹配 ${routines.length} 个对象`;
        $("sourceTitle").textContent=`${selected.schema_name}.${selected.routine_name}`;$("sourceOid").textContent=`OID ${sourceOid}`;
        argumentDrafts.set(draftKey(),chosen.draft);
        const notice=`已从调用文本导入 ${chosen.draft.length} 个参数，尚未执行。${chosen.forcedOut?` ${chosen.forcedOut} 个 OUT 参数的文本初值已按数据库签名设为 NULL。`:""}${parsed.diagnostics?` ${parsed.diagnostics} 条 DBMS_OUTPUT.PUT_LINE 仅作识别，返回参数和过程自身输出由工作台显示。`:""}`;
        importNotes.set(draftKey(),notice);$("parameterSummary").textContent=parameterSummary(true);message("调用文本已导入，请检查参数；点击「开始调试」后才执行。");imported=true;
      }catch(e){if(current())$("importError").textContent=e.message||String(e);}
    });
    if(imported&&id===connectionId)openParameters(false);
  }
  function closeParameters(){if($("parameterDialog").open)$("parameterDialog").close();}
  function openParameters(run) {
    if(busy||active.has(status.state)||!selected||!parameterMetadata?.supported)return;
    dialogRun=run;dialogOid=Number(selected.oid);
    $("parameterRoutine").textContent=`${selected.schema_name}.${selected.routine_name}(${selected.arguments||""})`;
    $("parameterConfirm").textContent=run?"开始调试":"保存参数";$("parameterError").textContent="";
    $("parameterImport").textContent=importNotes.get(draftKey())||"";$("parameterImport").hidden=!$("parameterImport").textContent;
    const rows=$("parameterRows");rows.replaceChildren();
    const draft=argumentDrafts.get(draftKey())||[];
    if(!parameterMetadata.parameters.length){const p=document.createElement("p");p.className="empty";p.textContent="此对象没有参数，可直接开始调试。";rows.append(p);}
    else {
      const heading=document.createElement("div");heading.className="parameter-row parameter-row-heading";
      for(const text of ["序号","名称","方向","类型","初始值","空值"]){const span=document.createElement("span");span.textContent=text;heading.append(span);}rows.append(heading);
      parameterMetadata.parameters.forEach((p,i)=>{
        const row=document.createElement("div");row.className="parameter-row";row.dataset.parameter=String(i);
        const index=document.createElement("span"),name=document.createElement("label"),mode=document.createElement("span"),type=document.createElement("span"),input=document.createElement("input"),nullLabel=document.createElement("label"),nullInput=document.createElement("input");
        const isOut=fixedNull(p);mode.textContent=p.mode||"IN";mode.className="parameter-mode code";
        index.textContent=String(p.position);name.className="parameter-name";name.textContent=p.name;name.title=p.name;name.htmlFor=`parameterValue${i}`;type.textContent=p.type;type.className="code";
        input.className="dbx-input code";input.id=`parameterValue${i}`;input.type="text";input.autocomplete="off";input.spellcheck=false;input.value=isOut?"":draft[i]?.value??"";input.placeholder=isOut?(p.cursor?"NULL · 返回游标结果集":"NULL · 执行后返回"):p.mode==="INOUT"?"输入初始值":"输入参数值";
        input.setAttribute("aria-label",`${p.name} · ${p.mode||"IN"} · ${p.type} · 初始值`);
        nullLabel.className="parameter-null";nullInput.type="checkbox";nullInput.checked=isOut||(draft[i]?.isNull??true);nullInput.disabled=isOut;nullInput.setAttribute("aria-label",`${p.name} 设为 NULL`);
        input.disabled=isOut;nullInput.addEventListener("change",()=>{if(nullInput.checked)input.value="";});
        input.addEventListener("input",()=>{if(!isOut)nullInput.checked=input.value.length===0;});nullLabel.append(nullInput,document.createTextNode("NULL"));
        row.append(index,name,mode,type,input,nullLabel);rows.append(row);
      });
    }
    $("parameterDialog").showModal();
    const first=rows.querySelector('input[type="text"]:not(:disabled)');if(first)first.focus();else $("parameterConfirm").focus();
  }
  async function saveParameters(event) {
    event.preventDefault();
    if(!selected||dialogOid!==Number(selected.oid)||busy||active.has(status.state))return;
    const draft=Array.from($("parameterRows").querySelectorAll("[data-parameter]")).map((row,i)=>({value:fixedNull(parameterMetadata.parameters[i])?"":row.querySelector('input[type="text"]').value,isNull:fixedNull(parameterMetadata.parameters[i])||row.querySelector('input[type="checkbox"]').checked}));
    argumentDrafts.set(draftKey(),draft);$("parameterSummary").textContent=parameterSummary(true);
    closeParameters();if(!dialogRun)return;
    const oid=Number(selected.oid),args=draft.map(p=>p.isNull?null:p.value);
    await action(async()=>{message("正在启动调试……");accept(await invoke("debug/start",{oid,arguments:args}));});
  }
  async function inspect() {
    const generation=status.generation,serial=++inspectSerial,id=connectionId;
    try {
      const snapshot=await invoke("debug/inspect",{generation});
      if(id!==connectionId||serial!==inspectSerial||generation!==status.generation||status.state!=="paused")return;
      breakpoints=new Set((snapshot.breakpoints||[]).map(b=>`${bpOid(b)}:${bpLine(b)}`));
      table("variables",[["名称",["name","varname"]],["类型 OID",["dtype","typeoid","type"]],["值",["value","varvalue"]]],snapshot.variables,"当前帧没有可见变量。");
      table("stack",[["帧",["callcount","level","frame"]],["对象",["targetname","name"]],["行",["linenumber","line"]]],snapshot.stack,"当前没有调用帧。");
      const oid=bpOid(status.position);
      if(oid){const data=await invoke("debug/source",{oid});if(serial!==inspectSerial||generation!==status.generation||status.state!=="paused")return;sourceOid=oid;sourceText=data.source||"";$("sourceTitle").textContent=value(status.position,["targetname","name"],"源码");$("sourceOid").textContent=`OID ${oid}`;}
      renderSource();
    } catch(e){if(generation===status.generation&&status.state==="paused")message(e.message||String(e),true);}
  }
  function accept(next) {
    if(!next||next.connectionId!==connectionId||Number(next.revision)<revision)return;
    if(Number(next.revision)===revision)return;
    revision=Number(next.revision);status=next;renderControls();renderSource();acceptResults();
    log(labels[status.state]||status.state);
    if(status.error)message(status.error,true);
    else if(status.state==="paused")message(`已停在第 ${bpLine(status.position)} 行。可单步、继续或点击行号修改断点。`);
    else if(status.state==="finished")message(resultOutputs.length?"目标执行完成。游标查询结果已显示在底部结果集区，可切换游标查看；参数返回值显示在右侧。":status.outputs?.length?"目标执行完成。OUT／INOUT 的返回值已显示在右侧变量与参数区。":"目标执行完成。数据库连接已清理，再次开始会建立新的两条连接。");
    else if(status.state==="cancelled")message("调试已停止，两条专用连接已清理。");
    else if(status.state==="waiting")message("入口断点已设置，等待专用执行连接进入目标对象。");
    if(status.state==="paused")inspect();
    else{++inspectSerial;const running=active.has(status.state),idle=status.state==="idle";table("variables",[["名称",["name"]],["方向",["mode"]],["类型",["type"]],["返回值",["value"]]],status.state==="finished"?status.outputs:[],running?"运行中；变量将在暂停后刷新。":idle?"暂停后显示变量与参数。":"本次调试已结束；再次暂停后显示变量。");table("stack",[],[],running?"运行中；调用栈将在暂停后刷新。":idle?"暂停后显示调用栈。":"本次调试已结束；再次暂停后显示调用栈。");}
  }
  async function toggleBreakpoint(line) {
    if(busy||connectionBusy||stopPending||status.state!=="paused"||!status.generation||!sourceOid)return;
    await action(async()=>{
      const method=breakpoints.has(`${sourceOid}:${line}`)?"debug/removeBreakpoint":"debug/setBreakpoint";
      const result=await invoke(method,{generation:status.generation,oid:sourceOid,line});
      if(!result.success)throw new Error("数据库拒绝此断点；请在可执行语句上选择行号。");
      await inspect();
    });
  }
  async function contextChanged(context) {
    const id=context?.debugProfileId||context?.connectionId||context?.connection?.id||"";
    if(id===connectionId)return;
    clearTimeout(searchTimer);++searchSerial;searching=false;clearSelection();clearResults();argumentDrafts.clear();importNotes.clear();$("importText").value="";$("routineSearch").value="";connectionId=id;revision=-1;status={state:"idle",generation:""};selected=null;routines=[];sourceOid=0;sourceText="";breakpoints.clear();++inspectSerial;
    $("routine").replaceChildren();$("connection").textContent=id?(context?.profile?.name||context?.connection?.name||context?.name||"金仓调试连接"):"尚未连接";renderControls();renderSource();
    if(!id){$("state").textContent="等待连接";message("点击“连接管理…”选择或新建插件内的调试连接。");return;}
    try{accept(context?.status||await invoke("debug/status"));if(id!==connectionId)return;if(!active.has(status.state)){const pf=await invoke("debug/preflight");if(id!==connectionId)return;$("schema").value=pf.user||"";await loadRoutines();}}
    catch(e){message(e.message||String(e),true);}
  }
  $("refresh").addEventListener("click",loadRoutines);$("routineSearch").addEventListener("input",scheduleSearch);$("routineSearch").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();loadRoutines();}});$("schema").addEventListener("change",loadRoutines);for(const event of ["input","change","blur"])$("routine").addEventListener(event,routineChanged);$("clear").addEventListener("click",()=>$("output").textContent="");
  $("parameters").addEventListener("click",()=>openParameters(false));$("start").addEventListener("click",()=>openParameters(true));
  $("importCall").addEventListener("click",openImport);window.KingbaseForms.bind("importForm","importConfirm",importCall);
  $("importCancel").addEventListener("click",closeImport);$("importClose").addEventListener("click",closeImport);$("importDialog").addEventListener("close",()=>{++importSerial;pendingImport=null;});
  $("importText").addEventListener("input",()=>{++importSerial;resetImportChoices();$("importError").textContent="";});
  window.KingbaseForms.bind("parameterForm","parameterConfirm",saveParameters);
  $("parameterCancel").addEventListener("click",closeParameters);$("parameterClose").addEventListener("click",closeParameters);
  $("outputTab").addEventListener("click",()=>showOutputTab(false));$("resultTab").addEventListener("click",()=>showOutputTab(true));$("resultSelect").addEventListener("change",loadResult);
  for(const method of ["stepOver","stepInto","continue"])$(method).addEventListener("click",()=>action(async()=>accept(await invoke(`debug/${method}`,{generation:status.generation}))));
  $("stop").addEventListener("click",async()=>{
    if(stopPending||$("stop").disabled)return;
    stopPending=true;renderControls();
    try{accept(await invoke("debug/stop",{generation:status.generation}));}catch(e){message(e.message||String(e),true);}
    finally{stopPending=false;renderControls();}
  });
  for(const binding of shortcuts){
    if(binding.id==="breakpoint"){
      $("source").setAttribute("aria-keyshortcuts",binding.aria);$("source").setAttribute("aria-label",`过程源码；暂停后 ${binding.label} 切换所选行断点`);
    }else{
      const button=$(binding.id),label=button.childNodes[0].textContent.trim();
      button.querySelector("kbd").textContent=binding.label;button.setAttribute("aria-keyshortcuts",binding.aria);button.title=`${label}（${binding.label}）${binding.id==="start"?"；先确认参数":""}`;
    }
  }
  $("source").addEventListener("click",selectSourceLine);$("source").addEventListener("focusin",selectSourceLine);
  document.addEventListener("keydown",debugShortcut);
  $("manageConnections").addEventListener("click",()=>connections?.open());
  window.addEventListener("pagehide",()=>{disposed=true;document.removeEventListener("keydown",debugShortcut);clearInterval(poll);clearTimeout(searchTimer);if(connections)connections.notifyClose();else if(host&&active.has(status.state)&&status.generation)host.notify("debug/stop",{connectionId,generation:status.generation});});
  async function boot(){
    if(!window.dbxPlugin){$("state").textContent="离线布局预览";renderControls();$("state").textContent="离线布局预览";return;}
    host=window.dbxPlugin;
    const context=await host.ready;
    host.workbench?.onClose(async()=>{if(connections)await connections.dispose();else if(connectionId&&active.has(status.state)&&status.generation)await invoke("debug/stop",{generation:status.generation});});
    host.onEvent(event=>{
      if(event.params?.connectionId!==connectionId)return;
      if(event.method==="debug/state")accept(event.params);
      else if(event.method==="debug/output"&&event.params.generation===status.generation)log(event.params.text);
    });
    if(context?.connectionId||context?.connection?.id){
      $("manageConnections").hidden=true;host.onContext(contextChanged);await contextChanged(context);
    }else{
      await contextChanged({});
      connections=await window.KingbaseConnections.create(host,{
        isLocked:()=>busy||active.has(status.state),
        onBusy:value=>{connectionBusy=value;renderControls();},
        onConnected:(profile,next)=>contextChanged({debugProfileId:profile.id,profile,status:next}),
        onDisconnected:()=>contextChanged({})
      });
      // Reopening the singleton toolbar tab must preserve its draft and live session.
      host.onContext(()=>{});
    }
    poll=setInterval(async()=>{if(!connectionId||!active.has(status.state))return;try{accept(await invoke("debug/status"));}catch(e){message(e.message||String(e),true);}},2000);
  }
  boot().catch(e=>message(e.message||String(e),true));
})();
