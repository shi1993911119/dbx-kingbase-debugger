package com.kingbase8;

import java.lang.reflect.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.logging.Logger;

/** Deterministic JDBC test double. This file is never included in the plugin. */
public final class Driver implements java.sql.Driver {
    public static final AtomicInteger opened=new AtomicInteger(),closed=new AtomicInteger(),calls=new AtomicInteger();
    public static final AtomicInteger fixtureEpoch=new AtomicInteger();
    public static final List<String> sqls=new CopyOnWriteArrayList<>(),settings=new CopyOnWriteArrayList<>();
    public static volatile CountDownLatch entered=new CountDownLatch(1),complete=new CountDownLatch(1);
    public static volatile boolean failArming,failTarget;
    public static volatile Object boundArgument;
    public static volatile Map<Integer,Object> catalogParams, boundParams;
    public static volatile Map<Integer,Integer> registered = new HashMap<>(), bindingTypes = new HashMap<>();
    public static volatile Map<Integer,String> outputValues = new HashMap<>();
    public static volatile Map<Integer,Object> cursorValues = new HashMap<>();
    public static final List<String> transactionEvents=new CopyOnWriteArrayList<>();
    public static volatile boolean cursorReadFails;
    public static volatile boolean failOutputRegistration;
    public static volatile String connectionPassword;
    public static volatile String allOids, kind="p", returnType="int4";
    public static volatile List<String> parameterNames;
    public static volatile String parameterName="p_seed", inputOids="23", argumentModes=null;
    public static volatile int catalogRows=1;
    public static synchronized void reset(){fixtureEpoch.incrementAndGet();opened.set(0);closed.set(0);calls.set(0);sqls.clear();settings.clear();entered=new CountDownLatch(1);complete=new CountDownLatch(1);failArming=false;failTarget=false;boundArgument=null;catalogParams=null;parameterName="p_seed";inputOids="23";argumentModes=null;catalogRows=1;allOids=null;parameterNames=null;kind="p";returnType="int4";registered=new HashMap<>();bindingTypes=new HashMap<>();outputValues=new HashMap<>();boundParams=null;cursorValues=new HashMap<>();transactionEvents.clear();cursorReadFails=false;failOutputRegistration=false;}
    @SuppressWarnings("unchecked") static <T>T proxy(Class<T> type,InvocationHandler h){return(T)Proxy.newProxyInstance(Driver.class.getClassLoader(),new Class[]{type},h);}
    static Object zero(Class<?> t){if(t==boolean.class)return false;if(t==int.class)return 0;if(t==long.class)return 0L;return null;}
    static Map<String,Object> row(Object... pairs){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
    static List<Map<String,Object>> one(Object...pairs){return Collections.singletonList(row(pairs));}
    public Connection connect(String url,Properties p)throws SQLException {
        if(!url.equals("jdbc:kingbase8://localhost:54321/demo_db"))throw new SQLException("Unexpected URL");
        connectionPassword=p.getProperty("password");
        int index=opened.incrementAndGet(),pid=5000+index,epoch=fixtureEpoch.get();AtomicBoolean isClosed=new AtomicBoolean();
        return proxy(Connection.class,(obj,method,a)->{
            switch(method.getName()){
                case "isClosed":return isClosed.get();
                case "prepareCall":case "prepareStatement":if(isClosed.get())throw new SQLException("closed");return statement((String)a[0],index,pid,isClosed);
                case "abort":case "close":synchronized(Driver.class){if(isClosed.compareAndSet(false,true)&&epoch==fixtureEpoch.get()){transactionEvents.add(index+":close");closed.incrementAndGet();if(index%2==0)complete.countDown();}}return null;
                case "setAutoCommit":transactionEvents.add(index+":auto:"+a[0]);return null;
                case "commit":case "rollback":transactionEvents.add(index+":"+method.getName());return null;
                case "getAutoCommit":return true;
                case "toString":return "FakeConnection"+pid;
                default:return zero(method.getReturnType());
            }
        });
    }
    static PreparedStatement statement(String sql,int index,int pid,AtomicBoolean isClosed){
        Map<Integer,Object> params=new HashMap<>();AtomicBoolean cancelled=new AtomicBoolean();
        return proxy(CallableStatement.class,(obj,method,a)->{
            String name=method.getName();
            if(name.equals("registerOutParameter")){if(failOutputRegistration)throw new SQLException("register failed","07006");registered.put((Integer)a[0],(Integer)a[1]);return null;}
            if(name.equals("getString"))return outputValues.get((Integer)a[0]);
            if(name.equals("getObject"))return cursorValues.get((Integer)a[0]);
            if(name.startsWith("set")&&a!=null&&a.length>=2&&a[0]instanceof Integer){if(name.equals("setNull")&&Objects.equals(a[1],Types.REF_CURSOR))throw new SQLException("Unknown Types value","07006");params.put((Integer)a[0],name.equals("setNull")?null:a[1]);if(a.length==3)bindingTypes.put((Integer)a[0],(Integer)a[2]);if(name.equals("setNull"))bindingTypes.put((Integer)a[0],(Integer)a[1]);return null;}
            if(name.equals("cancel")){transactionEvents.add(index+":cancel");cancelled.set(true);return null;}
            if(name.equals("execute")){
                sqls.add(index+":"+sql);calls.incrementAndGet();boundArgument=params.get(1);boundParams=new HashMap<>(params);entered.countDown();
                if(failTarget)throw new SQLException("target exception","P0001");
                while(!complete.await(20,TimeUnit.MILLISECONDS)){if(cancelled.get()||isClosed.get())throw new SQLException("cancelled","57014");}
                if(isClosed.get()||cancelled.get())throw new SQLException("cancelled","57014");return false;
            }
            if(name.equals("executeQuery")){
                sqls.add(index+":"+sql);List<Map<String,Object>> rows;
                if(sql.contains("current_database()"))rows=one("database_name","demo_db","login_user","demo_user","backend_pid",pid,"server_version","KingbaseES test");
                else if(sql.contains("sys_extension"))rows=one("extversion","1.3");
                else if(sql.contains("n.nspname='plsql_debug'")){
                    rows=new ArrayList<>();for(String op:Arrays.asList("create_listener","set_global_breakpoint","wait_for_target","wait_for_breakpoint","step_over","step_into","continue","get_stack","get_variables","get_source","get_breakpoints","set_breakpoint","drop_breakpoint","abort_target","set_connection_timeout","set_operation_timeout"))rows.add(row("proname","plsql_pldbg_"+op));
                }
                else if(sql.contains("FROM sys_type")){
                    boolean parameter=sql.contains("CROSS JOIN");long oid=((Number)params.get(parameter?2:1)).longValue();
                    rows=one("parameter_name",parameter?(parameterNames==null?parameterName:parameterNames.get((Integer)params.get(1)-1)):null,"type_schema",oid==10006?"demo_user":"pg_catalog","type_name",oid==10006?"demo_cursor.t_cursor":oid==1790?"refcursor":oid==1043?"varchar":"int4","base_oid",oid==10006?1790L:0L);
                }
                else if(sql.contains("p.oid=CAST"))rows=one("oid",10001L,"schema_name","demo_user","routine_name","probe","kind",kind,"return_schema",returnType.equals("demo_cursor.t_cursor")?"demo_user":"pg_catalog","return_type",returnType,"return_base_oid",returnType.equals("demo_cursor.t_cursor")?1790L:0L,"all_oids",allOids,"source","\nDECLARE\n  v_total integer;\nBEGIN\n  v_total := 7;\nEND;\n","input_oids",inputOids,"input_count",inputOids.isEmpty()?0:inputOids.split("\\s+").length,"argument_modes",argumentModes);
                else if(sql.contains("FROM sys_proc")){
                    catalogParams=new HashMap<>(params);rows=new ArrayList<>();
                    for(int i=0;i<catalogRows;i++)rows.add(row("oid",10001L+i,"schema_name","demo_user","routine_name","probe","kind","p","arguments","p_seed integer","input_count",1,"argument_modes",null));
                }
                else if(sql.contains("set_connection_timeout")||sql.contains("set_operation_timeout")){settings.add(index+":"+sql);rows=one("value",15);}
                else if(sql.contains("create_listener"))rows=one("handle",1);
                else if(sql.contains("set_global_breakpoint")){
                    if(failArming)throw new SQLException("invalid session","XX000");
                    if(!sql.contains("CAST(? AS oid)")||!Objects.equals(params.get(4),pid+1))throw new AssertionError("OID cast or PID restriction missing");rows=one("armed",true);
                }
                else if(sql.contains("wait_for_target")){
                    while(!entered.await(20,TimeUnit.MILLISECONDS)){if(isClosed.get()||cancelled.get())throw new SQLException("cancelled","57014");}rows=one("pid",pid+1);
                }
                else if(sql.contains("wait_for_breakpoint")||sql.contains("step_over")||sql.contains("step_into"))rows=one("func",10001L,"linenumber",5,"targetname","probe(integer)");
                else if(sql.contains("pldbg_continue")){
                    complete.countDown();
                    // Kingbase can keep this controller call blocked after the target exits.
                    while(!isClosed.get()&&!cancelled.get())Thread.sleep(10);
                    throw new SQLException("cancelled","57014");
                }
                else if(sql.contains("get_variables"))rows=one("name","v_total","dtype",23,"value","7");
                else if(sql.contains("get_stack"))rows=one("server_frame_depth",0,"targetname","probe(integer)","func",10001L,"linenumber",5);
                else if(sql.contains("get_breakpoints"))rows=one("func",10001L,"linenumber",5,"targetname","");
                else if(sql.contains("get_source"))rows=one("source","\nDECLARE\nBEGIN\nEND;\n");
                else if(sql.contains("abort_target")){complete.countDown();rows=one("success",true);}
                else if(sql.contains("set_breakpoint")||sql.contains("drop_breakpoint"))rows=one("success",true);
                else throw new AssertionError("Unhandled SQL: "+sql);
                return resultSet(rows);
            }
            return zero(method.getReturnType());
        });
    }
    static ResultSet resultSet(List<Map<String,Object>> rows){
        List<String> columns=rows.isEmpty()?Collections.emptyList():new ArrayList<>(rows.get(0).keySet());AtomicInteger cursor=new AtomicInteger(-1);
        ResultSetMetaData meta=proxy(ResultSetMetaData.class,(obj,m,a)->{if(m.getName().equals("getColumnCount"))return columns.size();if(m.getName().equals("getColumnLabel"))return columns.get((Integer)a[0]-1);return zero(m.getReturnType());});
        return proxy(ResultSet.class,(obj,m,a)->{if(m.getName().equals("next"))return cursor.incrementAndGet()<rows.size();if(m.getName().equals("getMetaData"))return meta;if(m.getName().equals("getObject"))return rows.get(cursor.get()).get(columns.get((Integer)a[0]-1));return zero(m.getReturnType());});
    }
    public static ResultSet cursor(String[] labels,String[] types,String[][] values){
        AtomicInteger position=new AtomicInteger(-1);AtomicBoolean closed=new AtomicBoolean();
        ResultSetMetaData meta=proxy(ResultSetMetaData.class,(obj,m,a)->{
            if(m.getName().equals("getColumnCount"))return labels.length;
            if(m.getName().equals("getColumnLabel"))return labels[(Integer)a[0]-1];
            if(m.getName().equals("getColumnTypeName"))return types[(Integer)a[0]-1];
            return zero(m.getReturnType());
        });
        return proxy(ResultSet.class,(obj,m,a)->{
            if(m.getName().equals("next")){if(cursorReadFails)throw new SQLException("cursor read failure");return position.incrementAndGet()<values.length;}
            if(m.getName().equals("getMetaData"))return meta;
            if(m.getName().equals("getString"))return values[position.get()][(Integer)a[0]-1];
            if(m.getName().equals("close")&&closed.compareAndSet(false,true))transactionEvents.add("cursor:close");
            return zero(m.getReturnType());
        });
    }
    public boolean acceptsURL(String s){return true;} public DriverPropertyInfo[] getPropertyInfo(String s,Properties p){return new DriverPropertyInfo[0];} public int getMajorVersion(){return 8;}public int getMinorVersion(){return 6;}public boolean jdbcCompliant(){return false;}public Logger getParentLogger(){return Logger.getAnonymousLogger();}
}
