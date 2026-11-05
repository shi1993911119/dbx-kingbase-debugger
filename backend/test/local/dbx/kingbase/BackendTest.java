package local.dbx.kingbase;

import com.google.gson.*;
import com.kingbase8.Driver;
import java.io.*;
import java.util.*;
import java.nio.file.*;
import java.util.function.BooleanSupplier;

/** Exercises concurrency and cleanup with a blocking JDBC double; no database access. */
public final class BackendTest {
    static int checks;
    static void check(boolean condition,String text){if(!condition)throw new AssertionError(text);checks++;}
    static void until(BooleanSupplier condition,String text)throws Exception{long end=System.currentTimeMillis()+5000;while(!condition.getAsBoolean()&&System.currentTimeMillis()<end)Thread.sleep(10);check(condition.getAsBoolean(),text+" [opened="+Driver.opened+", closed="+Driver.closed+", events="+Driver.transactionEvents+"]");}
    static JsonObject json(String value){return JsonParser.parseString(value).getAsJsonObject();}
    static JsonObject lifecycle(String jar){JsonObject p=json("{\"connection\":{\"id\":\"test\",\"database\":\"demo_db\",\"host\":\"localhost\",\"port\":54321,\"username\":\"demo_user\",\"password\":\"TEST_SECRET\",\"external_config\":{}},\"runtime\":{\"host\":\"localhost\",\"port\":54321}}");p.getAsJsonObject("connection").getAsJsonObject("external_config").addProperty("jdbc_jar",jar);return p;}
    static Main server(StringWriter out){return new Main(new PrintWriter(out,true));}
    static JsonObject params(String g){JsonObject p=json("{\"connectionId\":\"test\",\"oid\":10001,\"line\":5}");p.addProperty("generation",g);return p;}
    static Main.Session connect(Main m,String jar)throws Exception{m.dispatch("connection/connect",lifecycle(jar));return m.sessions.get("test");}
    public static void main(String[] args)throws Exception{
        String jar=args[0];
        protocol();
        profiles(jar);
        passwordProfiles(jar);
        Driver.reset();StringWriter out=new StringWriter();Main m=server(out);
        try{
            Main.Session s=connect(m,jar);
            check(s.controlPid!=s.targetPid,"distinct physical sessions");
            String search="PrObE_%'); DROP TABLE business; --";
            JsonObject lookup=json("{\"connectionId\":\"test\",\"schema\":\"demo_user\"}");lookup.addProperty("search",search);
            Map<?,?> found=(Map<?,?>)m.dispatch("debug/listRoutines",lookup);
            check(((List<?>)found.get("items")).size()==1,"search returns structured result");
            check(Driver.catalogParams.get(2).equals(search),"literal search bound separately");
            check(Driver.sqls.stream().anyMatch(sql->sql.contains("lower(p.proname)")&&sql.contains("position(lower(CAST(? AS text))")),"case-insensitive contains query uses a literal predicate");
            check(Driver.sqls.stream().noneMatch(sql->sql.contains("DROP TABLE")),"search never interpolated into SQL");
            Driver.catalogRows=501;found=s.searchRoutines("demo_user","");
            check(((List<?>)found.get("items")).size()==500&&Boolean.TRUE.equals(found.get("truncated")),"catalog page overflow explicitly flagged");
            check(Driver.catalogParams.size()==1,"empty Oracle-compatible search omits empty string predicate");Driver.catalogRows=1;
            Map<?,?> metadata=(Map<?,?>)m.dispatch("debug/parameters",params(""));
            Map<?,?> parameter=(Map<?,?>)((List<?>)metadata.get("parameters")).get(0);
            check(parameter.get("name").equals("p_seed")&&parameter.get("type").equals("integer")&&parameter.get("position").equals(1),"parameter name type and order from catalog");
            Driver.parameterName="name,with\"quotes";metadata=s.parameters(10001);
            check(((Map<?,?>)((List<?>)metadata.get("parameters")).get(0)).get("name").equals(Driver.parameterName),"parameter name preserves punctuation without signature parsing");
            Driver.parameterName=null;metadata=s.parameters(10001);
            check(((Map<?,?>)((List<?>)metadata.get("parameters")).get(0)).get("name").equals("$1"),"unnamed parameter has positional label");
            Driver.argumentModes="{t}";metadata=s.parameters(10001);check(Boolean.FALSE.equals(metadata.get("supported")),"TABLE parameters explicitly rejected before execution");
            Driver.argumentModes=null;Driver.inputOids="";metadata=s.parameters(10001);check(((List<?>)metadata.get("parameters")).isEmpty(),"zero argument metadata");
            Driver.inputOids="23";Driver.parameterName="p_seed";
            Map<?,?> src=(Map<?,?>)s.source(10001);check(((String)src.get("source")).startsWith("\n"),"source leading blank line preserved");
            JsonObject start=json("{\"connectionId\":\"test\",\"oid\":10001,\"arguments\":[\"7'); DROP TABLE business; --\"]}");
            m.dispatch("debug/start",start);until(()->s.state.equals("paused"),"start reaches paused concurrently");
            check(Driver.calls.get()==1,"one target execution only");
            check(Driver.boundArgument.equals("7'); DROP TABLE business; --"),"argument bound separately");
            check(Driver.sqls.stream().noneMatch(sql->sql.contains("DROP TABLE")),"argument never interpolated into SQL");
            check(Driver.sqls.stream().anyMatch(sql->sql.contains("CAST(? AS \"pg_catalog\".\"int4\")")),"parameter type derived from quoted catalog identifiers");
            check(Driver.settings.size()==2&&Driver.settings.stream().allMatch(v->v.startsWith("2:")),"timeouts applied only to target connection");
            String g=s.generation;
            Map<?,?> inspect=(Map<?,?>)m.dispatch("debug/inspect",params(g));check(((List<?>)inspect.get("variables")).size()==1,"inspect variables");
            check(((Map<?,?>)((List<?>)inspect.get("stack")).get(0)).get("frame").equals(0),"stack depth normalized from documented tuple order");
            try{m.dispatch("debug/stepOver",params("expired"));throw new AssertionError("stale generation accepted");}catch(Main.Failure e){check(e.code==-32022,"stale generation rejected");}
            m.dispatch("debug/setBreakpoint",params(g));m.dispatch("debug/removeBreakpoint",params(g));
            m.dispatch("debug/stepOver",params(g));until(()->s.state.equals("paused"),"step returns to paused");
            m.dispatch("debug/continue",params(g));until(()->s.state.equals("finished"),"target completion wins when controller stays blocked");
            until(()->Driver.closed.get()==2,"both physical connections closed on completion");
            m.dispatch("debug/start",start);until(()->s.state.equals("paused")||s.terminal(),"second run started");
            // First run's completed latch means the second target may finish immediately; it must never use old PIDs.
            check(Driver.opened.get()==4,"new generation establishes two fresh sessions");
            until(()->Driver.closed.get()==4,"second generation cleaned before shutdown");
            check(!out.toString().contains("TEST_SECRET"),"secret excluded from output");
        }finally{m.close();}
        for(boolean failTarget:new boolean[]{false,true}){
            Driver.reset();m=server(new StringWriter());
            try{Main.Session s=connect(m,jar);Driver.failTarget=failTarget;m.dispatch("debug/start",json("{\"connectionId\":\"test\",\"oid\":10001,\"arguments\":[7]}"));
                if(failTarget){until(()->s.state.equals("error"),"target exception reaches error");}
                else{until(()->s.state.equals("paused"),"target paused for cancellation");m.dispatch("debug/stop",params(s.generation));until(()->s.state.equals("cancelled"),"paused target stopped");}
                until(()->Driver.closed.get()==2,"cancel/error cleans both sessions");
                if(!failTarget){check(!s.listRoutines("demo_user").isEmpty(),"routine reload after stop succeeds");check(Driver.opened.get()==4,"routine reload creates fresh connections after stop");}
            }finally{m.close();}
        }
        Driver.reset();m=server(new StringWriter());
        try{Main.Session s=connect(m,jar);Driver.failArming=true;
            try{m.dispatch("debug/start",json("{\"connectionId\":\"test\",\"oid\":10001,\"arguments\":[7]}"));throw new AssertionError("arming error hidden");}catch(Exception expected){check(s.state.equals("error"),"arming failure reaches error");}
            check(Driver.calls.get()==0,"target never executes after arming failure");until(()->Driver.closed.get()==2,"arming failure cleans both sessions");
        }finally{m.close();}
        modes(jar);
        cursors(jar);
        System.out.println("PASS: "+checks+" backend assertions");
    }
    static void modes(String jar) throws Exception {
        for (boolean function : new boolean[]{false, true}) {
            Driver.reset();Main m=server(new StringWriter());
            try {
                Main.Session s=connect(m,jar);
                Driver.inputOids="23 23";Driver.allOids="{23,23,23,1043}";Driver.argumentModes="{o,i,b,o}";
                Driver.parameterNames=Arrays.asList("p_result","p_seed","p_total","p_note");Driver.kind=function?"f":"p";
                Map<?,?> metadata=s.parameters(10001);List<?> ps=(List<?>)metadata.get("parameters");
                check(Boolean.TRUE.equals(metadata.get("supported"))&&ps.size()==4,"all argument OIDs include OUT parameters");
                check(((Map<?,?>)ps.get(0)).get("mode").equals("OUT")&&((Map<?,?>)ps.get(1)).get("mode").equals("IN")&&((Map<?,?>)ps.get(2)).get("mode").equals("INOUT"),"mixed directions follow declaration order");
                check(((Map<?,?>)ps.get(3)).get("name").equals("p_note")&&((Map<?,?>)ps.get(3)).get("type").equals("varchar"),"OUT name and type retain ordinal position");
                int offset=function?1:0;
                Driver.outputValues.put(1+offset,"14");Driver.outputValues.put(3+offset,"9223372036854775807");Driver.outputValues.put(4+offset,null);
                if(function)Driver.outputValues.put(1,"21");
                s.start(10001,JsonParser.parseString("[null,\"7\",\"9223372036854775800\",null]").getAsJsonArray());until(()->s.state.equals("paused"),"mixed parameter target reaches entry breakpoint");
                check(!Driver.boundParams.containsKey(1+offset)&&!Driver.boundParams.containsKey(4+offset),"pure OUT defaults to NULL without input binding");
                check(Driver.boundParams.get(2+offset).equals("7")&&Driver.boundParams.get(3+offset).equals("9223372036854775800"),"IN and INOUT initial text preserves ordinal order and precision");
                check(Driver.registered.get(1+offset)==java.sql.Types.INTEGER&&Driver.registered.get(3+offset)==java.sql.Types.INTEGER&&Driver.registered.get(4+offset)==java.sql.Types.VARCHAR&&!Driver.registered.containsKey(2+offset),"only OUT and INOUT registered with JDBC types");
                check(Driver.sqls.stream().anyMatch(sql->sql.contains(function?"{? = call \"demo_user\".\"probe\"(?,?,?,?)}":"{call \"demo_user\".\"probe\"(?,?,?,?)}")),"callable SQL uses declaration order and function return offset");
                s.move("continue",s.generation);until(()->s.state.equals("finished"),"mixed parameter target completes");
                List<?> result=(List<?>)s.status().get("outputs");
                check(result.size()==(function?4:3),"only outputs and optional function return retained");
                check(((Map<?,?>)result.get(offset)).get("value").equals("14")&&((Map<?,?>)result.get(1+offset)).get("value").equals("9223372036854775807")&&((Map<?,?>)result.get(2+offset)).containsKey("value")&&((Map<?,?>)result.get(2+offset)).get("value")==null,"returned values preserve large numeric text and SQL NULL");
                if(function)check(((Map<?,?>)result.get(0)).get("mode").equals("RETURN")&&((Map<?,?>)result.get(0)).get("value").equals("21"),"function scalar return displayed separately");
                until(()->Driver.closed.get()==2,"mixed output cleanup closes both sessions");
            } finally { m.close(); }
        }
        Driver.reset();Main m=server(new StringWriter());
        try {
            Main.Session s=connect(m,jar);Driver.inputOids="23";Driver.allOids="{23}";Driver.argumentModes="{b}";
            s.start(10001,JsonParser.parseString("[null]").getAsJsonArray());until(()->s.state.equals("paused"),"NULL INOUT pauses");
            check(Driver.boundParams.containsKey(1)&&Driver.boundParams.get(1)==null&&Driver.registered.containsKey(1),"NULL INOUT binds input NULL and registers output");
            s.stop(s.generation);until(()->s.state.equals("cancelled"),"mixed argument cancellation preserved");
            check(s.outputs.isEmpty(),"cancelled run has no success outputs");
        } finally { m.close(); }
        Driver.reset();m=server(new StringWriter());
        try {
            Main.Session s=connect(m,jar);Driver.inputOids="";Driver.allOids="{23}";Driver.argumentModes="{o}";
            try { s.start(10001,JsonParser.parseString("[\"ignored\"]").getAsJsonArray());throw new AssertionError("OUT value accepted"); }
            catch(Main.Failure e){check(e.code==-32602&&Driver.calls.get()==0,"non-null OUT rejected before target invocation");}
        } finally { m.close(); }
    }
    static void profiles(String jar)throws Exception {
        Path directory=Files.createTempDirectory("dbx-profile-test-");
        Main m=new Main(new PrintWriter(new StringWriter(),true),directory.toString());
        try {
            Driver.reset();
            JsonObject profile=json("{\"name\":\"测试连接\",\"host\":\"localhost\",\"port\":54321,\"database\":\"demo_db\",\"username\":\"demo_user\",\"timeout\":30,\"password\":\"MUST_NOT_PERSIST\",\"unexpected\":\"drop\"}");profile.addProperty("jdbcJar",jar);
            JsonObject save=new JsonObject();save.add("profile",profile);
            JsonObject saved=(JsonObject)m.dispatch("profiles/save",save);String id=saved.get("id").getAsString();
            check(id.startsWith("private-")&&!saved.has("password")&&!saved.has("unexpected"),"private profile IDs and persistence allowlist");
            String stored=Files.readString(directory.resolve("debugger-connections.json"));
            check(!stored.contains("MUST_NOT_PERSIST")&&!stored.contains("password")&&!stored.contains("unexpected"),"credentials and arbitrary fields never written");
            check(new Main.Profiles(directory.toString()).list().size()==1,"profiles survive backend restart");
            JsonObject request=new JsonObject();request.add("profile",saved);request.addProperty("password","LOCAL_ONLY");
            m.dispatch("profiles/test",request);
            check(m.sessions.isEmpty()&&Driver.opened.get()==2,"testing creates no persistent session");
            until(()->Driver.closed.get()==2,"test closes both physical sessions");
            request.addProperty("id",id);request.addProperty("requestToken","test-connect-one");
            m.dispatch("profiles/connect",request);Main.Session first=m.sessions.get(id);
            int opened=Driver.opened.get();m.dispatch("profiles/connect",request);
            check(m.sessions.get(id)==first&&Driver.opened.get()==opened,"repeated private connect retains live session");
            save.add("profile",saved);
            try{m.dispatch("profiles/save",save);throw new AssertionError("edited connected profile");}catch(Main.Failure e){check(e.code==-32021,"connected config cannot change under live session");}
            try{m.dispatch("profiles/delete",request);throw new AssertionError("deleted connected profile");}catch(Main.Failure e){check(e.code==-32021,"connected profile cannot be deleted");}
            JsonObject other=profile.deepCopy();other.addProperty("name","第二连接");save.add("profile",other);
            JsonObject second=(JsonObject)m.dispatch("profiles/save",save);JsonObject switchRequest=json("{\"password\":\"SECOND_SECRET\",\"requestToken\":\"switch-two\"}");switchRequest.addProperty("id",second.get("id").getAsString());
            first.state="paused";
            try{m.dispatch("profiles/connect",switchRequest);throw new AssertionError("switched active session");}catch(Main.Failure e){check(e.code==-32021&&m.sessions.get(id)==first,"switch cannot interrupt active debugger");}
            first.state="idle";JsonObject invalid=profile.deepCopy();invalid.addProperty("jdbcJar","/missing.jar");save.add("profile",invalid);JsonObject bad=(JsonObject)m.dispatch("profiles/save",save);
            JsonObject badConnect=json("{\"requestToken\":\"failed-switch\"}");badConnect.addProperty("id",bad.get("id").getAsString());
            try{m.dispatch("profiles/connect",badConnect);throw new AssertionError("accepted missing driver");}catch(Main.Failure e){check(m.sessions.get(id)==first&&!first.closed,"failed switch preserves previous connection");}
            m.dispatch("profiles/connect",switchRequest);
            check(first.closed&&m.sessions.size()==1&&m.sessions.containsKey(second.get("id").getAsString()),"successful switch cleans old session");
            m.dispatch("profiles/disconnect",switchRequest);check(m.sessions.isEmpty(),"explicit disconnect closes private session");
            switchRequest.addProperty("requestToken","cancel-before-connect");m.dispatch("profiles/disconnect",switchRequest);
            try{m.dispatch("profiles/connect",switchRequest);throw new AssertionError("connected after page closed");}catch(Main.Failure e){check(e.code==-32022&&m.sessions.isEmpty(),"page-close cancellation survives request reordering");}
            m.dispatch("profiles/delete",switchRequest);check(m.profiles.list().size()==2,"deleting private profile affects only selected config");
            check(Driver.calls.get()==0,"connection management never invokes stored procedures");
            JsonObject outside=json("{\"id\":\"../host-connection\"}");
            try{m.dispatch("profiles/delete",outside);throw new AssertionError("accepted host id");}catch(Main.Failure e){check(e.code==-32602,"private APIs reject host connection IDs");}
            Files.writeString(directory.resolve("debugger-connections.json"),"broken");
            try{m.profiles.save(profile);throw new AssertionError("overwrote corrupt config");}catch(Main.Failure e){check(Files.readString(directory.resolve("debugger-connections.json")).equals("broken"),"invalid configuration is retained, never overwritten");}
        } finally {m.close();try(java.util.stream.Stream<Path> files=Files.walk(directory)){files.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException e){throw new UncheckedIOException(e);}});}}
    }
    static final class MemoryVault implements PasswordVault {
        final Map<String,String> data = new HashMap<>();boolean denied;
        public boolean available(){return true;}
        void allow(){if(denied)throw new Main.Failure(-32024,"synthetic keychain denial");}
        public boolean has(JsonObject p){allow();return data.containsKey(Credentials.account(p));}
        public String get(JsonObject p){allow();if(!has(p))throw new Main.Failure(-32024,"missing");return data.get(Credentials.account(p));}
        public void put(JsonObject p,String secret){allow();data.put(Credentials.account(p),secret);}
        public void remove(JsonObject p){allow();data.remove(Credentials.account(p));}
    }
    static void passwordProfiles(String jar)throws Exception {
        Path directory=Files.createTempDirectory("dbx-password-test-");MemoryVault vault=new MemoryVault();StringWriter output=new StringWriter();
        Main m=new Main(new PrintWriter(output,true),directory.toString(),vault);
        try {
            Driver.reset();JsonObject p=json("{\"name\":\"secret test\",\"host\":\"localhost\",\"port\":54321,\"database\":\"demo_db\",\"username\":\"demo_user\",\"timeout\":30}");p.addProperty("jdbcJar",jar);
            JsonObject request=new JsonObject();request.add("profile",p);request.addProperty("passwordAction","store");request.addProperty("password","SAVED_SECRET_中文'\n");
            JsonObject saved=(JsonObject)m.dispatch("profiles/save",request);String id=Main.Profiles.id(saved);
            check(vault.has(saved),"explicit password save uses vault");
            check(!Files.readString(directory.resolve("debugger-connections.json")).contains("SECRET")&&!saved.has("password"),"saved credential never enters JSON profile or response");
            Map<?,?> listed=(Map<?,?>)m.dispatch("profiles/list",new JsonObject());
            check(Boolean.TRUE.equals(listed.get("passwordStorageAvailable"))&&((JsonObject)((List<?>)listed.get("items")).get(0)).get("passwordSaved").getAsBoolean(),"list returns availability and presence only");
            check(!Main.JSON.toJson(listed).contains("SAVED_SECRET"),"list never hydrates saved secret into UI");
            JsonObject test=new JsonObject();test.add("profile",saved);test.addProperty("useSavedPassword",true);
            m.dispatch("profiles/test",test);check(Driver.connectionPassword.equals("SAVED_SECRET_中文'\n"),"test uses saved secret without UI round trip");
            check(vault.data.size()==1&&m.sessions.isEmpty(),"testing keeps stored password and closes temporary session");
            JsonObject connect=json("{\"useSavedPassword\":true,\"rememberPassword\":true,\"requestToken\":\"saved-one\"}");connect.addProperty("id",id);
            m.dispatch("profiles/connect",connect);check(m.sessions.containsKey(id)&&Driver.connectionPassword.equals("SAVED_SECRET_中文'\n"),"connect reads vault secret internally");
            m.dispatch("profiles/disconnect",connect);check(vault.has(saved),"disconnect clears session without deleting saved credential");
            m.close();m=new Main(new PrintWriter(output,true),directory.toString(),vault);
            connect.addProperty("requestToken","saved-after-restart");m.dispatch("profiles/connect",connect);check(Driver.connectionPassword.equals("SAVED_SECRET_中文'\n"),"saved credential survives a new backend instance");m.dispatch("profiles/disconnect",connect);
            JsonObject changed=saved.deepCopy();changed.addProperty("username","different-user");test.add("profile",changed);
            try{m.dispatch("profiles/test",test);throw new AssertionError("reused secret at changed identity");}catch(Main.Failure e){check(e.code==-32024,"changed username cannot use previous saved secret");}
            request.add("profile",saved);request.addProperty("password","NEW_SECRET");m.dispatch("profiles/save",request);check(vault.get(saved).equals("NEW_SECRET"),"explicit save replaces saved credential");
            connect.remove("useSavedPassword");connect.addProperty("password","BAD_SECRET");connect.addProperty("requestToken","failed-before-store");
            JsonObject invalid=saved.deepCopy();invalid.addProperty("jdbcJar","/missing.jar");JsonObject update=new JsonObject();update.add("profile",invalid);m.dispatch("profiles/save",update);
            try{m.dispatch("profiles/connect",connect);throw new AssertionError("accepted invalid driver");}catch(Main.Failure e){check(vault.get(saved).equals("NEW_SECRET"),"failed connection never overwrites saved password");}
            update.add("profile",saved);m.dispatch("profiles/save",update);vault.denied=true;
            listed=(Map<?,?>)m.dispatch("profiles/list",new JsonObject());check(((JsonObject)((List<?>)listed.get("items")).get(0)).get("passwordStatusUnknown").getAsBoolean(),"keychain denial does not hide connection profiles");
            connect.addProperty("requestToken","denied-before-publish");
            try{m.dispatch("profiles/connect",connect);throw new AssertionError("ignored vault failure");}catch(Main.Failure e){check(e.code==-32024&&m.sessions.isEmpty(),"failed save closes candidate physical connections");}
            vault.denied=false;
            update.addProperty("passwordAction","remove");m.dispatch("profiles/save",update);check(!vault.has(saved),"unchecking and saving deletes credential");
            connect.addProperty("requestToken","store-after-connect");connect.addProperty("password","CONNECTED_SECRET");m.dispatch("profiles/connect",connect);check(vault.get(saved).equals("CONNECTED_SECRET"),"successful connect remembers provided password");m.dispatch("profiles/disconnect",connect);
            changed=saved.deepCopy();changed.addProperty("username","different-user");update.add("profile",changed);update.remove("passwordAction");m.dispatch("profiles/save",update);check(!vault.has(saved)&&!vault.has(changed),"editing credential identity removes previous endpoint entry");
            JsonObject renamed=changed.deepCopy();renamed.addProperty("name","renamed");check(Credentials.account(changed).equals(Credentials.account(renamed)),"renaming keeps credential identity");
            update.add("profile",saved);update.addProperty("passwordAction","store");update.addProperty("password","DELETE_SECRET");m.dispatch("profiles/save",update);m.dispatch("profiles/delete",connect);check(vault.data.isEmpty(),"deleting a profile deletes only its credential");
            check(Driver.calls.get()==0&&!output.toString().contains("SECRET"),"password management never executes target or emits secret");
        } finally {m.close();try(java.util.stream.Stream<Path> files=Files.walk(directory)){files.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException e){throw new UncheckedIOException(e);}});}}
    }
    static void protocol()throws Exception{
        StringWriter out=new StringWriter();Main m=server(out);
        try{m.receive("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"plugin/initialize\",\"params\":{\"host\":{\"protocolVersions\":[1]}}}");
            JsonObject init=json(out.toString().trim());check(init.getAsJsonObject("result").get("protocolVersion").getAsInt()==1,"protocol negotiation");check(init.getAsJsonObject("result").getAsJsonObject("plugin").get("id").getAsString().equals(Main.ID),"identity matches manifest");
            out.getBuffer().setLength(0);m.receive("{");check(json(out.toString().trim()).getAsJsonObject("error").get("code").getAsInt()==-32700,"malformed JSON error");
        }finally{m.close();}
    }
    static void cursorParameters() {
        Driver.inputOids="";Driver.allOids="{10006,1790,1790}";Driver.argumentModes="{o,o,o}";
        Driver.parameterNames=Arrays.asList("output_cursor","empty_cursor","null_cursor");
    }
    static void cursors(String jar)throws Exception{
        Driver.reset();Main m=server(new StringWriter());
        try{
            Main.Session s=connect(m,jar);cursorParameters();
            Map<?,?> metadata=s.parameters(10001);List<?> ps=(List<?>)metadata.get("parameters");
            check(Boolean.TRUE.equals(metadata.get("supported"))&&Boolean.TRUE.equals(((Map<?,?>)ps.get(0)).get("cursor")),"package domain resolves to refcursor through base OID");
            check(((Map<?,?>)ps.get(0)).get("type").equals("\"demo_user\".\"demo_cursor.t_cursor\""),"cursor display preserves package type");
            Driver.cursorValues.put(1,Driver.cursor(new String[]{"Same","Same","same","value"},new String[]{"int4","int4","text","int8"},new String[][]{{"1","2",null,"9223372036854775807"},{"3","4","<img src=x>","7"}}));
            Driver.cursorValues.put(2,Driver.cursor(new String[]{"EmptyColumn"},new String[]{"int4"},new String[0][]));
            s.start(10001,JsonParser.parseString("[null,null,null]").getAsJsonArray());until(()->s.state.equals("paused"),"cursor target pauses");
            check(Driver.registered.size()==3&&Driver.registered.values().stream().allMatch(v->v==java.sql.Types.REF_CURSOR),"cursor output registered by builtin JDBC REF_CURSOR");
            check(Driver.boundParams.isEmpty(),"OUT cursors only register output without binding any input");
            try{s.result(s.generation,0);throw new AssertionError("unfinished cursor result exposed");}catch(Main.Failure e){check(e.code==-32602,"results withheld until successful completion");}
            s.move("continue",s.generation);until(()->s.state.equals("finished"),"cursor result finishes");
            Map<?,?> first=(Map<?,?>)((Map<?,?>)s.result(s.generation,0)).get("result");
            List<?> columns=(List<?>)first.get("columns"),rows=(List<?>)first.get("rows");
            check(columns.size()==4&&((Map<?,?>)columns.get(0)).get("name").equals("Same")&&((Map<?,?>)columns.get(1)).get("name").equals("Same")&&((Map<?,?>)columns.get(2)).get("name").equals("same"),"duplicate and case-sensitive labels remain in ordinal order");
            check(((List<?>)rows.get(0)).get(2)==null&&((List<?>)rows.get(0)).get(3).equals("9223372036854775807"),"cursor NULL and bigint text preserved");
            Map<?,?> empty=(Map<?,?>)((Map<?,?>)s.result(s.generation,1)).get("result");
            check(((List<?>)empty.get("rows")).isEmpty()&&((List<?>)empty.get("columns")).size()==1,"empty cursor retains columns");
            check(s.outputs.size()==3&&s.outputs.get(2).containsKey("value")&&s.outputs.get(2).get("value")==null&&!s.outputs.get(2).containsKey("resultId"),"NULL cursor distinct from empty result");
            check(!Main.JSON.toJson(s.status()).contains("<img"),"status does not repeatedly carry cursor rows");
            until(()->Driver.closed.get()==2,"cursor completion closes both sessions");
            check(Collections.frequency(Driver.transactionEvents,"cursor:close")==2&&Driver.transactionEvents.indexOf("2:commit")>Driver.transactionEvents.lastIndexOf("cursor:close"),"all result sets close before commit");
            check(Driver.transactionEvents.contains("2:auto:false")&&Driver.transactionEvents.indexOf("2:commit")<Driver.transactionEvents.indexOf("2:close"),"target transaction remains open until rows materialized");
            try{s.result("expired",0);throw new AssertionError("stale cursor result exposed");}catch(Main.Failure e){check(e.code==-32022,"stale result generation rejected");}
        }finally{m.close();}
        for(String returnType:new String[]{"refcursor","demo_cursor.t_cursor"}){
            Driver.reset();m=server(new StringWriter());
            try{Main.Session s=connect(m,jar);Driver.kind="f";Driver.returnType=returnType;Driver.inputOids="";
                Driver.cursorValues.put(1,Driver.cursor(new String[]{"status"},new String[]{"text"},new String[][]{{"return-ok"}}));
                s.start(10001,new JsonArray());until(()->s.state.equals("paused"),"cursor function with no arguments pauses");
                check(Driver.sqls.stream().anyMatch(v->v.contains("{? = call"))&&Driver.registered.get(1)==java.sql.Types.REF_CURSOR,"cursor RETURN uses callable offset even without OUT parameters");
                s.move("continue",s.generation);until(()->s.state.equals("finished"),"cursor RETURN completes");check(s.outputs.get(0).get("mode").equals("RETURN")&&s.resultSets.size()==1,"cursor RETURN exposed as result");
            }finally{m.close();}
        }
        for(boolean fail:new boolean[]{false,true}){
            Driver.reset();m=server(new StringWriter());
            try{Main.Session s=connect(m,jar);cursorParameters();Driver.cursorValues.put(1,Driver.cursor(new String[]{"x"},new String[]{"text"},new String[][]{{"x"}}));
                s.start(10001,JsonParser.parseString("[null,null,null]").getAsJsonArray());until(()->s.state.equals("paused"),"cursor failure/cancel starts paused");
                if(fail){Driver.cursorReadFails=true;s.move("continue",s.generation);until(()->s.state.equals("error"),"cursor read exception fails run");until(()->Driver.transactionEvents.contains("2:rollback"),"cursor read error rolls back target transaction");check(Driver.transactionEvents.contains("cursor:close"),"read error still closes cursor");}
                else{s.stop(s.generation);until(()->s.state.equals("cancelled"),"cursor target cancelled");}
                until(()->Driver.closed.get()==2,"cursor failure/cancel cleans both sessions");check(!Driver.transactionEvents.contains("2:commit")&&s.outputs.isEmpty()&&s.resultSets.isEmpty(),"failed/cancelled cursor never committed or published");
            }finally{m.close();}
        }
        Driver.reset();m=server(new StringWriter());try{Main.Session s=connect(m,jar);Driver.inputOids="1790";Driver.argumentModes="{i}";check(Boolean.FALSE.equals(s.parameters(10001).get("supported")),"input cursor explicitly unsupported");cursorParameters();try{s.start(10001,JsonParser.parseString("[null,null,\"other-session-cursor\"]").getAsJsonArray());throw new AssertionError("non-null cursor input accepted");}catch(Main.Failure e){check(e.code==-32602&&Driver.calls.get()==0,"non-null OUT cursor rejected before target call");}}finally{m.close();}
        String[][] many=new String[2001][1];for(String[] row:many)row[0]="value";
        Map<?,?> limited=Main.readCursor(Driver.cursor(new String[]{"x"},new String[]{"text"},many),new Main.ResultBudget());check(limited.get("rowCount").equals(2000)&&Boolean.TRUE.equals(limited.get("truncated")),"cursor row cap explicitly flagged");
        String[] exact=new String[2000];Arrays.fill(exact,"v");String[][] exactRows=Arrays.stream(exact).map(v->new String[]{v}).toArray(String[][]::new);
        check(Boolean.FALSE.equals(Main.readCursor(Driver.cursor(new String[]{"x"},new String[]{"text"},exactRows),new Main.ResultBudget()).get("truncated")),"exactly row cap does not falsely report truncation");
        String oversized=String.join("",Collections.nCopies(Main.RESULT_CHARACTERS+1,"x"));limited=Main.readCursor(Driver.cursor(new String[]{"x"},new String[]{"text"},new String[][]{{oversized}}),new Main.ResultBudget());check(limited.get("rowCount").equals(0)&&Boolean.TRUE.equals(limited.get("truncated")),"oversized row truncated atomically");
        String[] tooManyColumns=new String[257];try{Main.readCursor(Driver.cursor(tooManyColumns,tooManyColumns,new String[0][]),new Main.ResultBudget());throw new AssertionError("column cap not applied");}catch(Main.Failure e){check(e.code==-32020,"column limit enforced");}
        Driver.reset();m=server(new StringWriter());try{Main.Session s=connect(m,jar);cursorParameters();Driver.failOutputRegistration=true;
            s.start(10001,JsonParser.parseString("[null,null,null]").getAsJsonArray());until(()->s.state.equals("error"),"output registration failure ends run");
            until(()->Driver.closed.get()==2,"registration failure closes both connections");
            check(Driver.calls.get()==0&&Driver.sqls.stream().noneMatch(v->v.contains("wait_for_target")),"JDBC binding errors never start a waiting controller");
        }finally{m.close();}
    }
}
