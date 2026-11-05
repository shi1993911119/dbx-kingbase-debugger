"use strict";
// The pasted block is data: only literal values are imported; no SQL is executed.
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.KingbaseCallImport=api;})(typeof window==="object"?window:globalThis,()=>{
  const MAX_TEXT=262144;
  const word=t=>t?.kind==="word",ident=t=>word(t)||t?.kind==="ident";
  const is=(t,v)=>t?.kind==="word"?t.value.toUpperCase()===v:t?.kind==="symbol"&&t.value===v;
  const key=t=>t.kind==="ident"?t.value:t.value.toLowerCase();
  const name=t=>({value:t.value,quoted:t.kind==="ident"});
  function fail(text,t){throw new Error(text+(t?`（第 ${t.line} 行）`:""));}
  function tokenize(text){
    if(typeof text!=="string"||text.length>MAX_TEXT)fail("调用文本最多支持 256 Ki 字符。");
    const tokens=[];let i=0,line=1;
    function advance(end){while(i<end){if(text[i]==="\n")line++;i++;}}
    function quoted(quote,start,prefix=0){
      const startLine=line;advance(i+prefix+1);let value="",closed=false;
      while(i<text.length){if(text[i]===quote){if(text[i+1]===quote){value+=quote;advance(i+2);}else{advance(i+1);closed=true;break;}}else{value+=text[i];advance(i+1);}}
      if(!closed)fail("字符串或引用名称未闭合。",{line:startLine});
      tokens.push({kind:quote==='"'?"ident":"string",value,line:startLine,start,end:i});
    }
    while(i<text.length){
      const ch=text[i],start=i,startLine=line;
      if(/\s/.test(ch)){advance(i+1);continue;}
      if(text.startsWith("--",i)){let end=text.indexOf("\n",i+2);advance(end<0?text.length:end);continue;}
      if(text.startsWith("/*",i)){const end=text.indexOf("*/",i+2);if(end<0)fail("块注释未闭合。",{line});advance(end+2);continue;}
      if(ch==="'"||ch==='"'){quoted(ch,start);continue;}
      if(/[nN]/.test(ch)&&text[i+1]==="'"){quoted("'",start,1);continue;}
      if(/[qQ]/.test(ch)&&text[i+1]==="'"){
        const open=text[i+2],close=({"[":"]","(":")","{":"}","<":">"})[open]||open;
        if(!open||/\s/.test(open))fail("q 引用字符串分隔符无效。",{line});
        const end=text.indexOf(close+"'",i+3);if(end<0)fail("q 引用字符串未闭合。",{line});
        const value=text.slice(i+3,end);advance(end+2);tokens.push({kind:"string",value,line:startLine,start,end:i});continue;
      }
      const number=text.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if(number){advance(i+number[0].length);tokens.push({kind:"number",value:number[0],line:startLine,start,end:i});continue;}
      const id=text.slice(i).match(/^[\p{L}_][\p{L}\p{N}_$#]*/u);
      if(id){advance(i+id[0].length);tokens.push({kind:"word",value:id[0],line:startLine,start,end:i});continue;}
      const pair=text.slice(i,i+2);advance(i+([":=","=>","||"].includes(pair)?2:1));tokens.push({kind:"symbol",value:text.slice(start,i),line:startLine,start,end:i});
    }
    return tokens;
  }
  function split(tokens,separator){
    const result=[];let depth=0,start=0;
    for(let i=0;i<tokens.length;i++){
      if(is(tokens[i],"("))depth++;else if(is(tokens[i],")")){if(--depth<0)fail("括号不匹配。",tokens[i]);}
      if(depth===0&&is(tokens[i],separator)){result.push(tokens.slice(start,i));start=i+1;}
    }
    if(depth)fail("括号不匹配。",tokens[0]);result.push(tokens.slice(start));return result;
  }
  function literal(tokens,variables){
    if(tokens.length===1){
      const t=tokens[0];
      if(t.kind==="string")return{value:t.value,isNull:t.value.length===0};
      if(t.kind==="number")return{value:t.value,isNull:false};
      if(is(t,"NULL"))return{value:"",isNull:true};
      if(is(t,"TRUE")||is(t,"FALSE"))return{value:t.value.toLowerCase(),isNull:false};
      if(ident(t)){const v=variables.get(key(t));if(!v)fail(`未声明的变量：${t.value}。`,t);return{...v};}
    }
    if(tokens.length===2&&["+","-"].includes(tokens[0].value)&&tokens[1].kind==="number")return{value:tokens[0].value+tokens[1].value,isNull:false};
    fail("只支持字符串、数字、布尔值、NULL 和已声明变量；请将表达式的计算结果填入参数窗口。",tokens[0]);
  }
  function call(tokens){
    let i=0;const parts=[];
    if(is(tokens[i],"CALL"))i++;
    if(!ident(tokens[i]))return null;parts.push(name(tokens[i++]));
    while(is(tokens[i],".")){i++;if(!ident(tokens[i]))return null;parts.push(name(tokens[i++]));}
    if(!is(tokens[i],"("))return null;
    const start=++i;let depth=1;
    for(;i<tokens.length;i++){if(is(tokens[i],"("))depth++;if(is(tokens[i],")")&&--depth===0)break;}
    if(depth||i!==tokens.length-1)fail("调用必须是一条完整的过程或函数调用。",tokens[0]);
    return{parts,args:tokens.slice(start,i),token:tokens[0]};
  }
  function parse(text){
    const tokens=tokenize(text);if(!tokens.length)fail("请先粘贴调用文本。");
    if(is(tokens.at(-1),"/"))tokens.pop();
    const variables=new Map();let body=tokens,wrapped=false;
    if(is(tokens[0],"DECLARE")){
      const begin=tokens.findIndex((t,i)=>i>0&&is(t,"BEGIN"));if(begin<0)fail("DECLARE 后缺少 BEGIN。",tokens[0]);
      const decl=tokens.slice(1,begin);if(!is(decl.at(-1),";"))fail("变量声明末尾缺少分号。",decl.at(-1));
      for(const stmt of split(decl,";")){
        if(!stmt.length)continue;if(!ident(stmt[0])||!ident(stmt[1]))fail("只支持“变量名 类型”的简单变量声明。",stmt[0]);
        const k=key(stmt[0]);if(variables.has(k))fail(`变量重复声明：${stmt[0].value}。`,stmt[0]);
        const assign=stmt.findIndex(t=>is(t,":=")||is(t,"DEFAULT"));const type=stmt.slice(1,assign<0?undefined:assign);
        if(type.some(t=>!(ident(t)||t.kind==="number"||[".","(",")",",","%"].includes(t.value)))||type.some(t=>word(t)&&["CONSTANT","NOT","NULL","CURSOR","TYPE","PROCEDURE","FUNCTION"].includes(t.value.toUpperCase())))fail("暂不支持此变量声明。",stmt[0]);
        split(type,",");
        const initial=assign<0?{value:"",isNull:true}:literal(stmt.slice(assign+1),variables);
        variables.set(k,{...initial,declaredType:type.map(t=>t.value).join(" ")});
      }
      body=tokens.slice(begin);wrapped=true;
    }else if(is(tokens[0],"BEGIN"))wrapped=true;
    if(wrapped){
      if(!is(body.at(-1),";")||!is(body.at(-2),"END"))fail("调用块必须以 END; 结束。",body.at(-1));
      body=body.slice(1,-2);
    }
    if(!is(body.at(-1),";"))fail("调用语句末尾缺少分号。",body.at(-1));
    let target=null,diagnostics=0;
    for(const stmt of split(body,";")){
      if(!stmt.length)continue;
      if(word(stmt[0])&&["BEGIN","END","IF","FOR","WHILE","LOOP","SELECT","INSERT","UPDATE","DELETE","COMMIT","ROLLBACK","EXECUTE","RAISE","EXCEPTION","RETURN","NULL"].includes(stmt[0].value.toUpperCase()))fail("导入仅支持变量赋值和一次目标调用，暂不支持控制流或其他 SQL。",stmt[0]);
      const assigned=ident(stmt[0])&&is(stmt[1],":="),rhs=assigned?stmt.slice(2):stmt;
      const c=call(rhs);
      if(c){
        if(c.parts.length===2&&c.parts.every((p,i)=>!p.quoted&&p.value.toUpperCase()===["DBMS_OUTPUT","PUT_LINE"][i])){
          if(!target)fail("请将 DBMS_OUTPUT.PUT_LINE 放在目标调用之后。",stmt[0]);diagnostics++;continue;
        }
        if(target)fail("文本包含多次目标调用，请每次只导入一个过程或函数。",stmt[0]);
        if(c.parts.length>2)fail("目标名支持“过程名”或“模式名.过程名”；包内成员暂不支持。",stmt[0]);
        if(assigned&&!variables.has(key(stmt[0])))fail(`未声明的返回值变量：${stmt[0].value}。`,stmt[0]);
        let named=false;const seen=new Set();
        const args=c.args.length?split(c.args,",").map(arg=>{
          let parameter=null,expression=arg;
          if(ident(arg[0])&&is(arg[1],"=>")){parameter=name(arg[0]);expression=arg.slice(2);named=true;const k=key(arg[0]);if(seen.has(k))fail(`重复的命名参数：${arg[0].value}。`,arg[0]);seen.add(k);}
          else if(named)fail("位置参数必须放在命名参数之前。",arg[0]);
          return{parameter,...literal(expression,variables)};
        }):[];
        target={nameParts:c.parts,arguments:args,returnsValue:assigned};
      }else if(assigned){
        if(target)fail("目标调用后的赋值暂不支持，请仅保留输出打印语句。",stmt[0]);
        const k=key(stmt[0]),v=variables.get(k);if(!v)fail(`未声明的变量：${stmt[0].value}。`,stmt[0]);
        variables.set(k,{...v,...literal(rhs,variables)});
      }else fail("无法识别此语句；请粘贴 DECLARE/BEGIN 调用块或 CALL 语句。",stmt[0]);
    }
    if(!target)fail("未找到目标过程或函数调用。");
    return{...target,diagnostics};
  }
  function matches(actual,part){return part.quoted?actual===part.value:actual.toLowerCase()===part.value.toLowerCase();}
  function bind(parsed,parameters){
    if(parsed.arguments.length!==parameters.length)throw new Error(`调用有 ${parsed.arguments.length} 个参数，数据库签名有 ${parameters.length} 个；请包含全部 OUT 参数。`);
    const draft=Array(parameters.length),used=new Set();let positional=0,forcedOut=0;
    for(const arg of parsed.arguments){
      const index=arg.parameter?parameters.findIndex(p=>matches(p.name,arg.parameter)):positional++;
      if(index<0)throw new Error(`数据库签名中没有参数：${arg.parameter.value}。`);
      if(used.has(index))throw new Error(`参数重复：${parameters[index].name}。`);used.add(index);
      const out=parameters[index].mode==="OUT"||parameters[index].cursor===true;
      if(out&&!arg.isNull)forcedOut++;
      draft[index]={value:out?"":arg.value,isNull:out||arg.isNull};
    }
    return{draft,forcedOut};
  }
  return{parse,bind,matches,MAX_TEXT};
});
