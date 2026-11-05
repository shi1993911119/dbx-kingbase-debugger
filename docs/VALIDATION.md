# 验证记录 · 2026-11-03 至 2026-11-05

> 隐私说明：本记录已脱敏。连接名、数据库名、用户名、模式名、业务过程与参数名称、业务输入值均已替换为虚构示例；会话 PID 和自定义对象 OID 已省略。历史验证结论及功能限制保留，示例名称不代表当时的真实环境。

## 0.9.3 首次市场候选包 · 2026-11-05

正式 ID `io.github.shi1993911119.kingbase-debugger`、发布者 `shi1993911119`；manifest、Java 后端、contribution IDs 和两平台凭据服务命名空间已一致更新。旧开发版连接与密码不自动迁移。构建使用临时 staging，源码不再跟踪生成的 Java JAR 和 native helper；只随包分发项目 LICENSE 与 THIRD-PARTY.md、Gson、Go 许可证、必要运行文件和 UI。

两平台均由官方 CLI **0.1.10** 和 Go **1.27.3** 实际构建。macOS 使用 Azul JDK 11.0.16.1、系统 Swift；Windows 使用经微软 SHA-256 校验的 Microsoft OpenJDK 21.0.9+10 x64，在 Windows 11 ARM64 的 x64 兼容环境原生打包。Go 下载按官方 SHA-256、Windows CLI 按 npm registry SHA-512 校验。Gson 2.14.0 与 Maven Central 官方 JAR 逐字节一致，校验值见 THIRD-PARTY.md。Windows 共享路径上的 helper 构建禁用 VCS stamping，避免跨 OS Git 目录所有权检查影响构建；发布来源以固定 tag 和包 SHA-256 记录。

通过的验证：

- 源码与最终打包的 Java 后端均通过 152 项断言；六组 JavaScript 测试与两平台快捷键通过。实际 macOS Chrome 的 allow-scripts-only iframe 中点击、参数确认、粘贴、回车与 F8 回归通过，RPC 为合成替身。
- `scripts/verify-packages.py` 对两个最终包逐项核对：完整 checksum 覆盖、manifest 身份/版本/权限、原生架构、Java class major 55、UI/图标与当前源码逐字节一致、许可证与 Gson 来源、精确文件白名单、未签名状态、凭据/私有 IP/本机路径扫描。包内无测试 JDBC、专有驱动、配置文件或其他平台 helper。
- macOS 最终 Go launcher → Java 初始化返回正式 ID/0.9.3，临时目录 profiles/list 为空，EOF 正常退出；新随机合成钥匙串项保存/读取/替换/空值/删除，以及打包 Java 后端重建后使用已保存合成密码连接 JDBC 替身、断开保留和删除均通过。
- Windows 最终包从含空格与中文路径解压运行：原生凭据管理器合成项的保存/状态/读取/替换/空值/2551 字节边界/超限拒绝/删除通过；RPC 初始化与空连接列表通过；EOF 与强制结束 launcher 后 Java 进程清理通过。152 后端断言与打包 Java → native helper 集成通过。两个 Go 模块在 Windows test/vet 通过，Mac launcher 的 test/vet 通过。
- 对全部 58 个既存可达 Git blob（含嵌套 JAR）以及当前源码、新包中的原数据库/业务标记扫描无命中；Mac 原生文件未包含本机 home 路径。发布前再对最终 Git 提交和两包检查。
- 官方 dbx-store checkout 的 `node scripts/validate.mjs --plan-candidates` 通过，提交仅含 publisher、candidate 与自动发现源登记。普通校验会在候选等待商店签名时按设计失败。该检查不证明公开下载链接可达或审核已通过。

本轮全部测试使用合成数据与 JDBC 替身，不访问业务数据库、不读取既存密码。尚未在新 ID 的 DBX GUI 内执行实库调试；实体 Intel/AMD Windows、Windows 10 和 Windows DBX 内完整联调仍未验证。历史实库能力见下方记录。已提供 GitHub Actions 工作流，尚未实际执行托管 CI，不能将其视为本轮通过证据。

0.9.3 最终候选 SHA-256：

- darwin-arm64：`17f2808f768ad32d1fdba4187ab479d3f2b6ed41d136f11798de09437bece187`（2274453 bytes）。
- windows-x64：`8a8428a2cc10c80a45a688672a934b23057d13decb8afb68238b5302809c2e72`（3778209 bytes）。

## 仓库脱敏复验 · 2026-11-05

连接示例、业务调用夹具及对应测试均已改用合成数据。新建连接的数据库字段留空；模式名在连接后从当前用户读取，可手动修改，不再包含固定的本地环境名称。

脱敏后重新通过：152 项后端断言、六组 JavaScript 测试（调试 UI、调用解析、导入 UI、连接管理、面板布局、两平台快捷键），以及真实 Chromium 的 allow-scripts-only 沙箱回归。本轮测试全部使用替身，没有连接真实数据库或读取既存凭据。已对 Git 跟踪文件扫描原有连接与业务标识，未发现残留。

以下为历史版本的验证记录；包校验值和源码一致性结论仅对应当时构建的历史发行包。此处脱敏复验当时未重建发行包；后续 0.9.3 重建见上节。

## 0.9.2 Windows 沙箱内按钮无响应修复

验证日期：2026-11-04。用户报告 Windows 上测试连接成功，但“保存并连接”无响应；macOS 正常。DBX 官方插件文档将工作台 iframe 指定为 `sandbox="allow-scripts"`，没有 `allow-forms`。旧版连接、参数确认与粘贴解析使用 `type="submit"` 并只监听表单 submit，Chromium 在此沙箱中拦截原生表单提交，submit 监听不会触发。

新增真实浏览器回归 `scripts/test-browser-forms.cjs`。使用 macOS 上实际 Google Chrome 的 Chromium 引擎，加载实际 UI 的内联副本到只有 allow-scripts 权限的 srcdoc iframe，并实际点击按钮；连接、凭据状态、对象和调试 RPC 都是合成替身，不连接数据库。将 0.9.1 原包解出的未修改 UI 交给同一脚本，已复现“测试通过，但点击连接不发送 profiles/save／profiles/connect 请求”。0.9.2 改用普通按钮直接响应 click 后，同一路径成功完成保存与连接、关闭连接窗口并加载对象。

回归还覆盖：密码留空时 useSavedPassword=true 且不向界面回填密码、参数保存不执行目标、开始前确认、粘贴文本解析及 textarea 回车换行、参数输入框回车确认、密码框回车只连接一次、真实 F8、失败显示错误并可重试，以及无效连接配置不发送保存／测试／连接请求。连接校验移到禁用输入控件之前。六组既有 JavaScript 测试均通过，包含 Windows／macOS 快捷键映射；152 项后端断言通过，Mac 真实钥匙串 helper 的合成凭据集成测试通过。

构建：0.9.2 macOS arm64 与 Windows x64 均由官方 CLI 0.1.9 打包。Windows 最终包在 Windows 11 ARM64 的 x64 兼容环境通过启动器 JSON-RPC、EOF／强制退出进程清理、系统凭据读写边界、152 项后端断言和 Java 到 helper 的合成凭据集成测试。两个包的 UI／资源与源码逐字节相同、确认按钮类型和 forms.js 加载顺序正确、平台二进制架构正确、Java 11 字节码／版本一致，完整 checksums 与 artifact metadata 均通过。

额外尝试通过虚拟机命令通道启动 Windows Edge 进行同类沙箱测试，但 Edge 在启动阶段退出（1002），没有执行到页面测试。真实点击证据来自上述 macOS Chrome；尚未在 Windows 版 DBX 图形工作台内或接收方实体电脑上回验，也未连接业务数据库。此前 JSDOM 测试直接派发表单 submit 事件，未覆盖原生点击被沙箱拦截的情况；现已将主要测试路径改为按钮 click 并加入真实浏览器回归。现有已安装的 Mac 插件及历史发行包保留。

0.9.2 包 SHA-256：

- Windows x64：`5a051262cb789c9fb80ec1fa560db2cffbd0e92cff5bfd388e69b71b72227320`。
- macOS arm64：`e5fe5c6face389b8f2537bedd6194c0a341b6d3902b60811965bf5805861fa82`。


## 0.9.1 DataGrip 默认调试快捷键

验证日期：2026-11-04。按 JetBrains 官方 DataGrip Windows／macOS 默认键位，将插件现有操作绑定到工作台内键盘事件。两平台均为 F8 单步跳过、F7 单步进入。Windows 使用 F9 继续、Ctrl+F2 停止、Shift+F9 开始、Ctrl+F8 切换断点；macOS 使用 Command+Option+R 继续、Command+F2 停止、Control+D 开始、Command+F8 切换断点。按钮可见提示、title 和 aria-keyshortcuts 随平台更新。

开始快捷键沿用参数确认窗口。行断点按聚焦源码行号／文本选区、最后点击行、当前执行行确定；单步进入其他对象时不会沿用原对象的选中行。重绘保留同一对象中行号按钮的焦点；所选源码行有细线提示。键盘操作与按钮共用已启用状态及 action 路径，不使用宿主全局快捷键。

新增 scripts/test-shortcuts.cjs 在 Windows 与 macOS 两种浏览器平台信息下验证：键位与修饰键、按钮提示与无障碍属性、开始只打开确认窗口、暂停／运行／禁用／失败恢复状态、当前／点击／聚焦／文本选区行断点与 OID 切换、忽略长按／IME／输入框／下拉框／contenteditable／所有弹窗、单步在途不重复提交、停止仍可取消在途单步、停止在途不允许新单步或断点、pagehide 清除监听。使用 JSDOM、合成会话和 RPC 替身，不连接数据库。上述测试两平台均通过；原有五组 UI／解析器测试和 152 项后端断言通过。

构建：0.9.1 macOS arm64 与 Windows x64 通过官方 CLI 打包，旧包与现有已安装插件保留。Windows 0.9.1 最终包另在既有 Windows 11 ARM64 的 x64 兼容环境通过真实启动器 JSON-RPC、EOF／强制退出清理、凭据管理器读写边界、152 项后端断言和 Java 到 helper 的合成凭据集成检查；未连接数据库。两平台最终包的 UI 与当前源码逐字节一致、平台二进制架构正确、Java 11 字节码和版本一致、全部 checksum 与 metadata 完整通过复核。

本轮未在 DBX 图形工作台内发送真实键盘事件，未执行真实数据库过程；快捷键行为的验证来自 DOM 事件自动化，数据库调用路径沿用既有调试命令。浏览器工具不允许打开本地 file 页面，未绕过此限制。

键位依据：
- https://www.jetbrains.com/help/datagrip/reference-keymap-win-default.html
- https://www.jetbrains.com/help/datagrip/reference-keymap-mac-default.html
- https://www.jetbrains.com/help/datagrip/debugging-code.html


## 0.9.0 Windows x64：构建与独立运行检查通过

验证日期：2026-11-04。构建目标为 Windows 10／11 x64（AMD64），Java 核心保持 `--release 11`。在现有 Windows 11 ARM64 虚拟机（10.0.26200.9711）的 x64 兼容运行环境，用 Go 1.27.3 windows/amd64、Microsoft OpenJDK 21.0.9+10 x64 与官方 DBX plugin CLI 0.1.9 x64 实际构建。Go 下载按官方 SHA-256、CLI npm 包按 registry SHA-512、JDK 按微软官方 SHA-256 校验。工具只放在本次专用临时目录，没有改全局 Java 或 DBX 配置。

新增平台适配：Windows Java 启动器支持环境变量、常见 JDK／DBeaver 目录和 PATH；解析版本并跳过 Java 8／9／10；保留 JSON-RPC 标准输入输出。启动前创建私有 kill-on-close Job Object，启动器退出／被强制终止时清理 Java 和后代进程。原 macOS 路径继续使用 syscall.Exec。Windows helper 通过 CredReadW／CredWriteW／CredDeleteW 访问本插件固定命名空间的通用凭据，按本机当前用户持久化，不枚举其他条目；密码只走管道。界面根据平台显示 Windows 凭据管理器／macOS 钥匙串。Windows 的 2560 字节 blob 上限扣除 9 字节封装后最多保存 2551 字节密码。

官方 CLI 最初在 Mac 共享目录清理 staging 时报告 Windows error 87；构建脚本改为在原生 Windows 临时目录打包，成功后复制两个交付文件到项目 dist，最终完整构建成功。实际 `.dbxp` 的 manifest 指向 `bin/windows-x64/dbx-kingbase-debugger.exe`；两份 EXE 的 PE machine 均为 0x8664；Java 核心 class major 均为 55。checksums.json 覆盖包中全部其他文件，逐个 SHA-256 复核通过；artifact metadata 的 target／size／sha256 与最终文件一致。包内包含许可证，没有 Mac helper、Kingbase 专有 JDBC、测试替身、连接配置或数据库密码。

通过的实际 Windows 自动化：

- Windows Credential Manager：全新随机合成条目的保存、有无状态、读取、替换、空密码、2551 字节边界、超限拒绝与幂等删除；测试后删除条目，不打印密码、不读取任何既存用户凭据。
- 从含空格与中文的独立解压目录启动最终包：plugin/initialize、profiles/list、系统密码存储标签及可用性通过，标准输出只包含 JSON-RPC；stdin EOF 后 launcher 与 Java 正常退出；强制结束 launcher 后 Java 被 Job Object 清理。
- 使用最终包的 Java JAR 与 native helper，临时配置和 JDBC 测试替身完成保存、后端重建后免输密码连接、断开保留和删除；不连接数据库、不调用目标过程。
- 152 项后端断言在 Windows 与 macOS 均通过；Windows Go launcher 的版本解析测试、helper 的 CREDENTIALW x64 ABI 布局测试通过，两个 Go 组件的 Windows go vet 通过。
- 五组 UI／解析器自动化通过：调试和参数、连接管理、调用文本解析、文本导入、拖动布局；新增两平台密码存储标签检查通过。macOS 的真实 helper 合成凭据集成测试仍通过。

范围：本轮没有操作 DBeaver，没有连接业务数据库。Windows 测试通过 Parallels 命令通道在隔离目录运行；尚未在实体 Intel／AMD Windows、Windows 10 或 Windows 版 DBX 图形界面内完成调试联调。真实 Kingbase 数据库断点／单步的既有结果来自下方 macOS 验证记录。现有已安装的 macOS 0.8.0 插件和旧发行包未更改。

## 0.8.0 记住密码：自动化、系统钥匙串与安装已通过

验证日期：2026-11-04。新增可选“记住密码（macOS 钥匙串）”，保留插件内部连接管理与顶部入口。连接 JSON 仍只保存八个非密码字段；密码由固定 service 的本机 Security helper 管理。密码不进入命令行、环境变量、临时文件或日志；Java 与 helper 使用进程管道交换，前端只接收有无密码的布尔状态。

后端 152 项断言通过。新增覆盖显式保存、更换与删除、列表只返回状态、测试与连接内部读取、关闭后新后端仍可使用、断开不删除、按主机／端口／库／用户名绑定、改目的地不复用并移除旧项、重命名保留、钥匙串拒绝访问时列表仍可读、保存失败关闭候选连接，以及失败连接不得覆盖已有密码。测试使用内存凭据存储与 JDBC 替身；原有调试、游标与连接生命周期断言均保留。

系统钥匙串独立测试通过：每轮只创建全新随机 UUID 项，使用合成密码验证保存、有无状态、读取、替换、空密码和删除，最终清理该项。首轮发现 macOS SecItemUpdate 对空 Data 的替换不符合预期，最终使用非空版本前缀封装密码内容，修复后上述测试通过。没有读取用户已保存的凭据，也没有打印测试密码。

Java 到本机 helper 的集成测试通过：使用临时插件配置目录、全新随机合成凭据、JDBC 替身，从真实打包 JAR 保存到钥匙串；关闭后新建 Main 实例，密码不经 UI 回填即可连接；断开仍保留、删除后条目不存在。使用工作区构建和 DBX 已安装的 0.8.0 运行文件分别完成同一集成检查，不连接真实数据库、不执行过程。测试后条目与临时配置均清理。

连接窗口自动化覆盖勾选保存、使用已保存密码时不传明文、密码框留空与状态提示、只在连接成功后记住、取消记住并保存删除、连接失败保留旧值、目的地更改不沿用以及组件不可用的手动输入路径；原有单例入口、参数草稿、重复提交与关闭竞态测试通过。原搜索、IN／OUT／INOUT、游标、粘贴解析／NULL、布局与分隔条自动化也通过。

DBX 插件中心实际显示 local.kingbase.debugger v0.8.0、兼容；原“示例调试连接”非密码配置完整保留。实际连接窗口正确显示“记住密码（macOS 钥匙串）”与“尚未保存密码”，可正常勾选，字段与底部操作完整可见。最终停留在这个窗口，记住密码已勾选，密码仍为空，等待用户在本地输入一次。真实数据库密码尚未保存，本轮未建立实库连接。

Java 11 编译、官方 manifest schema、运行包全部 13 个文件的 checksums、源码与包及安装目录与包一致性通过。新增 helper 的可执行权限在安装后保留。包内不含 JDBC 测试替身、专有 Kingbase JDBC 或凭据。

安装包 SHA-256：`0e0c8bae39c263d91f13c200bc3e09dd1b2cecb737db41d6f8d6472ec0ecb17d`。

## 0.7.1 配置对齐与面板调整：自动化、安装与实际拖动已通过

验证日期：2026-11-04。延续既有 DBX 原生风格，只调整插件界面；后端仅更新版本号。配置栏统一标签高度、间隔与控件高度，搜索结果计数不再影响相邻按钮的对齐；工作台较窄时搜索与对象选择移到第二行。

新增三个独立分隔条，支持源码／右侧面板宽度、变量／调用栈高度、工作区／输出高度调整。指针捕获、最小尺寸、窗口缩小后的边界、键盘微调、双击与 Enter 恢复、取消和窗口关闭清理均由布局自动化覆盖。长参数名保留原始完整文本，变量与调用栈表格按内容宽度展开并在面板内横向滚动；参数窗口名称完整换行。布局测试还检查调试按钮不会被分隔条事件拦截。

原有搜索、参数、IN／OUT／INOUT、游标与调试生命周期 UI 测试、粘贴解析与导入 UI 测试、插件连接管理与入口测试均通过。Java 11 编译通过；本轮没有更改后端调试逻辑，未重新执行后端 132 项断言或实库探针。未执行业务过程，未操作 DBeaver。

DBX 插件中心实际显示 local.kingbase.debugger v0.7.1、兼容。更新后工作台配置栏的输入框与按钮基线对齐。原生界面内实测：竖分隔条经鼠标拖动后，右侧占比由 36% 扩大到 54%；变量／调用栈分隔条由 50% 拖至 69%；输出分隔条由 72% 拖至 58%。双击可分别恢复 50% 和 72%，键盘左右与 Shift 加方向键也生效。最终保留源码 56%、右侧 44% 的布局。上述比例为工作区占比，并非数据库数据。

官方 manifest schema、运行包全部 12 个文件的 checksums、源码与运行包、安装目录与运行包一致性校验通过，新增 layout.js 已纳入校验。安装包不含测试替身、专有 JDBC 或凭据。连接非密码配置仍保留；更新前关闭工作台清除了仅在内存中的密码，最终工作台处于等待连接，本轮布局检查不需要连接数据库。

安装包 SHA-256：`0721986b29d982cf399ad55d4b510f97da71f6011eceb6940d70010ade6f7c67`。

## 0.7.0 插件内连接：自动化、安装与实库迁移已通过

验证日期：2026-11-04。按用户选定的第二种方案实现：顶部入口保留，连接管理移至插件内；manifest 移除 connection-provider，不修改 DBX 主程序。实际 DBX 安装显示 local.kingbase.debugger v0.7.0、兼容；顶部打开新单例工作台与连接窗口，已填写并保存原环境的非密码配置。

后端共 132 项断言通过，新增覆盖：私有 ID、字段白名单和密码不持久化、重启可读、测试清理、不重复连接、连接中禁止编辑／删除、调试中禁止切换、切换失败保留原连接、成功切换清理、显式断开、关闭通知先到的连接取消、仅删除指定配置、拒绝宿主连接 ID、损坏配置原样保留。连接管理测试不执行任何存储过程。

私有连接 UI 自动化通过：配置增删改、密码不进入保存 RPC、测试、连接、重复提交保护、重复顶部入口保持参数草稿、已连接对象直接返回不重连、调试中禁用管理、断开清理、删除确认／取消、失败重试、关闭时建立连接的清理。界面不再使用宿主连接列表、保存凭据或重连 API。原搜索、参数、IN／OUT／INOUT、游标、NULL／粘贴解析和生命周期 UI 回归均通过。

官方 manifest schema、全部 11 个运行文件 checksums、源码与运行包、安装目录与包逐字节一致性通过。运行包没有测试替身或专有 JDBC。实际插件配置文件仅含 id、name、host、port、database、username、jdbcJar、timeout 八个白名单字段。界面截图确认两列连接表单和底部操作完整显示，沿用原生设计。

用户在新插件窗口本地输入密码并连接成功。2026-11-04 12:10 至 12:12（Asia/Shanghai），仅用独立过程 demo_user.dbx_debug_probe_20261103（OID [对象 OID 已省略]）实库验证，输入 p_seed=7。执行／控制 PID 为 [会话 PID 已省略]／[会话 PID 已省略]：入口第 5 行暂停；单步到第 6 行，v_total=7；第 9 行增加断点并继续，v_total=34，调用栈帧 0、行 9 正确。暂停期间“连接管理”禁用，重复点击顶部入口后状态、参数与 PID 均保留。继续完成后输出 intermediate=17、result=34。

新连接验证成功后，通过 DBX 的连接菜单删除原左侧“示例调试连接”配置；实际左侧仅剩原有普通连接“示例连接 A、示例连接 B、示例连接 C”。插件内部同名私有配置仍保留。删除后重新开始同一探针，参数草稿仍为 7，新执行／控制 PID 为 [会话 PID 已省略]／[会话 PID 已省略]；入口第 5 行暂停成功，再点击停止，状态到“已停止”。没有执行业务过程，没有控制 DBeaver，没有读取或迁移宿主已保存密码。

通过 DBX 官方 CLI 的普通连接执行只读 sys_stat_activity 查询，限定上述四个测试 PID，返回 0 行，确认两轮专用会话均已清理。最终保留顶部调试工作台及其私有连接会话配置，当前无正在运行的目标；再次开始可建立新物理连接。密码仅存于当前会话内存，关闭工作台、显式断开或重启后需重新输入。

安装包 SHA-256：`f8a618686a5c302e4ffafc172584f52386a9967a4537d0db5939272ccd980b01`。

## 0.6.0 顶部快捷入口：已通过

验证日期：2026-11-04。DBX `v0.6.65-beta.20261103.1` 安装并显示插件 `local.kingbase.debugger v0.6.0`、兼容。使用 command／appToolbar 扩展与 `host.workbench` 接口，未修改 DBX 主程序。菜单分组使用宿主白名单 `primary`；仅 JSON schema 校验不能验证这一语义限制，已在实际宿主安装验证。

DBX 全局快捷入口位置已设为「更新按钮左侧（浮动）」，显示数量 3。实际顶部出现「金仓调试」按钮与线性调试图标。点击后显示本插件已保存的「示例调试连接 · demo_db · 未连接」，点击「连接并打开调试」通过 DBX 原有凭据流程连接，进入真实工作台并加载 demo_user 目录；控制 PID [会话 PID 已省略]、执行 PID [会话 PID 已省略]。

重新导入 32 参数调用文本并保存，29 IN／3 OUT、9 项非空 IN 和 20 项空 IN 的 NULL 语义保持。再次点击顶部入口后，临时入口页自动关闭并回到同一工作台：搜索目标 demo_import_probe、已保存参数和两个 PID 均保留，未产生重复工作台或重复连接。本轮仅连接预检查、目录／源码读取和参数导入，没有调用 debug/start 或执行业务过程；未操作 DBeaver，未读取密码。

本地 launcher 自动化覆盖：未关联连接的启动分支、仅本插件连接摘要、唯一已连接对象自动进入、多已连接对象选择、未连接对象显式连接、二次读取状态避免重连、重复点击保护、打开失败可重试、删除对象、过期刷新与关闭后响应、入口不执行 SQL。多连接选择和异常分支使用宿主 API 模拟测试，实机只有一个已保存调试连接。

既有 UI、导入 UI 与解析器测试通过；Java 后端 115 项断言通过。官方 schema 校验、全部 11 个运行文件校验和、安装目录与交付包一致性通过，包含 launcher.js 与 SVG 图标，不含测试替身或专有 JDBC 驱动。截图检查确认图标位于顶部更新按钮左侧，原工作台布局正常。

安装包 SHA-256：`ec671fc862676f35d2a87972c69a5f1f0f47b32d194421b2b81ad8949944f09e`。

## 0.5.1 粘贴空字符串归 NULL：已通过

验证日期：2026-11-04。修正 0.5.0 导入 `''` 后输入框为空但 NULL 未勾选的行为。普通、N／q 引用的零长度字符串统一解析为 NULL；声明初值、DEFAULT、赋值、变量传递及直接／命名实参都使用此规则。非空文本（含空格）、数字 0 和布尔 false 原样保留。参数窗口手动录入的既有交互不变。

解析器与导入 UI 自动化通过：32 参数合成示例中的 20 项空 IN 均为 NULL；其余 9 项非空 IN 保留原值，3 OUT 固定 NULL。覆盖保存、重新打开、显式确认调试后的 RPC 参数数组，空项全部为 null，导入和保存本身不执行。原有搜索、参数、游标和生命周期 UI 回归通过。后端只有版本号变化，Java 11 编译通过，未为此次修复重跑无关实库调试。

实际 DBX 已安装并显示兼容的 0.5.1，使用 32 参数调用文本重新导入成功；input_text_10、input_text_11 等空项及截图中的 input_text_15、input_text_16、input_text_17、input_text_18、input_text_19、input_text_20、input_text_21、input_text_22、input_text_23 均显示 NULL 已勾选，demo_user／DEMO／中文／日期等非空输入仍保留。本轮只做导入检查，没有执行业务过程。

官方 manifest schema、运行包校验表和安装文件／源码一致性校验通过。安装包 SHA-256：`00cf0731c34e1222f5bf367e4cdecf1048ab0da7258688cd178d22ff47e40ae9`。

## 0.5.0 NULL 默认与调用文本导入：已通过

验证日期：2026-11-04，DBX `v0.6.65-beta.20261103.1`、macOS arm64、KingbaseES `V008R006C007B0024` Oracle 模式、plsql_pldbgapi 1.3。插件中心实测安装并显示 `local.kingbase.debugger v0.5.0`、兼容。未修改 DBX 主程序，未操作 DBeaver，未读取密码。

本版只调整参数录入和新增本地文本解析器，调试后端除版本号外保持原实现。首次选择独立探针后，实际界面中 IN p_seed、四个 OUT 游标、INOUT p_total 全部勾选 NULL；IN／INOUT 输入仍可编辑。向 p_seed 粘贴 7 后 NULL 自动取消，清空后自动恢复 NULL。OUT 游标的输入和复选框始终禁用。

32 参数调用文本（公开样例已改为合成数据）在实际 DBX 工作台导入成功。目录只读查询确认 `demo_user.demo_import_probe` OID [对象 OID 已省略]，真实签名 29 IN／3 OUT。导入显示 `demo_user`、`DEMO`、中文“测试日期”、日期 2000-01-01／2000-01-31 及其余输入；`''` 保持空字符串且 NULL 未勾选。第 30、31、32 行按数据库签名显示 OUT output_code/numeric、OUT output_message/varchar、OUT output_cursor/包内游标域，均只读 NULL；局部 list 正确按位置映射到 output_cursor。窗口提示两项 OUT 文本初值已归 NULL、两条 DBMS_OUTPUT.PUT_LINE 仅识别。该业务过程只做目录读取与导入检查，本轮没有执行。

独立对象 `demo_user.dbx_debug_cursor_out_probe_20261104` OID [对象 OID 已省略] 使用新增 `sql/cursor-import-call-block-20261104.sql` 的 DECLARE 调用块实测：未赋值的四个游标局部变量自动 NULL；v_seed=7、v_total=20 映射为 p_seed 和 INOUT p_total。解析和保存后工作台仍为“就绪”，没有执行记录。点击开始并确认后，入口第 3 行暂停，变量 p_seed=7、p_total=20；继续后 p_total=27。底部显示 3 个结果集，主游标 1 行 7 列、Seed=7、大整数 9223372036854775807、NULL、原样文本及重复列名；空游标保留表头，NULL 游标不生成表格。执行／控制 PID [会话 PID 已省略]／[会话 PID 已省略]，结束后独立查询 sys_stat_activity 返回 0 行。

自动化通过：后端 115 项断言；原有搜索、参数和游标 UI 生命周期回归；新增独立解析器测试和宿主替身导入测试。覆盖32 参数合成示例、字符串中逗号／分号／BEGIN／END／括号、转义单引号、N／q 字符串、注释、未赋值 NULL、空字符串、数字精度、位置与命名参数、OUT 强制 NULL、未知变量／表达式／控制流／多次调用拒绝、完整名称匹配、重载必须明确选择、失败保留原选择、编辑／取消／连接变更后的迟到响应失效，以及导入不得调用 debug/start。自动化中的重载与错误分支使用宿主替身，本轮未新增实库重载对象。

界面沿用原生风格与既有布局。实际 32 行窗口可滚动查看末尾 OUT 参数，保存／取消按钮保留在底部。官方 manifest schema、包校验表、安装文件与源码／包的 UI 及后端 JAR 一致性均通过。新增 call-import.js 已纳入包完整性校验；运行包不含测试替身、专有 Kingbase JDBC 或凭据。

0.5.0 安装包 SHA-256：`8af42bdd9a749928d88d896cb6fbcfbfe9f191593b11c80fc1b385aae838220d`。

文本导入是受限的参数数据解析：不执行粘贴块，不将匿名块设为断点目标，不求值表达式；不支持控制流、其他 SQL、异常块、多次目标调用、调用后赋值、包内入口或省略参数。DBMS_OUTPUT.PUT_LINE 只识别并提示，原块打印不执行，返回参数通过工作台显示。每次最多 256 Ki 字符。游标、事务及数据库扩展的其他限制延续 0.4.0，下文保留历史验证。

## 0.4.0 OUT 游标：已通过

验证日期：2026-11-04。同一 DBX／Kingbase 环境；插件中心显示 `local.kingbase.debugger 0.4.0`、兼容。按用户说明，游标参数只开放 OUT；INOUT 继续支持普通标量初始值。没有修改 DBX 主程序，也未操作 DBeaver。使用 DBX 官方 CLI 创建独立探针，通过原有保存连接在插件工作台实测；未提取密码。

只读目录实测：`demo_user."demo_cursor.t_cursor"` 的 OID 为 [对象 OID 已省略]、typtype 为 d、typbasetype 为 1790；1790 对应 `pg_catalog.refcursor`。插件沿真实底层类型递归解析，保留界面中的包内类型名称，不根据名字包含 cursor 进行猜测。

| 独立对象 | 输入与断点 | 实库结果 |
| --- | --- | --- |
| `demo_user.dbx_debug_cursor_out_probe_20261104`，OID [对象 OID 已省略] | p_seed=7，四个 OUT 游标自动 NULL，普通 INOUT p_total=20；入口第 3 行，单步执行 OPEN 后到第 7 行 | output_cursor：1 行、7 列；p_empty：0 行、1 列；p_null：NULL；p_second：1 行、cursor-out-ok；p_total：27 |
| `demo_user.dbx_debug_cursor_func_20261104`，OID [对象 OID 已省略] | 无参数，RETURN 为同一包内游标类型；第 4 行入口暂停后继续 | RETURN：1 行、1 列，cursor-return-ok |

工作台实际显示 `Seed=7`、bigint `9223372036854775807`、SQL NULL 和文本 `<img src=x>`；后者以文字显示。列 `Same`、`Same`、`same` 按位置和大小写保留。底部自动切换结果集，可在三个非 NULL 游标间切换；空结果仍显示 EmptyColumn/int4 表头。NULL 游标在右侧显示 NULL，不会被误显示成一个空结果集。

首轮成功过程控制／目标 PID 为 [会话 PID 已省略]／[会话 PID 已省略]，函数为 [会话 PID 已省略]／[会话 PID 已省略]；完成后独立查询 `sys_stat_activity` 已确认这四个 PID 均不存在，结果仍可在工作台切换查看。类型识别和游标获取在用户提供的官方 JDBC 文件上实测通过。

开发期间曾额外测试 INOUT 游标，驱动的 setNull(Types.REF_CURSOR) 返回 SQLSTATE 07006。用户随后明确游标只会是 OUT，最终实现仅注册 OUT 游标，无游标输入绑定。早期失败留下控制 PID [会话 PID 已省略] 阻塞于 wait_for_target；经 PID、数据库、用户名、应用名和 backend_start 精确核对后，只终止这一条本插件测试会话。最终代码改为 JDBC 注册和绑定成功后再启动控制等待，并在清理时先发服务端 cancel，再 abort，保留 3 秒中止兜底。未清理或终止其他会话。

后端 115 项断言通过，新增覆盖真实域元数据解析、OUT 只注册输出、多个／空／NULL 游标、函数 RETURN、重复列名和大小写、NULL／大整数文本、同事务读取与关闭顺序、完成后获取结果、过期 generation、读取异常回滚、取消无成功输出、注册失败不启动控制等待、2000 行和 256 列上限、总字符上限。UI 自动化覆盖游标 NULL 固定、表格切换、空结果、重复列名、安全文本、精度、截断状态、迟到结果不得覆盖新选择、新一轮清空旧结果及原有搜索、参数和调试流程。自动化使用 JDBC／宿主桥替身。

结果保留上限：每游标 2000 行、256 列，一次调用全部输出共用约 2Mi 字符。达到行或字符上限显示已截断；列数超限明确失败。行数截断和大小限制由自动化覆盖，本轮未用真实大结果集执行压力测试。当前 JDBC 获取 refcursor 时可能先读取全部数据，因此插件限制不等同服务器分页或驱动内存上限。含游标调用在执行连接的同一事务内读取、关闭游标后提交；异常回滚，停止取消并中止专用连接。过程自行提交过的修改不保证撤销。

官方 manifest schema、包校验表完整覆盖、安装文件与最终源码／包逐字节比对均已通过。安装包 SHA-256：`59a286c9fe7630d13637123f598b53121dcdda08f6ab1937c4f51467b2703236`。包内只含启动器、Java 后端、Gson 与 UI；不含测试驱动、专有 Kingbase JDBC 或凭据。

最终安装包复验：控制／目标 PID [会话 PID 已省略]／[会话 PID 已省略]，p_seed 输入 invalid-integer 后发生 JDBC 参数绑定错误，未执行目标；独立 sys_stat_activity 查询返回 0 行。随后改回 p_seed=7、p_total=20，使用新的控制／目标 PID [会话 PID 已省略]／[会话 PID 已省略]，入口第 3 行暂停，继续后显示 3 个结果集，output_cursor 为 1 行 7 列、p_total=27；工作台视觉检查通过，游标标签和选择器不换行。最终上述十个历史／本轮 PID 的独立查询返回 0 行。

暂停时扩展 get_variables 对此混合包游标签名曾返回名称与变量位置偏移（例如两个 p_total，且包游标值出现在 p_empty 名下）；插件保持扩展原始结果，本版未修正这项数据库扩展元数据差异。完成后的输出使用目录声明顺序与 JDBC 位置映射，已核对 output_cursor、p_empty、p_null、p_second、p_total 均正确。

下面版本内容为历史记录，游标能力与限制以上述 0.4.0 记录为准。


## 0.3.0 IN／OUT／INOUT：已通过

验证日期：2026-11-04。环境为 DBX `v0.6.65-beta.20261103.1`、macOS arm64、KingbaseES `V008R006C007B0024` Oracle 兼容模式、plsql_pldbgapi 1.3，JDBC 为本机 `kingbase8-8.6.0.jar`。DBX 插件中心显示已安装、兼容 `0.3.0`。没有修改 DBX 主程序。

元数据使用 `proallargtypes`、`proargmodes`、`proargnames` 的声明顺序；该 Kingbase 版本的过程 `proargtypes` 也可能包含 OUT，因此不以 PostgreSQL 的纯输入数量假设构造参数。纯 OUT 只注册输出，默认 NULL；INOUT 同时绑定初值和注册输出。数据库调用采用 CallableStatement。金仓官方 JDBC 指南 `jdbc-11.html` 的 CallableStatement 示例使用了相同的注册方式。

实库仅执行不访问任何业务表的独立探针。通过 DBX 官方 CLI 使用已保存的“示例连接 A”连接创建，使用插件保存的“示例调试连接”连接完成断点验证；未提取密码。

| 验证对象 | 输入 | 入口与执行 | 完成结果 |
| --- | --- | --- | --- |
| `demo_user.dbx_debug_modes_probe_20261104`，OID [对象 OID 已省略] | 声明顺序 OUT／IN／INOUT／OUT；`NULL, 7, 20, NULL` | 入口第 3 行暂停，OUT 为 NULL，IN 为 7，INOUT 为 20；单步到第 4 行后 OUT 为 14 | OUT `p_result=14`，INOUT `p_total=27`，OUT `p_note=modes-ok` |
| 同一过程再次运行 | `NULL, 7, NULL, NULL` | 参数窗口保留上次初值 20；勾选 INOUT 的 NULL 后，入口确认其为 NULL；新建两条物理连接 | `p_result=14`，`p_total=7`，`p_note=modes-ok` |
| `demo_user.dbx_debug_modes_func_20261104`，OID [对象 OID 已省略] | `p_seed=7`，OUT 自动 NULL，INOUT 初值 20 | 第 3 行入口暂停，再继续 | `RETURN=48`，OUT `p_result=21`，INOUT `p_total=27` |

本轮过程的控制／目标 PID 分别为 [会话 PID 已省略]／[会话 PID 已省略]、[会话 PID 已省略]／[会话 PID 已省略]；函数为 [会话 PID 已省略]／[会话 PID 已省略]。结束后从 `sys_stat_activity` 查询这六个 PID，返回 0 行。返回值在完成后保留在右侧“变量与参数”表格，数据库会话已经关闭。

后端自动化 72 项断言通过：混排元数据、名称与类型位置、OUT 不绑定输入、INOUT 初值和 NULL、JDBC 类型注册、函数 RETURN 偏移、结果 NULL 与大整数精度、错误／停止清理，以及原有并发和过期会话保护。UI 自动化通过：方向列、只读 OUT、焦点跳过、NULL 强制、草稿隔离、保存不执行、返回值显示、初值不被返回值覆盖、重新运行清除旧值，以及搜索／调试生命周期回归。

官方 manifest schema 校验通过；安装包全部文件的 SHA-256 与 checksums.json 一致。安装目录的 UI 和后端 JAR 与本次交付包逐字节一致；源 manifest 经官方 CLI 格式化后语义一致。

0.3.0 安装包 SHA-256：`9ea8ee29d807523b2d50aa522f41109d7a9cf9fb4af9a27ea6c6910b147b66fa`。

实库执行覆盖 integer、varchar 和标量 integer RETURN。其余支持的内置标量类型尚未在本轮逐种实库验证；游标、LOB、数组、复合／record、自定义类型、TABLE、VARIADIC 和包成员未加入本版。纯 IN 的原有调用路径保留。下面各版本记录为历史结果，0.2.0 中的 OUT／INOUT 限制已由 0.3.0 替代。

## 0.2.0 名称搜索与参数窗口：已通过

本版继续使用官方 DBX `v0.6.65-beta.20261103.1`；只更新 `local.kingbase.debugger`，没有修改 DBX 主程序。DBX 插件中心显示 `v0.2.0`、兼容，已通过保存的“示例调试连接”连接打开实际工作台。

- 名称搜索在数据库目录中执行，模式名和搜索词使用 PreparedStatement 绑定。使用忽略大小写的名称包含匹配，`%` 和 `_` 按普通字符处理。每次返回最多 500 条，额外读取一条判断是否截断；空搜索不增加空字符串谓词，兼容 Oracle 模式的空串行为。
- 实库输入大写 `DBX_DEBUG_PROBE`，匹配小写 `demo_user.dbx_debug_probe_20261103(p_seed integer)`，唯一结果自动选中，加载源码和参数。
- 参数窗口实库显示一行：序号 `1`、名称 `p_seed`、类型 `integer`、值输入框、NULL 选择。勾选 NULL 后输入框禁用；随后取消 NULL，输入 `7`，点击“保存参数”，工作台保持就绪，输出无执行记录。
- 点击工作台“开始调试”重新打开窗口，参数 `7` 保留；确认后才开始执行。入口第 5 行，变量 `p_seed=7`、`v_total=0`。本次执行 PID `[会话 PID 已省略]`、控制 PID `[会话 PID 已省略]`，均为本轮独立物理连接。
- 单步到第 6 行时 `v_total=7`。设置第 9 行断点并继续后暂停在第 9 行，`v_total=34`、帧 `0`。删除该断点后继续，`17:42:11` 显示执行完成，输出 `dbx probe: intermediate=17`、`dbx probe: result=34`，PID 标识为已关闭。

自动化：42 项后台断言通过；UI 测试覆盖名称搜索、过期搜索响应、无匹配、截断提示、名称与类型显示、参数顺序、保存不执行、取消丢弃、按 OID 隔离草稿、NULL／空字符串区别、原始空白和引号、大整数精度、无参数对象、不支持参数模式、源码和参数名文本转义，以及原有调试生命周期与关闭清理。后台与 UI 自动化使用替身；仅上述独立探针为本轮实库执行。

官方 manifest schema 校验、官方 CLI 打包、包文件校验表完整覆盖均通过；无测试驱动或专有 Kingbase JDBC 类。安装目录中的 app.js、index.html、style.css 和调试 JAR 与最终安装包及构建逐字节一致；manifest 内容一致（打包格式化导致文本排版不同）。

0.2.0 安装包 SHA-256：`44572ebab4a29917f389e121c2d8a66018d3e70b0d5b932c576b6e6931ff246b`。

本轮尚未实库执行 NULL、无参数函数或多参数对象；上述值组合和函数条目由自动化覆盖。OUT／INOUT 等执行能力仍未加入，选中后提示并禁用开始。空字符串是否被服务器归为 NULL，遵循实际 Oracle 兼容模式。

下文保留 0.1.0 的历史验证；其中 JSON 数组录入和初始 500 条目录范围的界面限制，已由 0.2.0 的逐项窗口和数据库名称搜索取代。

## 实库 SQL 调试链路：已通过

环境：KingbaseES `V008R006C007B0024`，Oracle 兼容模式，数据库 `demo_db`，用户 `demo_user`，已安装扩展 `plsql_pldbgapi 1.3`。

在 DBeaver 的独立测试脚本中执行此前创建的控制过程与探针过程。只操作以下测试对象：

- `demo_user.dbx_debug_probe_20261103(p_seed integer)`，OID `[对象 OID 已省略]`。
- `demo_user.dbx_debug_harness_20261103()`，负责创建监听、入口暂停、变量、调用栈、三次单步和终止。

独立控制脚本的服务器输出由界面直接观察：

```text
DBX_TEST CONTROL_PID=[会话 PID 已省略] HANDLE=1 OID=[对象 OID 已省略] ARMED=t
DBX_TEST TARGET_PID=[会话 PID 已省略]
DBX_TEST INITIAL=([对象 OID 已省略],5,"dbx_debug_probe_20261103(integer)")
DBX_TEST BEFORE_VARIABLES=(v_total,L,3,t,f,f,23,0)
(p_seed,A,0,t,f,f,23,7)
DBX_TEST STACK=(0,"dbx_debug_probe_20261103(integer)",[对象 OID 已省略],5,p_seed=7)
DBX_TEST STEP_1 POSITION=([对象 OID 已省略],6,"dbx_debug_probe_20261103(integer)")
DBX_TEST STEP_1 VARIABLES=(v_total,L,3,t,f,f,23,7)
(p_seed,A,0,t,f,f,23,7)
DBX_TEST STEP_2 POSITION=([对象 OID 已省略],7,"dbx_debug_probe_20261103(integer)")
DBX_TEST STEP_2 VARIABLES=(v_total,L,3,t,f,f,23,17)
(p_seed,A,0,t,f,f,23,7)
DBX_TEST STEP_3 POSITION=([对象 OID 已省略],8,"dbx_debug_probe_20261103(integer)")
DBX_TEST STEP_3 VARIABLES=(v_total,L,3,t,f,f,23,17)
(p_seed,A,0,t,f,f,23,7)
DBX_TEST ABORT_SENT
```

独立目标脚本输出 `dbx probe: intermediate=17`。这些 PID 和 handle 是历史记录，不可复用。

## DBX 普通查询连接行为：已观察

DBX 原“示例连接 A”保存的 database 字段为空，缓存 currentDatabase 为 demo_db。已通过 DBX GUI 将真实 database 保存为 demo_db，基础查询与超时函数随后成功。

在同一个普通查询标签页，创建监听时 PID 为 `[会话 PID 已省略]`、handle 为 1；执行设置全局断点时返回 invalid session handle，再查询 PID 已变为 `[会话 PID 已省略]`。这证明本次普通查询路径没有保持该控制会话，不能用于跨请求持有调试句柄。不能由此推论所有 DBX 版本或全部查询路径都会更换 PID。

## 过程和参数目录：已用实库核对

独立验证脚本验证发现 `sys_format_type(oid, unknown)` 不存在。插件已移除该函数依赖。

独立验证脚本的只读目录查询返回：OID `[对象 OID 已省略]`、prokind `p`、language `plsql`、参数 `p_seed integer`、input_oids `23`、argument_modes NULL、input_count `1`、type_schema `pg_catalog`。插件使用 `sys_type` 加 `sys_namespace` 查询类型并逐个引用标识符。

## 插件自动化：已通过

- Java 11 `--release 11` 编译。
- 31 项后台断言：协议协商、身份、解析错误、独立连接、源码空行、绑定参数、类型标识符引用、目标端超时、过期 generation、断点操作、单步、continue 阻塞后目标完成、重新连接、秘密不回传、停止与异常清理、设置入口断点失败时不执行目标。
- jsdom 界面测试：离线预览、加载过程、参数 JSON、入口暂停、源码行号与断点、变量/源码文本转义、单步禁用状态、旧 revision、连接隔离、停止、pagehide 通知。
- 官方 DBX manifest schema（draft 2020-12）校验。
- 官方 `@dbx-app/plugin-cli@0.1.9` 成功打包 darwin-arm64 `.dbxp`。
- 解包校验 checksums.json 精确覆盖全部包文件。
- 解包后的实际 Go 启动器成功启动本机 JVM、完成 plugin/initialize 并返回预期身份；无连接时返回规定错误，EOF 后退出。

后台测试使用 JDBC 替身，UI 测试使用宿主桥替身；这些结果不等于插件在 DBX 内已连接实库成功。

## DBX 插件实库联调：核心链路已通过

用户授权后，通过 DBX GUI 开启“允许安装未签名开发包”，安装 `local.kingbase.debugger 0.1.0`。DBX 识别为兼容插件；连接类型与工作台均可打开。

用户在 DBX 本地输入密码，保存“示例调试连接”连接。未读取或绕过本机加密凭据。双击此连接后，工作台成功通过宿主桥加载 500 个对象，实际 JDBC 连接数据库 `demo_db`、扩展 `plsql_pldbgapi 1.3`。

只调用 `demo_user.dbx_debug_probe_20261103(p_seed integer)`，OID `[对象 OID 已省略]`，输入 `[7]`。实测记录：

| 操作 | 数据库／工作台实际结果 |
| --- | --- |
| 首轮专用会话 | 执行 PID `[会话 PID 已省略]`，控制 PID `[会话 PID 已省略]`，不同物理会话 |
| 开始 | 入口暂停在第 5 行；`p_seed=7`，`v_total=0` |
| 单步跳过 | 暂停在第 6 行；`v_total=7` |
| 单步进入 | 暂停在第 7 行；随后继续计算验证 |
| 添加行断点 | 第 9 行按钮变为“删除断点”，由服务器断点列表确认 |
| 继续到断点 | 暂停在第 9 行；`v_total=34`，`p_seed=7` |
| 删除行断点 | 第 9 行按钮恢复“设置断点” |
| 继续完成 | 状态“执行完成”；输出 `dbx probe: intermediate=17`、`dbx probe: result=34` |
| 第二轮开始 | 新执行 PID `[会话 PID 已省略]`，新控制 PID `[会话 PID 已省略]`；重新入口暂停 |
| 暂停后停止 | 状态依次为“停止中”“已停止”；目标与控制连接进入清理流程 |

首轮调用栈正确显示对象与当前行号，但帧序号显示 NULL。仅加入 `callcount` 字段名仍未能匹配实库，最终修订版按 Kingbase 手册规定的 frame 元组第一列映射真实帧深度为 `frame`，且不再对相同 revision 的轮询状态重建源码控件；未关联连接时显示双击连接的明确提示，终态占位文案和 PID 标识也已修正。宿主的 workbench close 握手会请求停止活跃调试，pagehide 作为补充。

更新时 DBX 要求先关闭“示例调试连接”。已按要求断开后重新安装修订包。首次重连出现 SQLSTATE `08001`，同机 TCP 探测可达，使用同一保存配置重试后成功；没有修改密码或其他连接参数。根因未确定，不能将其视为已经定位的缺陷。重连后实际执行 PID `[会话 PID 已省略]`、控制 PID `[会话 PID 已省略]`。

0.1.0 交付包 SHA-256：`2548521abb7c0677d9775e1852dbe5a1a001c9500c3f75c8f4126a1158a46828`。安装目录中的 app.js、index.html、后端 JAR 均与最终构建逐字节一致；包校验表精确覆盖全部文件，没有测试替身或专有 Kingbase JDBC 类。

最终包实库复验：执行 PID `[会话 PID 已省略]`、控制 PID `[会话 PID 已省略]`；入口第 5 行，帧序号 `0`；单步到第 6 行时 `v_total=7`；添加第 9 行断点并继续后 `v_total=34`、帧序号 `0`、当前行 9；删除断点后继续，17:01:45 显示“执行完成”，输出 intermediate=17、result=34，底部 PID 标识“已关闭”。工作台保留该完成结果，可以再次开始。

关闭活跃工作台后已成功重新建立会话，但该重连本身也会清理旧会话；本次没有通过独立会话观测来单独证明关闭握手的清理时刻。关闭握手和 pagehide 的请求行为已通过 UI 自动化覆盖。

这些 PID、监听句柄仅属于各自测试轮次，不能复用。

## 尚未覆盖的验收项

- NULL 参数与函数入口的真实 JDBC 绑定、重载和嵌套过程单步进入（本次单步进入命令只在无子调用的探针内验证）。
- SSH／代理 endpoint、TLS 选项、网络中断、过程主动抛错及超时实库行为。
- 500 个对象上限以外的检索；复杂类型、包、OUT／INOUT、触发器入口本来就不在首版范围。
- 数据库端会话清理尚未通过独立 `sys_stat_activity` 查询复核；自动化检查了真实连接对象的 abort／close 调用，实库通过目标返回和下一轮新 PID 验证生命周期。

## 依据

DBX 官方仓库 `https://github.com/t8y2/dbx`，读取 commit `5b004b973dd2be2d8b327cb50864cd648445056b` 的插件 README、manifest schema、SDK 和 CLI/packager 源码。实际打包使用 npm 发布的官方 CLI 0.1.9。

Kingbase 手册：`https://help.kingbase.com.cn/v8.6.7.24/development/sql-plsql/ref-extended-plug-in/plsql_pldbgapi.html`。网页描述扩展 1.2，用户实例实际为 1.3；实现只采用用户已确认存在的接口。手册说明 set_connection_timeout、set_operation_timeout 仅在目标端执行；continue 可在应用完成后继续挂起。
