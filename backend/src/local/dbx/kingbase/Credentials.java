package local.dbx.kingbase;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CompletableFuture;

/** The UI receives presence only. Secret data travels over private process pipes. */
interface PasswordVault {
    boolean available();
    default String label() { return "系统凭据存储"; }
    boolean has(JsonObject profile);
    String get(JsonObject profile);
    void put(JsonObject profile, String password);
    void remove(JsonObject profile);
}

final class Credentials implements PasswordVault {
    private final Path helper;
    private final boolean windows = System.getProperty("os.name", "").startsWith("Windows");
    private final boolean mac = System.getProperty("os.name", "").startsWith("Mac");
    Credentials() {
        Path candidate = null;
        try {
            Path location = Paths.get(Main.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (Files.isRegularFile(location)) candidate = location.getParent().resolve(windows ? "credential-helper.exe" : "keychain-helper");
        } catch (Exception ignored) {}
        helper = candidate;
    }
    public boolean available() { return (mac || windows) && helper != null && Files.isRegularFile(helper) && Files.isExecutable(helper); }
    public String label() { return windows ? "Windows 凭据管理器" : mac ? "macOS 钥匙串" : "系统凭据存储"; }
    // Bind an entry to its exact destination. Renaming a connection or changing its driver does not alter identity.
    static String account(JsonObject p) {
        String id = Main.Profiles.id(p);
        String identity = Main.JSON.toJson(Arrays.asList(Main.str(p,"host",""),Main.str(p,"port",""),Main.str(p,"database",""),Main.str(p,"username","")));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();for(byte b : digest) hex.append(String.format("%02x",b & 255));
            return id + ":" + hex;
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public boolean has(JsonObject p) { return available() && call("has",p,null).get("found").getAsBoolean(); }
    public String get(JsonObject p) {
        JsonObject reply = call("get",p,null);
        if (!reply.get("found").getAsBoolean()) throw new Main.Failure(-32024,"此连接没有已保存密码，请在本地输入密码");
        return reply.get("password").getAsString();
    }
    public void put(JsonObject p,String password) { call("set",p,password); }
    public void remove(JsonObject p) { if(available())call("delete",p,null); }
    private JsonObject call(String operation,JsonObject profile,String password) {
        if (!available()) throw new Main.Failure(-32024,label()+"组件不可用，请取消记住密码后连接");
        Process process = null;
        try {
            JsonObject request = new JsonObject();request.addProperty("operation",operation);request.addProperty("account",account(profile));
            if(password != null) {
                if(password.length()>16384) throw new Main.Failure(-32602,"密码长度超过上限");
                if(windows && password.getBytes(StandardCharsets.UTF_8).length>2551) throw new Main.Failure(-32602,"Windows 记住密码最多支持 2551 个 UTF-8 字节，请取消记住密码后连接");
                request.addProperty("password",password);
            }
            // Never pass a password in arguments, environment, a shell command, logs or a temporary file.
            process = new ProcessBuilder(helper.toString()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            final InputStream stream = process.getInputStream();
            CompletableFuture<byte[]> response = CompletableFuture.supplyAsync(() -> {
                try { return stream.readNBytes(128*1024); }
                catch(IOException e) { throw new UncheckedIOException(e); }
            });
            try(OutputStream input=process.getOutputStream()) { input.write(Main.JSON.toJson(request).getBytes(StandardCharsets.UTF_8)); }
            if (!process.waitFor(90,TimeUnit.SECONDS)) throw new IOException("timeout");
            byte[] bytes = response.get(2,TimeUnit.SECONDS);
            if(process.exitValue()!=0 || bytes.length>=128*1024) throw new IOException("helper");
            JsonObject result = JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8)).getAsJsonObject();
            if(!result.has("ok") || !result.get("ok").getAsBoolean()) {
                int status = result.has("status") ? result.get("status").getAsInt() : 0;
                throw new Main.Failure(-32024,"无法访问 "+label()+"（状态 "+status+"）。请检查系统访问权限，或取消记住密码并手动输入。");
            }
            return result;
        } catch (Main.Failure e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt();throw new Main.Failure(-32024,label()+"操作已取消"); }
        catch (Exception e) { throw new Main.Failure(-32024,label()+"操作未完成，请重试或取消记住密码后连接"); }
        finally { if(process!=null && process.isAlive())process.destroyForcibly(); }
    }
}
