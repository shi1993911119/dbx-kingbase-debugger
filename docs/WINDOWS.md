# Windows 10／11 x64 安装说明（0.9.3）

安装文件：`io.github.shi1993911119.kingbase-debugger-0.9.3-windows-x64.dbxp`。这是 DBX 插件安装包，不是独立 EXE。面向 64 位 Intel／AMD Windows，不支持 32 位 Windows。插件未签名，尚未上架市场。

## 接收方准备

1. 安装 Windows x64 版 DBX，版本需满足 `>=0.6.65-beta.20261103.1`，并支持插件 Host API v1。建议与发送方使用相同版本。
2. 安装 64 位 Java 11 或以上，可用 Java 17／21。无需安装 Go、Node.js 或编译工具。插件不自带 Java。已安装 DBeaver 时也会尝试查找其自带的 JRE。
3. 将官方 Kingbase JDBC JAR 放在本机固定目录，例如 `C:\drivers\kingbase8-8.6.0.jar`。此专有驱动不随插件分发；若有权转交，可由发送方另行提供。不能填写发送方的 Mac 路径。
4. 数据库需为支持现有 PL/SQL 调试 API 的 KingbaseES Oracle 兼容模式；已验证的服务器版本为 `V008R006C007B0024`、`plsql_pldbgapi 1.3`。接收方账号需有目标对象和调试接口权限。

## 安装与使用

1. 在 DBX「插件中心 → 设置」允许手动安装未签名开发包，再选择 `.dbxp` 安装。
2. 点击顶部「金仓调试」。若入口未显示，开启「插件中心 → 设置 → 全局配置 → 显示插件快捷入口」。
3. 在插件「连接管理…」新建连接，填写接收方可达的主机、端口、**实际数据库名**、用户名和 Windows 本地 JDBC 路径。不要默认填 `postgres`，应与实际库名一致。
4. 在本地输入密码，先点「测试」，再点「保存并连接」。需要记住时勾选「记住密码（Windows 凭据管理器）」；保存后密码框留空可复用。
5. 选择模式，按名称搜索过程／函数，逐行填写参数，或者粘贴 DECLARE／BEGIN 调用文本。默认空参数为 NULL，OUT 固定为 NULL；输入后确认开始调试。
6. 连接及密码由每台电脑独立配置。安装包不携带发送方的连接配置、数据库密码或业务数据。

记住密码使用 Windows 凭据管理器，按当前 Windows 用户保存到本机，按插件连接 ID 与主机／端口／库名／用户名绑定。最多保存 2551 个 UTF-8 字节的密码；取消勾选并保存可删除。若系统策略禁止凭据存储，可取消记住后手工连接。升级、正常断开或关闭不会删除已记住的密码。

## 从旧开发版升级

0.9.3 使用正式插件 ID `io.github.shi1993911119.kingbase-debugger`。旧 `local.kingbase.debugger` 的连接与系统凭据不会自动迁移，请在正式版重新配置一次。确认新连接成功后，可卸载旧开发版。

## 0.9.2 按钮修复（历史）

修复 0.9.0／0.9.1 在 Windows Chromium 沙箱内“测试成功，但保存并连接没有反应”的点击问题。DBX 插件 iframe 只开放 `allow-scripts`，未开放 `allow-forms`；旧版依赖原生表单的 submit 事件。0.9.2 将连接、参数确认、粘贴解析改为普通按钮直接处理，连接操作前先检查必填项。连接窗口和参数输入框支持单独按 Enter 确认；粘贴文本中的 Enter 保持换行。

0.9.2 在原开发版 ID 下安装时可保留已有连接和密码；0.9.3 采用上述新 ID，需重新配置。成功连接后窗口自动关闭并加载对象；失败时窗口内显示具体错误并允许重试。该修复已在真实 Chromium 的同类沙箱、实际 UI 点击和合成 RPC 中回归；仍需接收方在 Windows 版 DBX 中回验。

## 调试快捷键

Windows：F8 单步跳过、F7 单步进入、F9 继续、Ctrl+F2 停止、Shift+F9 开始调试（先确认参数）、Ctrl+F8 切换源码选中行断点。先点击工作台使其获得焦点；输入框和弹窗中不触发。键位参照 DataGrip 默认 Windows 键映射。

## 找不到 Java 时

先检查是否安装了 Java 11+。启动器依次尝试 `DBX_KINGBASE_JAVA`、`JAVA_HOME\bin\java.exe`、常见 JDK／DBeaver 目录和 PATH，并跳过 Java 8／9／10。

若 Java 安装在自定义目录，可在 Windows「环境变量」新增用户变量：

- 名称：`DBX_KINGBASE_JAVA`
- 值：本机 `java.exe` 的绝对路径，例如 `C:\Program Files\Microsoft\jdk-21\bin\java.exe`。路径含空格时，变量值不用添加外层双引号。

设置后完全退出并重开 DBX。也可将 `JAVA_HOME` 指向 JDK 根目录。

## 验证范围

具体测试记录见项目 `docs/VALIDATION.md`。Windows x64 二进制在 Windows 11 ARM64 虚拟机的 x64 兼容运行环境验证；尚未在实体 Intel／AMD 电脑上的 DBX 内执行完整调试，也未在 Windows 10 上实测。Kingbase 真实数据库调试的既有验证来自 macOS；接收方首次建议使用独立测试过程检查断点和单步，再调试业务过程。

## 开发者构建

在 Windows 上安装 JDK 11+、Go 1.27.3 与 x64 版官方 `@dbx-app/plugin-cli@0.1.10`，设置 JAVA_HOME，并在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

输出到 `dist/`。可用 `-JavaHome`、`-PluginCli` 和 `-OutputDirectory` 指定工具与输出位置。脚本只构建并打包插件，不连接数据库。
