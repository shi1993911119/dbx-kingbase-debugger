"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {parse,bind,MAX_TEXT}=require("../ui/call-import.js");
const block=fs.readFileSync(path.join(__dirname,"fixtures/call-block.sql"),"utf8");
const parsed=parse(block);
assert.equal(parsed.nameParts[0].value,"demo_import_probe");assert.equal(parsed.arguments.length,32);assert.equal(parsed.diagnostics,2);
assert.deepEqual(parsed.arguments.slice(0,3).map(a=>a.value),["demo_user","DEMO","demo.reports.list"]);
assert.equal(parsed.arguments[6].value,"测试日期");assert.equal(parsed.arguments[8].value,"2000-01-31");
assert.deepEqual(parsed.arguments[9],{parameter:null,value:"",isNull:true,declaredType:"VARCHAR2 ( 1024 )"});assert.equal(parsed.arguments[29].value,"0");assert.equal(parsed.arguments[31].isNull,true);
const parameters=parsed.arguments.map((a,i)=>({name:`p${i}`,mode:i<29?"IN":i<31?"INOUT":"OUT",cursor:i===31}));
const result=bind(parsed,parameters);assert.equal(result.draft.length,32);assert.deepEqual(result.draft[31],{value:"",isNull:true});assert.ok(result.draft.slice(9,29).every(p=>p.isNull),"all 20 blank IN parameters from the synthetic fixture become NULL");
const empties=parse("DECLARE a varchar(10) := ''; b varchar(10) DEFAULT N''; c varchar(10); BEGIN c := q'[]'; f(a,b,c,'',N'',q'{}',NULL,' ',0,'0',FALSE); END;");
assert.deepEqual(empties.arguments.map(a=>a.isNull?null:a.value),[null,null,null,null,null,null,null," ","0","0","false"],"empty literal variants, declaration/assignment and direct arguments normalize; nonempty values remain exact");
const rich=parse(`/* BEGIN ; fake(a) */ DECLARE
  x VARCHAR2(30) := 'one, two; it''s (ok)';
  y BIGINT DEFAULT 9223372036854775807;
  z VARCHAR2(10); copied VARCHAR2(30);
BEGIN
  copied := x; x := q'[new; END; '' -- /* )]';
  "DemoUser"."Exact.Name"(copied, x, y, z, -1.20e+30, N'中文');
  DBMS_OUTPUT.PUT_LINE('x=' || x);
END;
/`);
assert.deepEqual(rich.nameParts,[{value:"DemoUser",quoted:true},{value:"Exact.Name",quoted:true}]);
assert.deepEqual(rich.arguments.map(a=>a.isNull?null:a.value),["one, two; it's (ok)","new; END; '' -- /* )","9223372036854775807",null,"-1.20e+30","中文"]);
assert.deepEqual(parse("CALL f('BEGIN', 'END', ',', ';', '(', ')', 'NULL', true, FALSE, +.5);").arguments.map(a=>a.value),["BEGIN","END",",",";","(",")","NULL","true","false","+.5"]);
const named=parse("BEGIN f(7, p_note => '', p_total => -20, p_result => 999); END;");
assert.deepEqual(bind(named,[{name:"p_seed",mode:"IN"},{name:"p_result",mode:"OUT"},{name:"p_total",mode:"INOUT"},{name:"p_note",mode:"IN"}]),{draft:[{value:"7",isNull:false},{value:"",isNull:true},{value:"-20",isNull:false},{value:"",isNull:true}],forcedOut:1});
assert.equal(parse("DECLARE x int; BEGIN x := foo(null); DBMS_OUTPUT.PUT_LINE(x); END;").returnsValue,true);
for(const [text,re] of [
  ["",/粘贴/],["x".repeat(MAX_TEXT+1),/256/],["CALL f('oops);",/未闭合/],["/*",/注释未闭合/],
  ["BEGIN f(1); g(2); END;",/多次/],["BEGIN f(x); END;",/未声明/],["BEGIN f(1+2); END;",/只支持/],
  ["DECLARE x int; BEGIN x := sysdate; f(x); END;",/未声明/],["DECLARE x int; BEGIN x := 1; f(x); x := 2; END;",/调用后的赋值/],
  ["BEGIN SELECT 1; f(); END;",/控制流/],["BEGIN IF true THEN f(); END IF; END;",/控制流/],
  ["BEGIN f();",/END/],["CALL f(1,);",/只支持/],["CALL f(p=>1, 2);",/位置参数/],["CALL f(p=>1,p=>2);",/重复/],
  ["DECLARE x int; x int; BEGIN f(x); END;",/重复声明/],["DECLARE x int BEGIN f(x); END;",/分号/],
  ["CALL schema.pkg.f();",/包内成员/],["BEGIN DBMS_OUTPUT.PUT_LINE(1); f(); END;",/之后/],
  ["CALL f(1); DELETE FROM t;",/控制流/],["CALL f(1); -- no hidden second statement\nCOMMIT;",/控制流/],
])assert.throws(()=>parse(text),re,text.slice(0,100));
assert.throws(()=>bind(named,[]),/签名有/);
assert.throws(()=>bind(parse("CALL f(missing=>1);"),[{name:"p"}]),/没有参数/);
assert.throws(()=>bind(parse("CALL f(1,p=>2);"),[{name:"p"},{name:"q"}]),/重复/);
assert.throws(()=>bind(parse('CALL f("P"=>1);'),[{name:"p"}]),/没有参数/);
console.log("PASS: exact 32-parameter synthetic fixture; strings/comments/quotes; literal precision, NULL/empty; named arguments, OUT coercion, strict unsupported-syntax rejection");
