package local.dbx.kingbase;

import com.google.gson.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** DBX Sidecar Protocol v1. stdout contains JSON-RPC only. Requires Java 11+. */
public final class Main {
    public static final String ID = "local.kingbase.debugger", VERSION = "0.9.2";
    static final Gson JSON = new GsonBuilder().serializeNulls().disableHtmlEscaping().create();
    static final int MAX_JSON = 8 * 1024 * 1024;
    final Map<String, Session> sessions = new ConcurrentHashMap<>();
    final Set<String> cancelledPrivateConnects = ConcurrentHashMap.newKeySet();
    final ExecutorService requests = Executors.newFixedThreadPool(4, daemon("rpc"));
    final ExecutorService cancellation = Executors.newCachedThreadPool(daemon("cancel"));
    final ScheduledExecutorService deadlines = Executors.newScheduledThreadPool(1, daemon("deadline"));
    final PrintWriter output;
    final Profiles profiles;
    final PasswordVault passwords;
    volatile boolean initialized;

    Main(PrintWriter output) { this(output, System.getenv("DBX_PLUGIN_DATA_DIR")); }
    Main(PrintWriter output, String dataDir) { this(output,dataDir,new Credentials()); }
    Main(PrintWriter output, String dataDir, PasswordVault passwords) { this.output = output; this.profiles = new Profiles(dataDir); this.passwords = passwords; }
    public static void main(String[] args) throws Exception {
        Main server = new Main(new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true));
        Runtime.getRuntime().addShutdownHook(new Thread(server::close));
        try (Reader input = new InputStreamReader(System.in, StandardCharsets.UTF_8)) { server.serve(input); }
        finally { server.close(); }
    }

    void serve(Reader input) throws IOException {
        BufferedReader reader = new BufferedReader(input);
        StringBuilder line = new StringBuilder();
        int ch;
        while ((ch = reader.read()) != -1) {
            if (ch == '\n') {
                if (line.length() > 0) receive(line.toString());
                line.setLength(0);
            } else {
                line.append((char) ch);
                if (line.length() > MAX_JSON) throw new IOException("JSON-RPC frame too large");
            }
        }
        if (line.length() > 0) receive(line.toString());
    }

    void receive(String line) {
        JsonObject request;
        try {
            JsonElement value = JsonParser.parseString(line);
            if (!value.isJsonObject()) throw new Failure(-32600, "Invalid request");
            request = value.getAsJsonObject();
            if (!"2.0".equals(str(request, "jsonrpc", "")) || !str(request, "method", "").matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}"))
                throw new Failure(-32600, "Invalid JSON-RPC request");
        } catch (Exception e) { response(JsonNull.INSTANCE, null, new Failure(-32700, "Invalid JSON-RPC input")); return; }
        JsonElement requestId = request.get("id");
        String method = str(request, "method", "");
        JsonObject params = object(request, "params");
        Runnable task = () -> {
            try {
                Object result;
                if (method.equals("plugin/initialize")) {
                    boolean compatible = false;
                    JsonArray versions = array(object(params, "host"), "protocolVersions");
                    for (JsonElement version : versions) if (version.getAsInt() == 1) compatible = true;
                    if (!compatible) throw new Failure(-32001, "No shared sidecar protocol version");
                    initialized = true;
                    result = map("protocolVersion", 1, "capabilities", Arrays.asList("connections", "kingbase.debug.v1"), "plugin", map("id", ID, "version", VERSION));
                } else {
                    if (!initialized) throw new Failure(-32001, "Initialize the sidecar first");
                    result = dispatch(method, params);
                }
                if (requestId != null) response(requestId, result, null);
            } catch (Throwable e) {
                if (requestId != null) response(requestId, null, failure(e));
            }
        };
        if (method.equals("plugin/initialize")) task.run(); else requests.execute(task);
    }

    Object dispatch(String method, JsonObject p) throws Exception {
        switch (method) {
            case "profiles/list": {
                synchronized (sessions) {
                    List<JsonObject> items = profiles.list();
                    for (JsonObject item : items) {
                        item.addProperty("connected", sessions.containsKey(str(item,"id","")));
                        try { item.addProperty("passwordSaved",passwords.has(item)); }
                        catch(Failure e) { item.addProperty("passwordSaved",false);item.addProperty("passwordStatusUnknown",true); }
                    }
                    return map("items", items,"passwordStorageAvailable",passwords.available(),"passwordStorageLabel",passwords.label());
                }
            }
            case "profiles/save": {
                synchronized (sessions) {
                    JsonObject profile = Profiles.normalize(object(p,"profile"),false);
                    if (sessions.containsKey(str(profile,"id",""))) throw new Failure(-32021,"请先断开此调试连接，再编辑配置");
                    JsonObject previous = profiles.list().stream().filter(row -> Profiles.id(row).equals(Profiles.id(profile))).findFirst().orElse(null);
                    String action = str(p,"passwordAction","keep");
                    if(!Arrays.asList("keep","store","remove").contains(action))throw new Failure(-32602,"无效的密码保存操作");
                    if(action.equals("store") && (!p.has("password") || !p.get("password").isJsonPrimitive() || !p.getAsJsonPrimitive("password").isString()))throw new Failure(-32602,"请在本地输入要保存的密码");
                    // A destination change can never silently inherit another endpoint's credential.
                    if(previous!=null && !Credentials.account(previous).equals(Credentials.account(profile)))passwords.remove(previous);
                    JsonObject saved = profiles.save(profile);
                    if(action.equals("store"))passwords.put(saved,str(p,"password",""));
                    else if(action.equals("remove"))passwords.remove(saved);
                    return saved;
                }
            }
            case "profiles/delete": {
                synchronized (sessions) {
                    String id = Profiles.id(p);
                    if (sessions.containsKey(id)) throw new Failure(-32021,"请先断开此调试连接，再删除配置");
                    passwords.remove(profiles.get(id));
                    profiles.delete(id); return map("success",true);
                }
            }
            case "profiles/test": {
                JsonObject profile = Profiles.normalize(object(p,"profile"), false);
                try (Factory factory = new Factory(Profiles.connection(profile, password(p,profile))); Session s = new Session("profile-test",factory)) {
                    s.open(); return map("success",true,"preflight",s.preflight);
                }
            }
            case "profiles/connect": {
                String token = required(p,"requestToken");
                if (!token.matches("[a-zA-Z0-9-]{1,80}")) throw new Failure(-32602,"无效的连接请求标识");
                synchronized (sessions) {
                    if (cancelledPrivateConnects.remove(token)) throw new Failure(-32022,"连接建立已取消");
                    String id = Profiles.id(p);
                    JsonObject profile = profiles.get(id);
                    Session same = sessions.get(id);
                    if (same != null) return map("profile",profile,"status",same.status());
                    // Keep the old idle connection usable if the new connection fails.
                    for (Session s : sessions.values()) if (s.id.startsWith("private-")) s.idle();
                    String password = password(p,profile);
                    Session next = new Session(id,new Factory(Profiles.connection(profile,password)));
                    try { next.open(); }
                    catch (Exception e) { next.close(); throw e; }
                    if (cancelledPrivateConnects.remove(token)) { next.close(); throw new Failure(-32022,"连接建立已取消"); }
                    try { for (Session old : sessions.values()) if (old.id.startsWith("private-")) old.idle(); }
                    catch (Failure e) { next.close(); throw e; }
                    // An unsuccessful connection must not overwrite a working saved password.
                    try {
                        if(p.has("rememberPassword")) {
                            if(p.get("rememberPassword").getAsBoolean())passwords.put(profile,password);
                            else passwords.remove(profile);
                        }
                    } catch(Exception e) { next.close();throw e; }
                    if (cancelledPrivateConnects.remove(token)) { next.close(); throw new Failure(-32022,"连接建立已取消"); }
                    for (String oldId : new ArrayList<>(sessions.keySet())) if (oldId.startsWith("private-")) {
                        Session old = sessions.remove(oldId); if (old != null) old.close();
                    }
                    sessions.put(id,next); return map("profile",profile,"status",next.status());
                }
            }
            case "profiles/disconnect": {
                String token = str(p,"requestToken","");
                if (token.matches("[a-zA-Z0-9-]{1,80}")) cancelledPrivateConnects.add(token);
                synchronized (sessions) {
                    String id = Profiles.id(p);
                    Session s = sessions.remove(id); if (s != null) s.close();
                    return map("success",true);
                }
            }
            case "connection/test": {
                try (Factory factory = new Factory(p); Session s = new Session("test", factory)) {
                    s.open(); return map("success", true, "message", "两条 JDBC 连接与调试 API 检查通过", "preflight", s.preflight);
                }
            }
            case "connection/connect": {
                String id = required(object(p, "connection"), "id");
                synchronized (sessions) {
                    Session old = sessions.remove(id);
                    if (old != null) old.close();
                    Factory factory = new Factory(p);
                    Session s = new Session(id, factory);
                    try { s.open(); sessions.put(id, s); }
                    catch (Exception e) { s.close(); throw e; }
                    return map("success", true, "preflight", s.preflight);
                }
            }
            case "connection/disconnect": {
                String id = required(object(p, "connection"), "id");
                Session s = sessions.remove(id);
                if (s != null) s.close();
                return map("success", true);
            }
            case "debug/status": return session(p).status();
            case "debug/preflight": return session(p).preflight;
            case "debug/listRoutines": return session(p).searchRoutines(str(p, "schema", ""), str(p, "search", ""));
            case "debug/parameters": return session(p).parameters(oid(p));
            case "debug/source": return session(p).source(oid(p));
            case "debug/start": return session(p).start(oid(p), array(p, "arguments"));
            case "debug/result": return session(p).result(required(p, "generation"), integer(p, "resultId", 0, 10000));
            case "debug/inspect": return session(p).inspect(required(p, "generation"));
            case "debug/stepOver": return session(p).move("step_over", required(p, "generation"));
            case "debug/stepInto": return session(p).move("step_into", required(p, "generation"));
            case "debug/continue": return session(p).move("continue", required(p, "generation"));
            case "debug/setBreakpoint": return session(p).breakpoint(true, p);
            case "debug/removeBreakpoint": return session(p).breakpoint(false, p);
            case "debug/stop": return session(p).stop(required(p, "generation"));
            default: throw new Failure(-32601, "Unknown method: " + method);
        }
    }
    String password(JsonObject p,JsonObject profile) {
        if(p.has("useSavedPassword") && p.get("useSavedPassword").getAsBoolean()) {
            JsonObject saved = profiles.get(Profiles.id(profile));
            if(!Credentials.account(saved).equals(Credentials.account(profile)))throw new Failure(-32024,"连接地址或用户名已改变，请输入该连接的密码");
            return passwords.get(saved);
        }
        return str(p,"password","");
    }
    Session session(JsonObject p) {
        Session s = sessions.get(required(p, "connectionId"));
        if (s == null) throw new Failure(-32010, "调试连接已关闭；请在插件的连接管理中重新连接");
        return s;
    }

    final class Session implements AutoCloseable {
        final String id;
        final Factory factory;
        final Object controlLock = new Object();
        final ExecutorService controlLane = Executors.newSingleThreadExecutor(daemon("control"));
        final ExecutorService targetLane = Executors.newSingleThreadExecutor(daemon("target"));
        Connection control, target;
        volatile Statement controlStatement, targetStatement;
        volatile String state = "idle", generation = "";
        volatile boolean closed;
        volatile long cancellationEpoch;
        volatile int handle, controlPid, targetPid;
        volatile long activeOid;
        volatile Map<String, Object> preflight = map();
        volatile Object position;
        volatile String lastError;
        volatile List<Map<String,Object>> outputs = new ArrayList<>();
        volatile List<Map<String,Object>> resultSets = new ArrayList<>();
        final AtomicLong revision = new AtomicLong();
        ScheduledFuture<?> deadline;
        Session(String id, Factory factory) { this.id = id; this.factory = factory; }

        void open() throws Exception {
            synchronized (controlLock) {
                if (closed) throw new Failure(-32010, "Connection is closed");
                if (control != null && !control.isClosed() && target != null && !target.isClosed()) return;
                long openingEpoch = cancellationEpoch;
                Connection c = null, t = null;
                try {
                    c = factory.connect(); t = factory.connect();
                    Map<String, Object> ci = first(query(c, "SELECT current_database() AS database_name, current_user AS login_user, sys_backend_pid() AS backend_pid, version() AS server_version", 15));
                    Map<String, Object> ti = first(query(t, "SELECT current_database() AS database_name, sys_backend_pid() AS backend_pid", 15));
                    controlPid = number(ci.get("backend_pid")); targetPid = number(ti.get("backend_pid"));
                    if (!factory.database.equals(String.valueOf(ci.get("database_name"))) || !ci.get("database_name").equals(ti.get("database_name")) || controlPid == targetPid)
                        throw new Failure(-32020, "数据库名或物理会话检查失败");
                    Object extension = scalar(c, "SELECT extversion FROM sys_extension WHERE extname = 'plsql_pldbgapi'", 15);
                    if (extension == null) throw new Failure(-32020, "当前数据库没有 plsql_pldbgapi 扩展");
                    List<Map<String,Object>> api = query(c, "SELECT p.proname FROM sys_proc p JOIN sys_namespace n ON n.oid=p.pronamespace WHERE n.nspname='plsql_debug'", 15);
                    Set<String> names = new HashSet<>();
                    for (Map<String,Object> row: api) names.add(String.valueOf(row.get("proname")));
                    for (String name : Arrays.asList("create_listener", "set_global_breakpoint", "wait_for_target", "wait_for_breakpoint", "step_over", "step_into", "continue", "get_stack", "get_variables", "get_source", "get_breakpoints", "set_breakpoint", "drop_breakpoint", "abort_target", "set_connection_timeout", "set_operation_timeout"))
                        if (!names.contains("plsql_pldbg_" + name)) throw new Failure(-32020, "缺少调试接口: " + name);
                    if (closed || state.equals("stopping") || cancellationEpoch != openingEpoch)
                        throw new Failure(-32022, "连接建立已取消；请重新打开插件连接");
                    control = c; target = t;
                    preflight = map("database", ci.get("database_name"), "user", ci.get("login_user"), "serverVersion", ci.get("server_version"), "extensionVersion", extension, "controlPid", controlPid, "targetPid", targetPid, "persistentConnections", true);
                } catch (Exception e) { closeConnection(c); closeConnection(t); throw e; }
            }
        }

        void idle() {
            if (closed) throw new Failure(-32010, "Connection is closed");
            if (Arrays.asList("preparing", "waiting", "paused", "running", "stopping").contains(state)) throw new Failure(-32021, "调试正在进行，当前操作不可用");
        }
        void paused(String g) {
            if (!generation.equals(g)) throw new Failure(-32022, "调试会话已过期，请刷新状态");
            if (!state.equals("paused")) throw new Failure(-32021, "目标没有暂停");
        }
        Map<String,Object> status() {
            return map("connectionId", id, "generation", generation, "revision", revision.get(), "state", state, "position", position, "oid", activeOid, "error", lastError, "outputs", outputs, "preflight", preflight);
        }
        void changed() { revision.incrementAndGet(); event("debug/state", status()); }
        void notice(String g, String text) { if (generation.equals(g)) event("debug/output", map("connectionId", id, "generation", g, "text", text)); }
        List<Map<String,Object>> listRoutines(String schema) throws Exception {
            return routineRows(schema, "");
        }
        Map<String,Object> searchRoutines(String schema, String search) throws Exception {
            String term = search.trim();
            if (term.length() > 256) throw new Failure(-32602, "搜索名称最多 256 个字符");
            List<Map<String,Object>> rows = routineRows(schema, term);
            boolean truncated = rows.size() > 500;
            return map("items", truncated ? new ArrayList<>(rows.subList(0, 500)) : rows, "truncated", truncated, "limit", 500, "search", term);
        }
        List<Map<String,Object>> routineRows(String schema, String search) throws Exception {
            synchronized (controlLock) {
                synchronized (this) { idle(); }
                open();
                if (schema.isEmpty()) schema = String.valueOf(preflight.get("user"));
                String sql = "SELECT p.oid::bigint AS oid, n.nspname AS schema_name, p.proname AS routine_name, p.prokind::text AS kind, sys_get_function_arguments(p.oid) AS arguments, p.pronargs AS input_count, p.proargmodes::text AS argument_modes FROM sys_proc p JOIN sys_namespace n ON n.oid=p.pronamespace JOIN sys_language l ON l.oid=p.prolang WHERE n.nspname=? AND l.lanname IN ('plsql','plpgsql') AND p.prokind IN ('p','f')";
                // Omit an empty search predicate: Oracle compatibility mode may treat an empty string as NULL.
                if (!search.isEmpty()) sql += " AND position(lower(CAST(? AS text)) in lower(p.proname))>0";
                sql += " ORDER BY p.proname,p.oid LIMIT 501";
                return search.isEmpty() ? query(control, sql, 15, schema) : query(control, sql, 15, schema, search);
            }
        }
        Map<String,Object> parameters(long oid) throws Exception {
            synchronized (controlLock) {
                synchronized (this) { idle(); }
                open();
                Map<String,Object> r = routine(oid);
                try { return map("oid", oid, "supported", true, "parameters", parameterRows(r, oid)); }
                catch (Failure e) { return map("oid", oid, "supported", false, "reason", e.getMessage(), "parameters", Collections.emptyList()); }
            }
        }
        List<Map<String,Object>> parameterRows(Map<String,Object> r, long oid) throws Exception {
            Object all = r.get("all_oids");
            String[] types = oidList(all == null ? r.get("input_oids") : all);
            String modes = r.get("argument_modes") == null ? "" : r.get("argument_modes").toString().replaceAll("[{},\"\\s]", "");
            if (!modes.isEmpty() && modes.length() != types.length) throw new Failure(-32602, "参数目录的类型与方向数量不一致，请刷新对象");
            List<Map<String,Object>> parameters = new ArrayList<>();
            boolean hasOutput = modes.indexOf('o') >= 0 || modes.indexOf('b') >= 0;
            for (int i=0; i<types.length; i++) {
                char mode = modes.isEmpty() ? 'i' : modes.charAt(i);
                if (mode != 'i' && mode != 'o' && mode != 'b') throw new Failure(-32602, "支持 IN、OUT、INOUT 参数；TABLE、VARIADIC 参数尚未实现");
                long typeOid = Long.parseLong(types[i]);
                // proallargtypes, proargmodes and proargnames share declaration order (including pure OUT).
                Map<String,Object> t = first(query(control, "SELECT p.proargnames[CAST(? AS integer)] AS parameter_name, n.nspname AS type_schema, t.typname AS type_name, t.typbasetype::bigint AS base_oid FROM sys_type t JOIN sys_namespace n ON n.oid=t.typnamespace CROSS JOIN sys_proc p WHERE t.oid=CAST(? AS oid) AND p.oid=CAST(? AS oid)", 15, i+1, typeOid, oid));
                if (t.isEmpty()) throw new Failure(-32602, "参数类型不存在");
                Object name = t.get("parameter_name");
                String parameterName = name == null || name.toString().isEmpty() ? "$" + (i+1) : name.toString();
                String schema = String.valueOf(t.get("type_schema")), type = String.valueOf(t.get("type_name"));
                Integer jdbc = resolveJdbcType(t);
                boolean cursor = jdbc != null && jdbc == Types.REF_CURSOR;
                if (cursor && mode != 'o') throw new Failure(-32602, "游标参数当前仅支持 OUT：" + parameterName);
                if (hasOutput && jdbc == null) throw new Failure(-32602, "含 OUT／INOUT 的调用暂不支持此参数类型：" + parameterName + " " + displayType(schema, type));
                parameters.add(map("position", i+1, "name", parameterName, "mode", mode == 'o' ? "OUT" : mode == 'b' ? "INOUT" : "IN", "typeOid", typeOid, "typeSchema", schema, "typeName", type, "type", displayType(schema, type), "jdbcType", jdbc, "cursor", cursor));
            }
            returnParameter(r, hasOutput);

            return parameters;
        }

        Integer resolveJdbcType(Map<String,Object> type) throws Exception {
            Set<Long> visited = new HashSet<>();
            for (int depth=0; depth<16; depth++) {
                String schema = String.valueOf(type.get("type_schema")), name = String.valueOf(type.get("type_name"));
                Integer jdbc = jdbcType(schema, name);
                if (jdbc != null) return jdbc;
                long base = type.get("base_oid") == null ? 0 : Long.parseLong(type.get("base_oid").toString());
                if (base == 0 || !visited.add(base)) return null;
                type = first(query(control, "SELECT n.nspname AS type_schema, t.typname AS type_name, t.typbasetype::bigint AS base_oid FROM sys_type t JOIN sys_namespace n ON n.oid=t.typnamespace WHERE t.oid=CAST(? AS oid)", 15, base));
                // Only cursor domains are enabled in this release; preserve existing scalar type boundaries.
                if (type.isEmpty()) return null;
                Integer root = jdbcType(String.valueOf(type.get("type_schema")), String.valueOf(type.get("type_name")));
                if (root != null) return root == Types.REF_CURSOR ? root : null;
            }
            return null;
        }
        Map<String,Object> returnParameter(Map<String,Object> r, boolean hasOutput) throws Exception {
            if (!"f".equals(r.get("kind"))) return null;
            Map<String,Object> type = map("type_schema", r.get("return_schema"), "type_name", r.get("return_type"), "base_oid", r.get("return_base_oid"));
            Integer jdbc = resolveJdbcType(type);
            if (!hasOutput && (jdbc == null || jdbc != Types.REF_CURSOR)) return null;
            if (jdbc == null) throw new Failure(-32602, "含 OUT／INOUT 的函数暂不支持此返回类型：" + r.get("return_type"));
            return map("position", 0, "name", "RETURN", "mode", "RETURN", "type", displayType(String.valueOf(r.get("return_schema")), String.valueOf(r.get("return_type"))), "jdbcType", jdbc, "cursor", jdbc == Types.REF_CURSOR);
        }
        Object result(String g, int resultId) {
            synchronized (this) {
                if (!generation.equals(g)) throw new Failure(-32022, "调试会话已过期，请刷新状态");
                if (!state.equals("finished") || resultId >= resultSets.size()) throw new Failure(-32602, "本次调试没有此结果集");
                return map("generation", g, "resultId", resultId, "result", resultSets.get(resultId));
            }
        }

        Map<String,Object> routine(long oid) throws Exception {
            Map<String,Object> row = first(query(control, "SELECT p.oid::bigint AS oid, n.nspname AS schema_name, p.proname AS routine_name, p.prokind::text AS kind, p.prosrc AS source, p.proargtypes::text AS input_oids, p.proallargtypes::text AS all_oids, p.proargmodes::text AS argument_modes, p.pronargs AS input_count, rn.nspname AS return_schema, rt.typname AS return_type, rt.typbasetype::bigint AS return_base_oid FROM sys_proc p JOIN sys_namespace n ON n.oid=p.pronamespace JOIN sys_language l ON l.oid=p.prolang JOIN sys_type rt ON rt.oid=p.prorettype JOIN sys_namespace rn ON rn.oid=rt.typnamespace WHERE p.oid=CAST(? AS oid) AND l.lanname IN ('plsql','plpgsql')", 15, oid));
            if (row.isEmpty()) throw new Failure(-32602, "未找到可调试的 PL/SQL 对象");
            return row;
        }
        Object source(long oid) throws Exception {
            synchronized (controlLock) {
                if (state.equals("waiting") || state.equals("running") || state.equals("preparing") || state.equals("stopping")) throw new Failure(-32021, "控制连接正在执行调试命令");
                open();
                Object text = state.equals("paused") ? callScalar("get_source", handle, oid) : routine(oid).get("source");
                return map("oid", oid, "source", text);
            }
        }

        Object start(long oid, JsonArray args) throws Exception {
            final String g;
            synchronized (this) { idle(); state = "preparing"; generation = UUID.randomUUID().toString(); g = generation; position = null; lastError = null; outputs = new ArrayList<>(); resultSets = new ArrayList<>(); activeOid = oid; changed(); }
            try {
                final String sql;
                final List<Map<String,Object>> parameters;
                final Map<String,Object> returned;
                final boolean callable;
                synchronized (controlLock) {
                    open();
                    Map<String,Object> r = routine(oid);
                    parameters = parameterRows(r, oid);
                    returned = returnParameter(r, parameters.stream().anyMatch(p -> !"IN".equals(p.get("mode"))));
                    callable = returned != null || parameters.stream().anyMatch(p -> !"IN".equals(p.get("mode")));
                    if (args.size() != parameters.size()) throw new Failure(-32602, "参数个数不匹配，需要按声明顺序传入 " + parameters.size() + " 个参数，OUT 位置传 null");
                    List<String> placeholders = new ArrayList<>();
                    for (int i=0; i<parameters.size(); i++) {
                        JsonElement arg = args.get(i);
                        Map<String,Object> p = parameters.get(i);
                        if (Boolean.TRUE.equals(p.get("cursor")) && !arg.isJsonNull()) throw new Failure(-32602, "游标参数 " + p.get("name") + " 的初始值必须为 NULL");
                        if ("OUT".equals(p.get("mode")) && !arg.isJsonNull()) throw new Failure(-32602, "OUT 参数 " + p.get("name") + " 无需初始值，请传 null");
                        if (!arg.isJsonNull() && !arg.isJsonPrimitive()) throw new Failure(-32602, "参数必须是字符串、数字、布尔值或 null；数组请使用数据库文本格式");
                        String qualifiedType=quote(String.valueOf(p.get("typeSchema")))+"."+quote(String.valueOf(p.get("typeName")));
                        placeholders.add(callable ? "?" : "CAST(? AS " + qualifiedType + ")");
                    }
                    String qualified = quote(String.valueOf(r.get("schema_name"))) + "." + quote(String.valueOf(r.get("routine_name")));
                    sql = callable ? "{" + (returned == null ? "call " : "? = call ") + qualified + "(" + String.join(",", placeholders) + ")}" : ("p".equals(String.valueOf(r.get("kind"))) ? "CALL " : "SELECT ") + qualified + "(" + String.join(",", placeholders) + ")";
                    // These two extension settings are target-local, as required by Kingbase.
                    scalar(target, "SELECT plsql_debug.plsql_pldbg_set_connection_timeout(15)", 15);
                    scalar(target, "SELECT plsql_debug.plsql_pldbg_set_operation_timeout(300)", 15);
                    handle = number(callScalar("create_listener"));
                    Object armed = callScalar("set_global_breakpoint", handle, oid, null, targetPid);
                    if (!Boolean.TRUE.equals(armed)) throw new Failure(-32020, "入口断点设置失败");
                    synchronized (this) { if (!generation.equals(g) || !state.equals("preparing")) throw new Failure(-32022, "启动已取消"); state="waiting"; changed(); }
                    deadline = deadlines.schedule(() -> { if (generation.equals(g) && !terminal()) stop(g); }, 600, TimeUnit.SECONDS);
                }
                targetLane.submit(() -> executeTarget(g, sql, args, parameters, callable, returned));
                return status();
            } catch (Exception e) { finish(g, "error", message(e)); throw e; }
        }
        void attach(String g) {
            try {
                synchronized (controlLock) {
                    if (!live(g)) return;
                    Object pid = callScalar("wait_for_target", handle);
                    if (number(pid) != targetPid) throw new Failure(-32020, "监听器返回了不同的目标 PID");
                    List<Map<String,Object>> bp = callRows("wait_for_breakpoint", handle);
                    pauseAt(g, bp);
                }
            } catch (Exception e) { if (live(g)) finish(g, "error", message(e)); }
        }
        void executeTarget(String g, String sql, JsonArray args, List<Map<String,Object>> parameters, boolean callable, Map<String,Object> returned) {
            Connection execution = target;
            boolean cursorTransaction = parameters.stream().anyMatch(p -> Boolean.TRUE.equals(p.get("cursor"))) || returned != null && Boolean.TRUE.equals(returned.get("cursor"));
            try {
                if (!live(g)) return;
                // Cursors belong to this physical session and must be read before COMMIT closes them.
                if (cursorTransaction) execution.setAutoCommit(false);
                List<Map<String,Object>> results = new ArrayList<>(), values = new ArrayList<>();
                ResultBudget budget = new ResultBudget();
                try (PreparedStatement st = callable ? execution.prepareCall(sql) : execution.prepareStatement(sql)) {
                    targetStatement = st; st.setQueryTimeout(600);
                    int offset = returned == null ? 0 : 1;
                    if (returned != null) ((CallableStatement)st).registerOutParameter(1, (Integer)returned.get("jdbcType"));
                    for (int i=0; i<args.size(); i++) {
                        JsonElement v = args.get(i);
                        Map<String,Object> p = parameters.get(i);
                        int index = i + 1 + offset;
                        String mode = String.valueOf(p.get("mode"));
                        // Pure OUT is registered only: the driver initializes it as NULL, never as INOUT.
                        if (!mode.equals("OUT")) {
                            if (!callable) { if (v.isJsonNull()) st.setNull(index, Types.VARCHAR); else st.setString(index, v.getAsString()); }
                            else if (v.isJsonNull()) st.setNull(index, (Integer)p.get("jdbcType"));
                            else st.setObject(index, v.getAsString(), (Integer)p.get("jdbcType"));
                        }
                        if (callable && !mode.equals("IN")) ((CallableStatement)st).registerOutParameter(index, (Integer)p.get("jdbcType"));
                    }
                    if (!live(g)) return;
                    // Bind/registration failures must not leave a controller waiting for a target
                    // that was never invoked. Only attach after the JDBC statement is ready.
                    controlLane.submit(() -> attach(g));
                    boolean hasRows = st.execute();
                    if (hasRows) try (ResultSet rs=st.getResultSet()) { notice(g, JSON.toJson(readRows(rs, 100))); }
                    if (callable) {
                        if (returned != null) values.add(readOutput((CallableStatement)st, 1, returned, results, budget));
                        for (int i=0; i<parameters.size(); i++) if (!"IN".equals(parameters.get(i).get("mode")))
                            values.add(readOutput((CallableStatement)st, i+1+offset, parameters.get(i), results, budget));
                    }
                    for (SQLWarning w=st.getWarnings(); w!=null; w=w.getNextWarning()) notice(g, w.getMessage());
                    for (SQLWarning w=execution.getWarnings(); w!=null; w=w.getNextWarning()) notice(g, w.getMessage());
                } finally { targetStatement = null; }
                if (!live(g)) return;
                // Match the existing success/auto-commit behavior, after every cursor has been read and closed.
                if (cursorTransaction) execution.commit();
                synchronized (this) { if (!live(g)) return; outputs = values; resultSets = results; }
                if (!values.isEmpty()) notice(g, "输出参数：" + JSON.toJson(values));
                finish(g, "finished", null);
            } catch (Exception e) {
                if (cursorTransaction && execution != null) try { execution.rollback(); } catch (Exception ignored) { }
                if (live(g)) finish(g, "error", message(e));
            }
        }
        Map<String,Object> readOutput(CallableStatement st, int index, Map<String,Object> p, List<Map<String,Object>> results, ResultBudget budget) throws Exception {
            Map<String,Object> value = map("position", p.get("position"), "name", p.get("name"), "mode", p.get("mode"), "type", p.get("type"));
            if (Boolean.TRUE.equals(p.get("cursor"))) {
                Object cursor = st.getObject(index);
                if (cursor == null) { value.put("value", null); return value; }
                if (!(cursor instanceof ResultSet)) throw new Failure(-32020, "驱动未将游标输出转换为结果集：" + p.get("name"));
                Map<String,Object> data;
                try (ResultSet rs=(ResultSet)cursor) { data = readCursor(rs, budget); }
                int resultId = results.size();results.add(data);
                value.put("resultId", resultId);
                value.put("rowCount", data.get("rowCount"));value.put("truncated", data.get("truncated"));
                value.put("value", "结果集 · " + data.get("rowCount") + " 行" + (Boolean.TRUE.equals(data.get("truncated")) ? "（已截断）" : ""));
            } else {
                // Use text to preserve numeric precision and SQL NULL across JSON/JavaScript.
                String text = st.getString(index);
                if (text != null) budget.scalar(text.length());
                value.put("value", text);
            }
            return value;
        }
        Object move(String action, String g) {
            synchronized (this) { paused(g); state = "running"; changed(); }
            controlLane.submit(() -> {
                try { synchronized (controlLock) { if (live(g)) pauseAt(g, callRows(action, handle)); } }
                catch (Exception e) { if (live(g)) finish(g, "error", message(e)); }
            });
            return status();
        }
        void pauseAt(String g, List<Map<String,Object>> bp) throws Exception {
            Map<String,Object> frame = first(bp);
            synchronized (this) {
                if (!live(g)) return;
                // A NULL composite can mean the target has exited; only the target worker marks completion.
                if (frame.isEmpty() || frame.values().stream().allMatch(Objects::isNull)) return;
                position = frame; state = "paused"; changed();
            }
        }
        Object inspect(String g) throws Exception {
            synchronized (controlLock) {
                synchronized (this) { paused(g); }
                List<Map<String,Object>> vars = callRows("get_variables", handle);
                List<Map<String,Object>> stack = callRows("get_stack", handle);
                List<Map<String,Object>> bps = callRows("get_breakpoints", handle);
                return map("generation", g, "position", position, "variables", vars, "stack", stack, "breakpoints", bps);
            }
        }
        Object breakpoint(boolean add, JsonObject p) throws Exception {
            String g = required(p, "generation");
            int line = integer(p, "line", 1, 1000000);
            long oid = oid(p);
            synchronized (controlLock) {
                synchronized (this) { paused(g); }
                Object result = callScalar(add ? "set_breakpoint" : "drop_breakpoint", handle, oid, line);
                return map("success", result);
            }
        }
        boolean live(String g) { return generation.equals(g) && !closed && !terminal() && !state.equals("stopping"); }
        boolean terminal() { return Arrays.asList("finished", "cancelled", "error", "disconnected").contains(state); }
        Object stop(String g) {
            final boolean wasPaused;
            synchronized (this) {
                if (!generation.equals(g)) throw new Failure(-32022, "调试会话已过期");
                if (terminal() || state.equals("stopping")) return status();
                wasPaused = state.equals("paused"); cancellationEpoch++; state="stopping"; changed();
            }
            cancellation.submit(() -> {
                if (wasPaused) {
                    try { synchronized (controlLock) { callRows("abort_target", handle); } }
                    catch (Exception ignored) { }
                }
                cancel(targetStatement); cancel(controlStatement);
                finish(g, "cancelled", null);
            });
            // Driver cancellation can block. A separate deadline aborts both physical sessions.
            deadlines.schedule(() -> finish(g, "cancelled", null), 3, TimeUnit.SECONDS);
            return status();
        }
        void finish(String g, String finalState, String error) {
            final Connection c, t;
            final Statement cs, ts;
            synchronized (this) {
                if (!generation.equals(g) || terminal()) return;
                // abort_target may make JDBC report success before stop's cleanup returns.
                if (state.equals("stopping")) { finalState="cancelled"; error=null; }
                state = finalState; lastError = error;
                if (deadline != null) deadline.cancel(false);
                c=control; t=target; cs=controlStatement; ts=targetStatement; control=null; target=null; handle=0;
                changed();
            }
            // Abort captured connections, never a connection belonging to a subsequent generation.
            disposeConnection(t, ts); disposeConnection(c, cs);
        }
        Object callScalar(String operation, Object... args) throws Exception {
            return firstValue(callRows(operation, args));
        }
        List<Map<String,Object>> callRows(String operation, Object... args) throws Exception {
            if (!operation.matches("[a-z_]+")) throw new IllegalArgumentException("operation");
            List<String> placeholders = new ArrayList<>();
            for (int i=0;i<args.length;i++) {
                boolean isOid = i==1 && Arrays.asList("set_global_breakpoint", "set_breakpoint", "drop_breakpoint", "get_source").contains(operation);
                placeholders.add("CAST(? AS " + (isOid ? "oid" : "integer") + ")");
            }
            String marks = String.join(",", placeholders);
            String sql = "SELECT * FROM plsql_debug.plsql_pldbg_" + operation + "(" + marks + ")";
            try (PreparedStatement st = control.prepareStatement(sql)) {
                controlStatement=st; st.setQueryTimeout(600);
                for (int i=0;i<args.length;i++) {
                    // OID inputs must not be inferred as int8: Kingbase resolves exact extension signatures.
                    Object arg=args[i];
                    if (arg==null) st.setNull(i+1, Types.INTEGER);
                    else if (arg instanceof Long) st.setLong(i+1, (Long)arg);
                    else st.setObject(i+1,arg);
                }
                try (ResultSet rs=st.executeQuery()) {
                    List<Map<String,Object>> rows = readRows(rs, 2000);
                    // Kingbase variants name this attribute differently; the documented
                    // frame tuple always starts with its stack depth (CallCount).
                    if (operation.equals("get_stack")) for (Map<String,Object> row : rows)
                        if (!row.isEmpty()) row.put("frame", row.values().iterator().next());
                    return rows;
                }
            } finally { controlStatement=null; }
        }
        public void close() {
            final Connection c,t;final Statement cs,ts;
            synchronized (this) { closed=true; state="disconnected"; c=control; t=target;cs=controlStatement;ts=targetStatement; control=null; target=null; if(deadline!=null)deadline.cancel(false); }
            disposeConnection(t,ts); disposeConnection(c,cs);
            controlLane.shutdownNow(); targetLane.shutdownNow(); factory.close();
        }
    }

    /** Only allowlisted non-secret fields survive a restart. */
    static final class Profiles {
        final Path file;
        Profiles(String dataDir) { file = dataDir == null || dataDir.isBlank() ? null : Paths.get(dataDir).resolve("debugger-connections.json"); }
        static String id(JsonObject p) {
            String id = required(p,"id");
            if (!id.matches("private-[a-f0-9-]{36}")) throw new Failure(-32602,"无效的插件连接 ID");
            return id;
        }
        static String text(JsonObject p,String key,int max) {
            String value = required(p,key).trim();
            if (value.length()>max || value.indexOf('\0')>=0 || value.indexOf('\n')>=0 || value.indexOf('\r')>=0)
                throw new Failure(-32602,"连接字段无效："+key);
            return value;
        }
        static JsonObject normalize(JsonObject source,boolean requireId) {
            JsonObject p = new JsonObject();
            p.addProperty("id",requireId ? id(source) : str(source,"id","").isEmpty() ? "private-"+UUID.randomUUID() : id(source));
            for (String key : Arrays.asList("name","host","database","username","jdbcJar")) p.addProperty(key,text(source,key,key.equals("jdbcJar")?4096:256));
            if (str(p,"host","").matches(".*[/?#@\\s].*")) throw new Failure(-32602,"主机地址无效");
            p.addProperty("port",integer(source,"port",1,65535));
            p.addProperty("timeout",integer(source,"timeout",1,60));
            return p;
        }
        synchronized List<JsonObject> list() {
            if (file == null) throw new Failure(-32020,"宿主未提供插件数据目录，请检查 DBX 版本");
            if (!Files.exists(file)) return new ArrayList<>();
            try {
                if (Files.size(file)>1024*1024) throw new IOException("oversized");
                JsonObject stored = JsonParser.parseString(Files.readString(file,StandardCharsets.UTF_8)).getAsJsonObject();
                if (!stored.has("version") || stored.get("version").getAsInt()!=1 || !stored.has("profiles") || !stored.get("profiles").isJsonArray()) throw new IOException("format");
                JsonArray rows = stored.getAsJsonArray("profiles");
                if (rows.size()>100) throw new IOException("count");
                List<JsonObject> result = new ArrayList<>(); Set<String> ids = new HashSet<>();
                for (JsonElement row : rows) {
                    JsonObject profile = normalize(row.getAsJsonObject(),true);
                    if (!ids.add(id(profile))) throw new IOException("duplicate");
                    result.add(profile);
                }
                return result;
            } catch (Exception e) { throw new Failure(-32020,"无法读取插件连接配置；原文件已保留，请检查插件数据目录"); }
        }
        synchronized JsonObject get(String id) {
            for (JsonObject p : list()) if (id.equals(str(p,"id",""))) return p;
            throw new Failure(-32602,"此插件连接已删除，请刷新连接列表");
        }
        synchronized JsonObject save(JsonObject source) {
            JsonObject profile = normalize(source,false);
            List<JsonObject> rows = list(); String id = id(profile);
            rows.removeIf(row -> id.equals(str(row,"id","")));
            if (rows.size()>=100) throw new Failure(-32602,"最多保存 100 个调试连接");
            rows.add(profile); write(rows); return profile;
        }
        synchronized void delete(String id) {
            List<JsonObject> rows = list();
            if (!rows.removeIf(row -> id.equals(str(row,"id","")))) throw new Failure(-32602,"此插件连接已删除");
            write(rows);
        }
        void write(List<JsonObject> rows) {
            Path temporary = null;
            try {
                Files.createDirectories(file.getParent());
                temporary = Files.createTempFile(file.getParent(),".debugger-connections-",".tmp");
                Files.writeString(temporary,JSON.toJson(map("version",1,"profiles",rows)),StandardCharsets.UTF_8);
                try { Files.move(temporary,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING); }
                catch (AtomicMoveNotSupportedException e) { Files.move(temporary,file,StandardCopyOption.REPLACE_EXISTING); }
            } catch (IOException e) { throw new Failure(-32020,"无法保存插件连接配置，请检查插件数据目录权限"); }
            finally { if (temporary != null) try { Files.deleteIfExists(temporary); } catch (IOException ignored) {} }
        }
        static JsonObject connection(JsonObject profile,String password) {
            JsonObject connection = profile.deepCopy();
            connection.addProperty("password",password);
            JsonObject external = new JsonObject();external.addProperty("jdbc_jar",str(profile,"jdbcJar",""));external.addProperty("connect_timeout_secs",integer(profile,"timeout",1,60));
            connection.add("external_config",external);
            JsonObject request = new JsonObject();request.add("connection",connection);return request;
        }
    }

    /** Credentials stay in sidecar memory; never returned to UI or written to disk. */
    static final class Factory implements AutoCloseable {
        final URLClassLoader loader;
        final Driver driver;
        final String database, url, username;
        char[] password;
        final int timeout;
        Factory(JsonObject p) throws Exception {
            JsonObject connection = object(p,"connection"), external=object(connection,"external_config"), runtime=object(p,"runtime");
            database=required(connection,"database"); username=required(connection,"username");
            String host = str(runtime,"host",str(connection,"host",""));
            if (host.isEmpty() || host.matches(".*[/?#@\\s].*")) throw new Failure(-32602,"主机地址无效");
            int port = runtime.has("port") ? integer(runtime,"port",1,65535) : integer(connection,"port",1,65535);
            timeout = external.has("connect_timeout_secs") ? integer(external,"connect_timeout_secs",1,60) : 10;
            password = str(connection,"password",str(object(connection,"connection_secrets"),"password","")).toCharArray();
            String jarPath = required(external,"jdbc_jar");
            Path jar = Paths.get(jarPath).toAbsolutePath().normalize();
            if (!Files.isRegularFile(jar) || !jar.toString().endsWith(".jar")) throw new Failure(-32602,"请选择本机 Kingbase JDBC jar 文件");
            loader = new URLClassLoader(new URL[]{jar.toUri().toURL()}, Main.class.getClassLoader());
            try { driver=(Driver)Class.forName("com.kingbase8.Driver",true,loader).getDeclaredConstructor().newInstance(); }
            catch (Exception e) { loader.close(); throw new Failure(-32020,"无法加载 com.kingbase8.Driver，请检查 Kingbase 官方 JDBC 文件"); }
            String authority = host.contains(":") ? "["+host.replace("[","").replace("]","")+"]" : host;
            url="jdbc:kingbase8://"+authority+":"+port+"/"+URLEncoder.encode(database,StandardCharsets.UTF_8.name()).replace("+","%20");
        }
        synchronized Connection connect() throws SQLException {
            if (password==null) throw new SQLException("Connection factory is closed");
            Properties properties=new Properties();
            properties.setProperty("user",username); properties.setProperty("password",new String(password));
            // The provider lifecycle opens two physical sessions inside the host deadline.
            properties.setProperty("connectTimeout",String.valueOf(Math.max(1,timeout/2)));
            properties.setProperty("ApplicationName","dbx-kingbase-debugger");
            Connection connection=driver.connect(url,properties);
            properties.clear();
            if(connection==null)throw new SQLException("JDBC URL is not supported");
            connection.setAutoCommit(true);
            return connection;
        }
        public synchronized void close() { if(password!=null){Arrays.fill(password,'\0');password=null;} try{loader.close();}catch(IOException ignored){} }
    }

    static List<Map<String,Object>> query(Connection c,String sql,int timeout,Object... args) throws Exception {
        try(PreparedStatement st=c.prepareStatement(sql)) {
            st.setQueryTimeout(timeout); for(int i=0;i<args.length;i++)st.setObject(i+1,args[i]);
            try(ResultSet rs=st.executeQuery()){return readRows(rs,2000);}
        }
    }
    static Object scalar(Connection c,String sql,int timeout,Object... args)throws Exception{return firstValue(query(c,sql,timeout,args));}
    static Object firstValue(List<Map<String,Object>> rows){Map<String,Object> r=first(rows);return r.isEmpty()?null:r.values().iterator().next();}
    static Map<String,Object> first(List<Map<String,Object>> rows){return rows.isEmpty()?map():rows.get(0);}
    static List<Map<String,Object>> readRows(ResultSet rs,int limit)throws SQLException {
        List<Map<String,Object>> rows=new ArrayList<>(); ResultSetMetaData meta=rs.getMetaData();
        int bytes=0;
        while(rs.next()){
            if(rows.size()>=limit)throw new SQLException("Result exceeds row limit");
            Map<String,Object> row=map();
            for(int i=1;i<=meta.getColumnCount();i++){
                Object value=rs.getObject(i);
                if(value!=null && !(value instanceof Number) && !(value instanceof Boolean) && !(value instanceof String))value=value.toString();
                if(value!=null)bytes+=value.toString().length();
                if(bytes>2*1024*1024)throw new SQLException("Result exceeds size limit");
                row.put(meta.getColumnLabel(i).toLowerCase(Locale.ROOT),value);
            }
            rows.add(row);
        }
        return rows;
    }
    void cancel(Statement st){if(st!=null)cancellation.submit(()->{try{st.cancel();}catch(Exception ignored){}});}
    void disposeConnection(Connection c, Statement st) {
        if(c==null)return;
        if(st==null){abortConnection(c);return;}
        // A socket close alone does not interrupt Kingbase's wait_for_target loop.
        // Send the driver's server-side cancel first, then abort the captured session.
        try { cancellation.submit(()->{try{st.cancel();}catch(Exception ignored){}finally{abortConnection(c);}}); }
        catch(RejectedExecutionException e){closeConnection(c);}
        try { deadlines.schedule(()->abortConnection(c),3,TimeUnit.SECONDS); }
        catch(RejectedExecutionException ignored){}
    }
    void abortConnection(Connection c){if(c!=null)try{cancellation.submit(()->{try{c.abort(cancellation);}catch(Exception e){closeConnection(c);}});}catch(RejectedExecutionException e){closeConnection(c);}}
    static void closeConnection(Connection c){if(c!=null)try{c.close();}catch(Exception ignored){}}
    void close(){for(Session s:sessions.values())s.close();sessions.clear();requests.shutdownNow();deadlines.shutdownNow();cancellation.shutdown();}
    synchronized void response(JsonElement id,Object result,Failure error){Map<String,Object> r=map("jsonrpc","2.0","id",id);if(error==null)r.put("result",result);else r.put("error",map("code",error.code,"message",error.getMessage()));output.println(JSON.toJson(r));}
    synchronized void event(String method,Object p){output.println(JSON.toJson(map("jsonrpc","2.0","method",method,"params",p)));}
    static ThreadFactory daemon(String name){return r->{Thread t=new Thread(r,"kingbase-"+name);t.setDaemon(true);return t;};}
    static Map<String,Object> map(Object... pairs){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
    static String quote(String identifier){return "\""+identifier.replace("\"","\"\"")+"\"";}
    static final int CURSOR_ROWS = 2000, CURSOR_COLUMNS = 256, RESULT_CHARACTERS = 2*1024*1024;
    static final class ResultBudget {
        int characters;
        void scalar(int length) throws SQLException { if ((long)characters + length > RESULT_CHARACTERS) throw new SQLException("Output exceeds size limit"); characters += length; }
        boolean row(int length) { if ((long)characters + length > RESULT_CHARACTERS) return false; characters += length; return true; }
    }
    static Map<String,Object> readCursor(ResultSet rs, ResultBudget budget) throws SQLException {
        ResultSetMetaData metadata = rs.getMetaData();
        int count = metadata.getColumnCount();
        if (count > CURSOR_COLUMNS) throw new Failure(-32020, "游标列数超过 " + CURSOR_COLUMNS + "，请缩小查询列范围");
        List<Map<String,Object>> columns = new ArrayList<>();
        for (int i=1; i<=count; i++) {
            String label=metadata.getColumnLabel(i), type=metadata.getColumnTypeName(i);
            budget.scalar((label == null ? 0 : label.length()) + (type == null ? 0 : type.length()));
            columns.add(map("position", i, "name", label, "type", type));
        }
        List<List<String>> rows = new ArrayList<>();
        boolean truncated = false;
        while (rs.next()) {
            if (Thread.currentThread().isInterrupted()) throw new SQLException("Cursor read cancelled", "57014");
            if (rows.size() >= CURSOR_ROWS) { truncated=true; break; }
            List<String> row = new ArrayList<>();int length = count;
            for (int i=1; i<=count; i++) {
                String cell = rs.getString(i);row.add(cell);
                if (cell != null) { if ((long)length + cell.length() > RESULT_CHARACTERS) { truncated=true; break; } length += cell.length(); }
            }
            if (truncated || !budget.row(length)) { truncated=true; break; }
            rows.add(row);
        }
        return map("columns", columns, "rows", rows, "rowCount", rows.size(), "truncated", truncated, "rowLimit", CURSOR_ROWS, "characterLimit", RESULT_CHARACTERS);
    }
    static String[] oidList(Object value) {
        String text = value == null ? "" : value.toString().replaceAll("[{}]", "").trim();
        return text.isEmpty() ? new String[0] : text.split("[,\\s]+");
    }
    static Integer jdbcType(String schema, String name) {
        if (!schema.equals("pg_catalog") && !schema.equals("sys_catalog")) return null;
        switch (name) {
            case "refcursor": return Types.REF_CURSOR;
            case "int2": return Types.SMALLINT;
            case "int4": return Types.INTEGER;
            case "int8": return Types.BIGINT;
            case "numeric": case "number": return Types.NUMERIC;
            case "float4": return Types.REAL;
            case "float8": return Types.DOUBLE;
            case "bool": return Types.BOOLEAN;
            case "bpchar": case "char": return Types.CHAR;
            case "varchar": case "varchar2": case "text": case "name": return Types.VARCHAR;
            case "date": return Types.DATE;
            case "timestamp": return Types.TIMESTAMP;
            case "timestamptz": return Types.TIMESTAMP_WITH_TIMEZONE;
            case "time": return Types.TIME;
            case "timetz": return Types.TIME_WITH_TIMEZONE;
            default: return null;
        }
    }
    static String displayType(String schema, String name) {
        if (!schema.equals("pg_catalog") && !schema.equals("sys_catalog")) return quote(schema)+"."+quote(name);
        switch (name) {
            case "int2": return "smallint";
            case "int4": return "integer";
            case "int8": return "bigint";
            case "float4": return "real";
            case "float8": return "double precision";
            case "bool": return "boolean";
            case "bpchar": return "char";
            default: return name;
        }
    }
    static JsonObject object(JsonObject p,String key){JsonElement e=p.get(key);return e!=null&&e.isJsonObject()?e.getAsJsonObject():new JsonObject();}
    static JsonArray array(JsonObject p,String key){JsonElement e=p.get(key);return e!=null&&e.isJsonArray()?e.getAsJsonArray():new JsonArray();}
    static String str(JsonObject p,String key,String fallback){JsonElement e=p.get(key);return e==null||e.isJsonNull()?fallback:e.getAsString();}
    static String required(JsonObject p,String key){String s=str(p,key,"");if(s.trim().isEmpty())throw new Failure(-32602,"Missing field: "+key);return s;}
    static int integer(JsonObject p,String key,int min,int max){try{long n=Long.parseLong(required(p,key));if(n<min||n>max)throw new NumberFormatException();return(int)n;}catch(NumberFormatException e){throw new Failure(-32602,"Invalid integer: "+key);}}
    static long oid(JsonObject p){try{long n=Long.parseLong(required(p,"oid"));if(n<1||n>4294967295L)throw new NumberFormatException();return n;}catch(NumberFormatException e){throw new Failure(-32602,"Invalid object OID");}}
    static int number(Object value){return Integer.parseInt(String.valueOf(value));}
    static Failure failure(Throwable e){if(e instanceof Failure)return(Failure)e;return new Failure(-32000,message(e));}
    static String message(Throwable e){if(e instanceof Failure)return e.getMessage();if(e instanceof SQLException)return "Kingbase 数据库请求失败（SQLSTATE "+((SQLException)e).getSQLState()+"）；请在数据库端检查调试权限和日志";return "插件操作失败（"+e.getClass().getSimpleName()+"）";}
    static final class Failure extends RuntimeException {final int code;Failure(int code,String text){super(text);this.code=code;}}
}
