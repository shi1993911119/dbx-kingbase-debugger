"use strict";
window.KingbaseConnections = Object.freeze({
  async create(host, callbacks) {
    const $ = id => document.getElementById(id);
    const fields = {name:"profileName",host:"profileHost",port:"profilePort",database:"profileDatabase",username:"profileUsername",jdbcJar:"profileJdbcJar",timeout:"profileTimeout"};
    let profiles = [], currentId = "", editId = "", token = "", pendingId = "", pending = null, closing = false, loading = false, vaultAvailable = false, passwordChoiceTouched = false;
    let vaultLabel = "系统凭据存储";
    const defaults = () => ({name:"金仓调试",host:"",port:54321,database:"",username:"",jdbcJar:"",timeout:30});
    const invoke = (method, params = {}) => host.invoke(method, params, {timeoutMs:150000});
    const selected = () => profiles.find(p => p.id === editId);
    function message(text, error = false) { $("profileMessage").textContent = text; $("profileMessage").classList.toggle("error", error); }
    function render() {
      const locked = !!pending || loading || callbacks.isLocked(), connected = !!selected()?.connected;
      for (const id of Object.values(fields)) $(id).disabled = locked || connected;
      $("profilePassword").disabled = locked || connected;
      $("profileRememberPassword").disabled = locked || connected || !vaultAvailable;
      const saved = savedPasswordMatches();
      $("profilePassword").placeholder = saved ? "已保存，留空使用；输入可更换" : "请输入数据库密码";
      $("profilePasswordStatus").textContent = !vaultAvailable ? `${vaultLabel}组件不可用，密码仅本次使用` : selected()?.passwordStatusUnknown ? `暂时无法确认${vaultLabel}状态，可手动输入密码` : saved ? "已保存密码；取消勾选并保存可删除" : "尚未保存密码";
      for (const id of ["profileSelect","profileNew","connectionClose"]) $(id).disabled = locked;
      $("profileDelete").disabled = locked || !editId || connected;
      $("profileSave").disabled = locked || connected;
      $("profileTest").disabled = locked || connected;
      $("profileConnect").disabled = locked;
      $("profileDisconnect").disabled = locked || !currentId;
      $("profileConnect").textContent = connected ? "返回调试" : "保存并连接";
      $("profileDeleteConfirmButton").disabled = locked;
      $("profileDeleteCancel").disabled = locked;
    }
    function fill(profile) {
      editId = profile?.id || "";
      const values = profile || defaults();
      for (const [key,id] of Object.entries(fields)) $(id).value = values[key] ?? "";
      $("profilePassword").value = "";
      $("profileRememberPassword").checked = !!profile?.passwordSaved;
      passwordChoiceTouched = false;
      $("profileSelect").value = editId;
      $("profileDeleteConfirm").hidden = true;
      message(profile?.connected ? "此连接正在使用。可直接返回调试；编辑配置前请先断开连接。" : "可选择记住密码。已保存密码时留空即可连接，输入新密码可更换。");
      render();
    }
    function read() {
      if (!$("connectionForm").reportValidity()) throw new Error("请填写完整的连接信息。");
      const profile = {};
      if (editId) profile.id = editId;
      for (const [key,id] of Object.entries(fields)) profile[key] = ["port","timeout"].includes(key) ? Number($(id).value) : $(id).value.trim();
      return profile;
    }
    function savedPasswordMatches() {
      const p = selected();
      return !!p?.passwordSaved && ["host","port","database","username"].every(key => String(p[key]) === $(fields[key]).value.trim());
    }
    function passwordRequest(includeRemember = false) {
      const password = $("profilePassword").value, remember = $("profileRememberPassword").checked;
      const result = {useSavedPassword: password === "" && remember && savedPasswordMatches()};
      if (!result.useSavedPassword) result.password = password;
      if (includeRemember && vaultAvailable && (remember || selected()?.passwordSaved || passwordChoiceTouched)) result.rememberPassword = remember;
      return result;
    }
    async function refresh(preferred = editId, keepFields = false) {
      const result = await invoke("profiles/list");
      if (closing) return;
      if (!Array.isArray(result.items)) throw new Error("插件连接列表格式无效。");
      profiles = result.items;
      vaultAvailable = result.passwordStorageAvailable === true;
      vaultLabel = ["Windows 凭据管理器","macOS 钥匙串"].includes(result.passwordStorageLabel) ? result.passwordStorageLabel : "系统凭据存储";
      $("profilePasswordLabel").textContent = `记住密码（${vaultLabel}）`;
      $("connectionHelp").textContent = `配置保存在插件内，从顶部“金仓调试”进入。勾选“记住密码”后保存到${vaultLabel}，下次留空即可使用。`;
      currentId = profiles.find(p => p.connected)?.id || "";
      $("profileSelect").replaceChildren(new Option("新建连接", ""));
      for (const p of profiles) $("profileSelect").append(new Option(`${p.name} · ${p.database}${p.connected ? " · 已连接" : ""}`, p.id));
      const choice = profiles.find(p => p.id === preferred) || profiles.find(p => p.connected) || profiles[0];
      if (keepFields) { editId = preferred; $("profileSelect").value = preferred; render(); }
      else fill(choice);
    }
    function run(fn, validate = false) {
      if (pending || loading || closing || callbacks.isLocked()) return Promise.resolve();
      // Validate before render disables fields; disabled inputs are excluded
      // from constraint validation by the browser.
      if (validate && !$("connectionForm").reportValidity()) {
        message("请填写完整且有效的连接信息。", true); return Promise.resolve();
      }
      // Assign before the first async operation so repeated clicks cannot start another request.
      pending = Promise.resolve().then(fn).catch(error => { if (!closing) message(error.message || String(error), true); }).finally(() => {
        pending = null; pendingId = ""; callbacks.onBusy(false); if (!closing) render();
      });
      callbacks.onBusy(true); render(); return pending;
    }
    async function save(applyPassword = false) {
      const request = {profile: read()};
      if (applyPassword && vaultAvailable) {
        if ($("profileRememberPassword").checked && ($("profilePassword").value !== "" || !savedPasswordMatches())) { request.passwordAction = "store"; request.password = $("profilePassword").value; }
        else if (!$("profileRememberPassword").checked && (selected()?.passwordSaved || passwordChoiceTouched)) request.passwordAction = "remove";
      }
      const profile = await invoke("profiles/save", request);
      if (closing) return profile;
      editId = profile.id;
      // Refresh only non-secret data; keep the locally typed password until test/connect completes.
      await refresh(editId, true);
      return profile;
    }
    async function connect() {
      if (selected()?.connected) { $("connectionDialog").close(); return; }
      message("正在保存连接配置……");
      const credentials = passwordRequest(true);
      const profile = await save();
      if (closing) return;
      pendingId = profile.id;
      token = `connect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      $("profilePassword").value = "";
      message("正在建立执行与控制连接，并检查调试接口……");
      const result = await invoke("profiles/connect", {id: profile.id, ...credentials, requestToken: token});
      currentId = profile.id;
      if (closing) { await invoke("profiles/disconnect", {id: currentId, requestToken: token}); return; }
      await refresh(currentId);
      await callbacks.onConnected(result.profile, result.status);
      $("connectionDialog").close();
    }
    async function disconnect() {
      const id = currentId;
      if (!id) return;
      message("正在关闭两条调试连接……");
      await invoke("profiles/disconnect", {id, requestToken: token});
      currentId = ""; token = "";
      await callbacks.onDisconnected();
      await refresh(editId);
      message(selected()?.passwordSaved ? `连接已断开。已保存密码仍在${vaultLabel}，可直接重新连接。` : "连接已断开，本次密码已从内存清除。");
    }
    window.KingbaseForms.bind("connectionForm", "profileConnect", () => run(connect, true));
    $("profileSave").addEventListener("click", () => run(async () => {await save(true); if(selected()?.passwordSaved && $("profileRememberPassword").checked)$("profilePassword").value = ""; message(selected()?.passwordSaved ? `配置已保存，密码保存在${vaultLabel}。下次留空即可连接。` : "配置已保存，未保存密码。");}, true));
    $("profileTest").addEventListener("click", () => run(async () => {
      message("正在测试两条 JDBC 连接与调试接口……");
      const result = await invoke("profiles/test", {profile: read(), ...passwordRequest()});
      if (!closing) message(`测试通过 · ${result.preflight.database} · 执行 ${result.preflight.targetPid} ／ 控制 ${result.preflight.controlPid}`);
    }, true));
    $("profileDisconnect").addEventListener("click", () => run(disconnect));
    $("profileNew").addEventListener("click", () => {fill(null); $("profileName").focus();});
    $("profileSelect").addEventListener("change", () => fill(profiles.find(p => p.id === $("profileSelect").value)));
    $("profileRememberPassword").addEventListener("change", () => {passwordChoiceTouched = true; render();});
    for(const key of ["host","port","database","username"]) $(fields[key]).addEventListener("input",render);
    $("profileDelete").addEventListener("click", () => {$("profileDeleteText").textContent = `删除连接配置“${selected()?.name}”？`; $("profileDeleteConfirm").hidden = false;});
    $("profileDeleteCancel").addEventListener("click", () => {$("profileDeleteConfirm").hidden = true;});
    $("profileDeleteConfirmButton").addEventListener("click", () => run(async () => {await invoke("profiles/delete", {id: editId}); editId = ""; await refresh(); message("连接配置已删除。");}));
    $("connectionClose").addEventListener("click", () => {if (!pending && !loading) {$("profilePassword").value = ""; $("connectionDialog").close();}});
    $("connectionDialog").addEventListener("cancel", event => {if (pending || loading) event.preventDefault();});
    $("connectionDialog").addEventListener("close", () => {$("profilePassword").value = ""; $("profileDeleteConfirm").hidden = true;});
    const manager = {
      async open() {
        if (pending || loading || closing || callbacks.isLocked()) return;
        $("connectionDialog").showModal(); loading = true; render();
        try {await refresh(currentId || editId);} catch(error) {message(error.message || String(error), true);}
        finally {loading = false; render();}
        (selected()?.connected || (savedPasswordMatches() && $("profileRememberPassword").checked) ? $("profileConnect") : $("profilePassword")).focus();
      },
      async dispose() {
        closing = true;
        if (pending) await pending;
        if (currentId) await invoke("profiles/disconnect", {id: currentId, requestToken: token});
        $("profilePassword").value = "";
      },
      notifyClose() {
        closing = true; $("profilePassword").value = "";
        const id = pendingId || currentId;
        if (id) host.notify("profiles/disconnect", {id, requestToken: token});
      }
    };
    await refresh();
    if (currentId) await callbacks.onConnected(profiles.find(p => p.id === currentId));
    else await manager.open();
    return manager;
  }
});
