package local.dbx.kingbase;

import com.google.gson.*;
import com.kingbase8.Driver;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Uses a fresh synthetic-only OS credential item and JDBC double; never a user's saved credential. */
public final class KeychainIntegrationTest {
    public static void main(String[] args)throws Exception {
        Path directory=Files.createTempDirectory("dbx-keychain-integration-");
        Credentials vault=new Credentials();if(!vault.available())throw new AssertionError("Build package before testing credential integration");
        StringWriter out=new StringWriter();Main server=new Main(new PrintWriter(out,true),directory.toString());
        JsonObject profile=new JsonObject();
        profile.addProperty("name","synthetic-keychain-integration");profile.addProperty("host","localhost");profile.addProperty("port",54321);
        profile.addProperty("database","demo_db");profile.addProperty("username","synthetic-user");profile.addProperty("jdbcJar",args[0]);profile.addProperty("timeout",5);
        JsonObject saved=null;
        try {
            String secret="Synthetic 中文 '\" \\ \n $(inert) `inert` "+UUID.randomUUID();
            JsonObject save=new JsonObject();save.add("profile",profile);save.addProperty("passwordAction","store");save.addProperty("password",secret);
            saved=(JsonObject)server.dispatch("profiles/save",save);
            if(!vault.has(saved)||!vault.get(saved).equals(secret))throw new AssertionError("vault store/read");
            if(Files.readString(directory.resolve("debugger-connections.json")).contains(secret))throw new AssertionError("plaintext config");
            server.close();server=new Main(new PrintWriter(out,true),directory.toString());
            JsonObject connect=new JsonObject();connect.addProperty("id",Main.Profiles.id(saved));connect.addProperty("requestToken","synthetic-restart");connect.addProperty("useSavedPassword",true);connect.addProperty("rememberPassword",true);
            Driver.reset();Object result=server.dispatch("profiles/connect",connect);
            if(!secret.equals(Driver.connectionPassword)||Main.JSON.toJson(result).contains(secret))throw new AssertionError("internal-only saved credential use");
            server.dispatch("profiles/disconnect",connect);
            if(!vault.has(saved))throw new AssertionError("disconnect deleted saved secret");
            server.dispatch("profiles/delete",connect);
            if(vault.has(saved)||Driver.calls.get()!=0||out.toString().contains(secret))throw new AssertionError("cleanup or secret disclosure");
            System.out.println("PASS: Java sidecar -> native OS vault save/restart/saved connect/disconnect/delete; synthetic-only credential, JDBC double, no target execution or secret output");
        } finally {
            server.close();if(saved!=null)vault.remove(saved);
            try(java.util.stream.Stream<Path> files=Files.walk(directory)){files.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException e){throw new UncheckedIOException(e);}});}
        }
    }
}
