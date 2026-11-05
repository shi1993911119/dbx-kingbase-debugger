# 0.9.3 — 首次市场候选版

- 发布者：`shi1993911119`；正式插件 ID：`io.github.shi1993911119.kingbase-debugger`。
- 从清理后的源码重新构建 macOS ARM64 和 Windows x64 未签名候选包，补齐 MIT、Gson 和 Go 许可证。
- 构建使用临时 staging，避免残留包与其他平台 helper 混入；增加包内文件、源码资源、校验和、架构、Java 11 字节码和凭据扫描验证。
- 增加市场元数据、依赖来源、权限与原生行为说明、候选发布工作流和可重建说明。
- 保留 0.9.2 的沙箱按钮修复、DataGrip 风格快捷键、断点、单步、调用栈、变量及 OUT 游标能力。

需要 DBX `>=0.6.65-beta.20261103.1`、本机 Java 11+、用户自备的官方 Kingbase JDBC 驱动，以及带有 `plsql_pldbgapi` 的 KingbaseES Oracle 兼容模式。界面为中文。

**迁移：** 此 ID 与旧 `local.kingbase.debugger` 开发版独立。旧连接和系统凭据不会自动迁移；请在本机重新配置一次。后续相同正式 ID 的升级保留配置。

候选包尚未获得 DBX Store 签名，手动测试需允许未签名开发包。正式市场安装需等待维护者审核并签名。

Windows x64 在 Windows 11 ARM64 的 x64 兼容环境验证；实体 Intel/AMD Windows、Windows 10 与 Windows DBX 内完整实库调试仍待验证。历史实库联调记录来自 macOS；本次回归使用合成数据，不访问业务数据库。详见 `docs/VALIDATION.md`。
